'use strict';
var obsidian = require('obsidian');

const SCENE_RE        = /^(?:T\d+(?:[+\-]T\d+)*-)?S(?:\d[\d.]*)?(?:\s|$)/;
const TRACKER_VIEW_TYPE = 'ttrpg-tracker';

/* ── Legend data ─────────────────────────────────────────────────────────── */

const LEGEND_SECTIONS = [
    {
        title: 'Simboli principali',
        rows: [
            ['> Testo',              'Azione del personaggio'],
            ['? Domanda',            "Domanda all'oracolo"],
            ['d: Tiro => Esito',     'Meccaniche di gioco / tiro'],
            ['-> Risposta',          "Risposta dell'oracolo"],
            ['=> Cosa succede',      'Conseguenza narrativa'],
        ]
    },
    {
        title: 'Scene',
        rows: [
            ['S Titolo',             'Scena (numero automatico)'],
            ['S5a Titolo',           'Flashback (numero fisso)'],
            ['S7.1 Titolo',          'Scena di montaggio'],
            ['T1-S Titolo',          'Scena thread parallelo'],
            ['T1+T2-S Titolo',       'Scena thread multipli'],
        ]
    },
    {
        title: 'Dialogo',
        rows: [
            ['N: Testo',             'NPC parla'],
            ['N(Alias): Testo',      'NPC con alias parla'],
            ['PC: Testo',            'Personaggio giocante parla'],
        ]
    },
    {
        title: 'Tag entità',
        rows: [
            ['[N:Nome]',             'NPC'],
            ['[N:Nome|attr|attr]',   'NPC con attributi'],
            ['[L:Luogo]',            'Luogo'],
            ['[E:Evento]',           'Evento'],
            ['[PC:Nome]',            'Personaggio giocante'],
            ['[Thread:Filo]',        'Filo narrativo'],
            ['[#N:Nome]',            'Riferimento NPC (backlink)'],
            ['[#L:Luogo]',           'Riferimento luogo (backlink)'],
        ]
    },
    {
        title: 'Tracciatori',
        rows: [
            ['[Clock:Nome X/Y]',     'Orologio con barra progresso'],
            ['[Track:Nome X/Y]',     'Tracciatore con barra progresso'],
            ['[Timer:Nome]',         'Timer'],
        ]
    },
    {
        title: 'Altro',
        rows: [
            ['gen: Nome',            'Generatore casuale'],
            ['tbl: Nome',            'Tabella'],
            ['(Testo)',              'Nota meta (fuori gioco)'],
            ['=> Success',           'Esito positivo (evidenziato)'],
            ['=> Fail',              'Esito negativo (evidenziato)'],
        ]
    },
    {
        title: 'Intestazione sessione',
        rows: [
            ['session: N',           'Numero sessione'],
            ['date: GG/MM/AAAA',     'Data'],
            ['pc: [PC:Nome]',        'Personaggio'],
            ['loc: [L:Luogo]',       'Luogo di partenza'],
            ['threads: [Thread:…]',  'Fili narrativi attivi'],
            ['goal: Obiettivo',      'Obiettivo della sessione'],
        ]
    },
    {
        title: 'Fine scena',
        rows: [
            ['--- Fine Scena N ---', 'Separatore di fine scena'],
            ['CF: X -> Y (Tipo)',    'Chaos Factor: valore precedente → nuovo'],
            ['threads: [Thread:…]',  'Fili narrativi attivi a fine scena'],
            ['npcs: [N:Nome]',       'NPC presenti/coinvolti nella scena'],
        ]
    },
];

/* ── Legend modal ────────────────────────────────────────────────────────── */

class LegendModal extends obsidian.Modal {
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('ttrpg-legend-modal');
        contentEl.createEl('h2', { text: 'Solo TTRPG Notation — Legenda' });
        for (const section of LEGEND_SECTIONS) {
            contentEl.createEl('h3', { text: section.title });
            const table = contentEl.createEl('table', { cls: 'ttrpg-legend-table' });
            const tbody = table.createEl('tbody');
            for (const [syntax, desc] of section.rows) {
                const tr = tbody.createEl('tr');
                tr.createEl('td', { cls: 'ttrpg-legend-syntax', text: syntax });
                tr.createEl('td', { cls: 'ttrpg-legend-desc',   text: desc });
            }
        }
    }
    onClose() { this.contentEl.empty(); }
}

