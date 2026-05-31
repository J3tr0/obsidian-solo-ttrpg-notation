# Solo TTRPG Notation — Obsidian Plugin

An [Obsidian](https://obsidian.md) plugin that renders the **Solo TTRPG Notation** system by [Roberto Bisceglie](https://zotiquest.zeruhur.space/) inside `ttrpg` code blocks.

## Features

- Color-coded rendering of all notation symbols (`>`, `?`, `d:`, `->`, `=>`)
- Auto-numbered scenes across the whole page
- Entity tags with attributes: `[N:Jonah|wounded|friendly]`, `[L:Tavern]`, `[E:Ambush]`, `[PC:Aria]`, `[Thread:The curse]`
- Progress bars for clocks and tracks: `[Clock:Siege 3/10]`, `[Track:HP 8/10]`
- Timers: `[Timer:Next full moon]`
- Session info block (session number, date, PC, location, threads, goal)
- **Scene end block**: records Chaos Factor changes, active threads, and NPCs at the end of each scene
- Auto-increment session number based on files in the folder
- **Tracker sidebar panel**: scans the entire campaign folder and shows a live summary of all NPCs, locations, characters, threads, clocks, tracks, and timers
- **Notation legend**: quick-reference modal for all symbols and syntax

## Usage

Write a `ttrpg` code block in any note:

~~~markdown
```ttrpg
S The tavern

> I ask the innkeeper about the missing merchant
? Has anyone seen him recently?
-> Yes, he left three days ago heading north
=> I decide to follow the trail

d: Perception check => 14 — S
```
~~~

### Scene end block

Use `--- Fine Scena N ---` to close a scene, recording the Chaos Factor change, active threads, and NPCs involved:

~~~markdown
```ttrpg
--- Fine Scena 1 ---
CF: 5 -> 6 (Interrupt Scene, situation out of control)
threads: [Thread:Find the other half of the ancient key] [Thread:Who searched my lab?]
npcs: [N:The Stranger] [N:Mayor]
```
~~~

The block renders with a distinct left-border style. The `CF:` line is highlighted in red, `threads:` and `npcs:` use the same key-value style as the session header.

### Commands (Ctrl+P)

| Command | Description |
|---|---|
| Inserisci scena TTRPG | Insert a scene template |
| Inserisci fine scena TTRPG | Insert a scene end block |
| Inserisci intestazione sessione TTRPG | Insert a session header |
| Apri pannello tracker TTRPG | Open the tracker sidebar |
| Apri legenda notazione TTRPG | Open the notation legend |

### Scene types

| Syntax | Meaning |
|---|---|
| `S Title` | Normal scene (auto-numbered) |
| `S5a Title` | Flashback (fixed number) |
| `S7.1 Title` | Montage scene |
| `T1-S Title` | Parallel thread scene |

### Tag attributes

Any entity tag supports pipe-separated attributes:

```
[N:Jonah|wounded|hostile]
[L:The Keep|ruined|cold]
```

## Installation

No build step required. Copy `main.js`, `styles.css`, and `manifest.json` into your vault's plugin folder:

```
<vault>/.obsidian/plugins/solo-ttrpg-notation/
```

Then enable the plugin in Obsidian → Settings → Community plugins.

## Attribution

This plugin implements **Solo TTRPG Notation v2.0** by [Roberto Bisceglie](https://zotiquest.zeruhur.space/), published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## License

[CC BY-SA 4.0](LICENSE) — free to use, share and adapt (including commercially), provided attribution is given and derivative works use the same license.