/* ── Tracker sidebar view ────────────────────────────────────────────────── */

class TrackerView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this._refreshGen = 0;
    }

    getViewType()    { return TRACKER_VIEW_TYPE; }
    getDisplayText() { return 'TTRPG Tracker'; }
    getIcon()        { return 'tag'; }

    async onOpen() {
        // Refresh when user switches to a different file (folder may change)
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.refresh())
        );
        await this.refresh();
    }

    async refresh() {
        const gen = ++this._refreshGen;

        const el = this.contentEl;
        el.empty();
        el.addClass('ttrpg-tracker-view');

        // Header with refresh button
        const header = el.createDiv({ cls: 'ttrpg-tracker-header' });
        header.createEl('span', { text: 'TTRPG Tracker', cls: 'ttrpg-tracker-title' });
        const btn = header.createEl('button', { cls: 'ttrpg-tracker-refresh-btn', title: 'Aggiorna' });
        btn.append('↻');
        btn.addEventListener('click', () => this.refresh());

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || !activeFile.parent) {
            el.createEl('p', {
                text: 'Apri un file della campagna per vedere il tracker.',
                cls: 'ttrpg-tracker-empty'
            });
            return;
        }

        const folder = activeFile.parent;
        el.createDiv({ cls: 'ttrpg-tracker-folder', text: folder.name });

        let data;
        try {
            data = await collectFolderData(this.app.vault, folder);
        } catch (_) {
            if (gen !== this._refreshGen) return;
            el.createEl('p', { text: 'Errore durante la lettura dei file.', cls: 'ttrpg-tracker-empty' });
            return;
        }

        // A newer refresh has started — discard this one
        if (gen !== this._refreshGen) return;

        const empty = d => d.size === 0;

        this.renderTagSection(el,    'NPC',            data.npcs,      'ttrpg-tag-npc');
        this.renderTagSection(el,    'Luoghi',         data.locations, 'ttrpg-tag-location');
        this.renderSimpleSection(el, 'Personaggi',     data.pcs,       'ttrpg-tag-pc');
        this.renderSimpleSection(el, 'Fili narrativi', data.threads,   'ttrpg-tag-thread');
        this.renderSimpleSection(el, 'Eventi',         data.events,    'ttrpg-tag-event');
        this.renderBarSection(el,    'Clock',          data.clocks,    'ttrpg-tag-clock');
        this.renderBarSection(el,    'Track',          data.tracks,    'ttrpg-tag-track');
        this.renderSimpleSection(el, 'Timer',          data.timers,    'ttrpg-tag-timer');

        // If everything is empty
        const hasContent =
            data.npcs.size || data.locations.size || data.pcs.size ||
            data.threads.size || data.events.size || data.clocks.size ||
            data.tracks.size || data.timers.size;
        if (!hasContent) {
            el.createEl('p', {
                text: 'Nessun tag trovato nei file ttrpg di questa cartella.',
                cls: 'ttrpg-tracker-empty'
            });
        }
    }

    // Renders a section for Map<name, Set<attr>>
    renderTagSection(el, title, map, tagCls) {
        const entries = [...map.entries()].filter(([k]) => k);
        if (entries.length === 0) return;
        const section = el.createDiv({ cls: 'ttrpg-tracker-section' });
        section.createEl('h4', { text: title, cls: 'ttrpg-tracker-section-title' });
        const list = section.createDiv({ cls: 'ttrpg-tracker-list' });
        for (const [name, attrs] of entries) {
            const item = list.createDiv({ cls: 'ttrpg-tracker-item' });
            const badge = item.createEl('span', { cls: `ttrpg-tag ${tagCls}` });
            badge.append(name);
            for (const attr of attrs) {
                badge.createEl('span', { cls: 'ttrpg-tag-attr', text: attr });
            }
        }
    }

    // Renders a section for Set<name>
    renderSimpleSection(el, title, set, tagCls) {
        const entries = [...set].filter(Boolean);
        if (entries.length === 0) return;
        const section = el.createDiv({ cls: 'ttrpg-tracker-section' });
        section.createEl('h4', { text: title, cls: 'ttrpg-tracker-section-title' });
        const list = section.createDiv({ cls: 'ttrpg-tracker-list' });
        for (const name of entries) {
            const item = list.createDiv({ cls: 'ttrpg-tracker-item' });
            item.createEl('span', { cls: `ttrpg-tag ${tagCls}`, text: name });
        }
    }

    // Renders a section for Map<name, {cur, tot}> with progress bars
    renderBarSection(el, title, map, tagCls) {
        const entries = [...map.entries()].filter(([k]) => k);
        if (entries.length === 0) return;
        const section = el.createDiv({ cls: 'ttrpg-tracker-section' });
        section.createEl('h4', { text: title, cls: 'ttrpg-tracker-section-title' });
        const list = section.createDiv({ cls: 'ttrpg-tracker-list' });
        for (const [name, { cur, tot }] of entries) {
            const item = list.createDiv({ cls: 'ttrpg-tracker-item' });
            const badge = item.createEl('span', { cls: `ttrpg-tag ${tagCls}` });
            badge.append(name + ' ');
            const bar = badge.createEl('span', { cls: 'ttrpg-progress-bar' });
            bar.setAttribute('aria-label', `${cur}/${tot}`);
            const fill = bar.createEl('span', { cls: 'ttrpg-progress-fill' });
            fill.style.width = `${Math.min(100, Math.round((cur / tot) * 100))}%`;
            badge.append(` ${cur}/${tot}`);
        }
    }

}

/* ── Data collection (shared between TrackerView and commands) ───────────── */

function emptyData() {
    return {
        npcs:      new Map(), // name -> Set<attr>
        locations: new Map(), // name -> Set<attr>
        pcs:       new Set(),
        events:    new Set(),
        threads:   new Set(),
        clocks:    new Map(), // name -> {cur, tot}  (last value wins)
        tracks:    new Map(),
        timers:    new Set(),
    };
}

function extractTagMap(source, re, map) {
    for (const m of source.matchAll(re)) {
        const parts = m[1].split('|');
        const name  = parts[0].trim();
        if (!name) continue;
        if (!map.has(name)) map.set(name, new Set());
        parts.slice(1).forEach(a => { const t = a.trim(); if (t) map.get(name).add(t); });
    }
}

function extractBars(source, re, map) {
    for (const m of source.matchAll(re)) {
        const bm = m[1].match(/^(.+?)\s+(\d+)\/(\d+)$/);
        if (bm) map.set(bm[1].trim(), { cur: parseInt(bm[2]), tot: parseInt(bm[3]) });
    }
}

function parseBlock(source, data) {
    extractTagMap(source, /\[N:([^\]]+)\]/gi,  data.npcs);
    extractTagMap(source, /\[L:([^\]]+)\]/gi,  data.locations);
    for (const m of source.matchAll(/\[PC:([^\]]+)\]/gi))     data.pcs.add(m[1].split('|')[0].trim());
    for (const m of source.matchAll(/\[E:([^\]]+)\]/gi))      data.events.add(m[1].split('|')[0].trim());
    for (const m of source.matchAll(/\[Thread:([^\]]+)\]/gi)) data.threads.add(m[1].trim());
    for (const m of source.matchAll(/\[Timer:([^\]]+)\]/gi))  data.timers.add(m[1].trim());
    extractBars(source, /\[Clock:([^\]]+)\]/gi, data.clocks);
    extractBars(source, /\[Track:([^\]]+)\]/gi, data.tracks);
}

async function collectFolderData(vault, folder) {
    const files = folder.children
        .filter(f => f instanceof obsidian.TFile && f.extension === 'md')
        .sort((a, b) => a.stat.mtime - b.stat.mtime);
    const data = emptyData();
    for (const file of files) {
        const content = await vault.read(file);
        const blockRe = /```ttrpg\n([\s\S]*?)```/g;
        let m;
        while ((m = blockRe.exec(content)) !== null) parseBlock(m[1], data);
    }
    return data;
}

/* ── Main plugin ─────────────────────────────────────────────────────────── */

class SoloTTRPGPlugin extends obsidian.Plugin {
    async onload() {
        this.registerView(TRACKER_VIEW_TYPE, leaf => new TrackerView(leaf, this));

        this.addRibbonIcon('tag', 'TTRPG Tracker', () => this.activateTrackerView());

        this.registerMarkdownCodeBlockProcessor('ttrpg', (source, el, ctx) => {
            this.renderNotation(source, el);
        });

        this.addCommand({
            id: 'open-ttrpg-tracker',
            name: 'Apri pannello tracker TTRPG',
            callback: () => this.activateTrackerView()
        });

        this.addCommand({
            id: 'insert-ttrpg-scene',
            name: 'Inserisci scena TTRPG',
            editorCallback: (editor, view) => {
                const template = '```ttrpg\nS *Descrizione scena*\n\n> Azione\nd: Tiro => Esito\n=> Cosa succede\n\n? Domanda all\'oracolo\n-> Risposta\n=> Conseguenza nella storia\n```';
                editor.replaceSelection(template);
            }
        });

        this.addCommand({
            id: 'insert-ttrpg-session',
            name: 'Inserisci intestazione sessione TTRPG',
            editorCallback: async (editor, view) => {
                const today = new Date().toLocaleDateString('it-IT');
                let sessionNum = 1;
                let threadsStr = '[Thread:Filo narrativo]';
                let npcsStr    = '';

                if (view.file && view.file.parent) {
                    const folder  = view.file.parent;
                    const mdFiles = folder.children.filter(
                        f => f instanceof obsidian.TFile && f.extension === 'md'
                    );
                    sessionNum = mdFiles.length;

                    const data = await collectFolderData(this.app.vault, folder);

                    if (data.threads.size > 0)
                        threadsStr = [...data.threads].map(t => `[Thread:${t}]`).join(' ');
                    if (data.npcs.size > 0)
                        npcsStr = '\nnpcs: ' + [...data.npcs.keys()].map(n => `[N:${n}]`).join(' ');
                }

                const template = `\`\`\`ttrpg\nsession: ${sessionNum}\ndate: ${today}\npc: [PC:Nome personaggio]\nloc: [L:Luogo iniziale]\nthreads: ${threadsStr}${npcsStr}\ngoal: Obiettivo della sessione\n\`\`\``;
                editor.replaceSelection(template);
            }
        });

        this.addCommand({
            id: 'insert-ttrpg-scene-end',
            name: 'Inserisci fine scena TTRPG',
            editorCallback: (editor) => {
                const template = '```ttrpg\n--- Fine Scena ---\nCF: 5 -> 5\nthreads: [Thread:]\nnpcs: [N:]\n```';
                editor.replaceSelection(template);
            }
        });

        this.addCommand({
            id: 'open-ttrpg-legend',
            name: 'Apri legenda notazione TTRPG',
            callback: () => { new LegendModal(this.app).open(); }
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(TRACKER_VIEW_TYPE);
    }

    async activateTrackerView() {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(TRACKER_VIEW_TYPE);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        await leaf.setViewState({ type: TRACKER_VIEW_TYPE, active: true });
        workspace.revealLeaf(leaf);
    }

    renderNotation(source, el) {
        const isSession  = /^(session|date|pc|loc|goal|threads):/m.test(source);
        const isSceneEnd = /^---\s*Fine Scena/mi.test(source);
        const cls = isSession  ? 'ttrpg-notation ttrpg-session-block'
                  : isSceneEnd ? 'ttrpg-notation ttrpg-scene-end-block'
                  : 'ttrpg-notation';
        const container = el.createDiv({ cls });
        const lines = source.split('\n');
        for (const line of lines) {
            if (line.trim() === '') {
                container.createEl('div', { cls: 'ttrpg-spacer' });
                continue;
            }
            const lineEl = container.createDiv({ cls: 'ttrpg-line' });
            this.renderLine(line.trim(), lineEl);
        }
        requestAnimationFrame(() => this.renumberScenes(el));
    }

    renumberScenes(el) {
        const view = el.closest('.markdown-preview-view, .view-content');
        if (!view) return;
        view.querySelectorAll('.ttrpg-scene-n').forEach((n, i) => {
            n.textContent = i + 1;
        });
    }

    renderLine(line, el) {
        if (line.startsWith('> ')) {
            el.addClass('ttrpg-action');
            el.innerHTML = this.lineHTML('&gt;', 'ttrpg-symbol-action', line.slice(2));
        } else if (line.startsWith('? ')) {
            el.addClass('ttrpg-oracle-q');
            el.innerHTML = this.lineHTML('?', 'ttrpg-symbol-oracle', line.slice(2));
        } else if (line.startsWith('d:')) {
            el.addClass('ttrpg-mechanics');
            const content = line.startsWith('d: ') ? line.slice(3) : line.slice(2);
            el.innerHTML = this.lineHTML('d:', 'ttrpg-symbol-dice', content);
        } else if (line.startsWith('-> ')) {
            el.addClass('ttrpg-oracle-r');
            el.innerHTML = this.lineHTML('-&gt;', 'ttrpg-symbol-result', line.slice(3));
        } else if (line.startsWith('=> ')) {
            el.addClass('ttrpg-consequence');
            el.innerHTML = this.lineHTML('=&gt;', 'ttrpg-symbol-consequence', line.slice(3));
        } else if (line.startsWith('tbl: ')) {
            el.addClass('ttrpg-table');
            el.innerHTML = this.lineHTML('tbl:', 'ttrpg-symbol-table', line.slice(5));
        } else if (line.startsWith('gen: ')) {
            el.addClass('ttrpg-gen');
            el.innerHTML = this.lineHTML('gen:', 'ttrpg-symbol-gen', line.slice(5));
        } else if (/^---\s*Fine Scena/i.test(line)) {
            el.addClass('ttrpg-scene-end');
            const inner = line.replace(/^---\s*/i, '').replace(/\s*---$/, '').trim();
            el.innerHTML = `<span class="ttrpg-symbol ttrpg-symbol-scene-end">⬛</span><span class="ttrpg-content">${this.format(inner)}</span>`;
        } else if (/^CF:/.test(line)) {
            el.addClass('ttrpg-scene-cf');
            const value = line.slice(3).trim();
            el.innerHTML = this.lineHTML('CF:', 'ttrpg-symbol-cf', value);
        } else if (/^(session|date|pc|loc|goal|threads|npcs):/.test(line)) {
            el.addClass('ttrpg-session-info');
            const colon = line.indexOf(':');
            const key   = line.slice(0, colon).trim();
            const value = line.slice(colon + 1).trim();
            el.innerHTML = `<span class="ttrpg-symbol ttrpg-session-key ttrpg-session-key-${key}">${this.escapeHTML(key)}</span><span class="ttrpg-content">${this.format(value)}</span>`;
        } else if (line.startsWith('(') && line.endsWith(')')) {
            el.addClass('ttrpg-meta');
            el.innerHTML = this.format(line);
        } else if (/^(N|PC)\s*(?:\([^)]*\))?:/.test(line)) {
            el.addClass('ttrpg-dialogue');
            el.innerHTML = this.format(line);
        } else if (SCENE_RE.test(line)) {
            el.addClass('ttrpg-scene');
            const sm     = line.match(/^((?:T\d+(?:[+\-]T\d+)*-)?)S(?:\d[\d.]*)?(.*)/);
            const thread = sm ? sm[1] : '';
            const title  = sm ? sm[2].trim() : '';
            const threadHtml = thread ? `<span class="ttrpg-scene-thread">${this.escapeHTML(thread)}</span>` : '';
            el.innerHTML = `<span class="ttrpg-symbol ttrpg-symbol-scene">${threadHtml}S<span class="ttrpg-scene-n"></span></span><span class="ttrpg-content">${this.format(title)}</span>`;
        } else {
            el.addClass('ttrpg-default');
            el.innerHTML = this.format(line);
        }
    }

    lineHTML(symbolHtml, symbolClass, content) {
        return `<span class="ttrpg-symbol ${symbolClass}">${symbolHtml}</span><span class="ttrpg-content">${this.format(content)}</span>`;
    }

    escapeHTML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Renders pipe-separated attributes inside a tag badge.
    // content is already HTML-escaped.
    tagWithAttrs(prefix, content, extraClass) {
        const parts   = content.split('|');
        const name    = parts[0];
        const attrHtml = parts.slice(1)
            .map(a => `<span class="ttrpg-tag-attr">${a.trim()}</span>`)
            .join('');
        return `<span class="ttrpg-tag ${extraClass}">[${prefix}:${name}${attrHtml}]</span>`;
    }

    format(text) {
        let html = this.escapeHTML(text);

        // Clock and Track with progress bars
        html = html.replace(/\[(Clock|Track):([^\]]+)\]/gi, (match, type, content) => {
            const m = content.match(/^(.+?)\s+(\d+)\/(\d+)$/);
            if (m) {
                const name = m[1], cur = parseInt(m[2]), tot = parseInt(m[3]);
                const pct  = Math.min(100, Math.round((cur / tot) * 100));
                const cls  = type.toLowerCase() === 'clock' ? 'ttrpg-tag-clock' : 'ttrpg-tag-track';
                return `<span class="ttrpg-tag ${cls}">[${type}:${name} <span class="ttrpg-progress-bar" aria-label="${cur}/${tot}"><span class="ttrpg-progress-fill" style="width:${pct}%"></span></span>${cur}/${tot}]</span>`;
            }
            return `<span class="ttrpg-tag ttrpg-tag-${type.toLowerCase()}">[${type}:${content}]</span>`;
        });

        // Timer
        html = html.replace(/\[Timer:([^\]]+)\]/gi, (m, c) => `<span class="ttrpg-tag ttrpg-tag-timer">[Timer:${c}]</span>`);

        // Thread
        html = html.replace(/\[Thread:([^\]]+)\]/gi, (m, c) => `<span class="ttrpg-tag ttrpg-tag-thread">[Thread:${c}]</span>`);

        // Reference tags [#N:...] [#L:...] with optional attributes
        html = html.replace(/\[#([NL]):([^\]]+)\]/gi, (m, type, c) => {
            const cls = type.toUpperCase() === 'N' ? 'ttrpg-tag-npc ttrpg-tag-ref' : 'ttrpg-tag-location ttrpg-tag-ref';
            return this.tagWithAttrs(`#${type}`, c, cls);
        });

        // NPC, Location, Event, PC — all support pipe attributes
        html = html.replace(/\[N:([^\]]+)\]/gi,  (m, c) => this.tagWithAttrs('N',  c, 'ttrpg-tag-npc'));
        html = html.replace(/\[L:([^\]]+)\]/gi,  (m, c) => this.tagWithAttrs('L',  c, 'ttrpg-tag-location'));
        html = html.replace(/\[E:([^\]]+)\]/gi,  (m, c) => this.tagWithAttrs('E',  c, 'ttrpg-tag-event'));
        html = html.replace(/\[PC:([^\]]+)\]/gi, (m, c) => this.tagWithAttrs('PC', c, 'ttrpg-tag-pc'));

        // Outcome highlights (> is already &gt; after escaping)
        html = html.replace(/=&gt;\s+Success\b/g, '=&gt; <span class="ttrpg-success">Success</span>');
        html = html.replace(/=&gt;\s+Fail\b/g,    '=&gt; <span class="ttrpg-fail">Fail</span>');
        html = html.replace(/(\s)(S)\s*$/,         '$1<span class="ttrpg-success">S</span>');
        html = html.replace(/(\s)(F)\s*$/,         '$1<span class="ttrpg-fail">F</span>');

        return html;
    }
}

module.exports = SoloTTRPGPlugin;
