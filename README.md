# Oxide

A floating, keyboard-first scratchpad for scattered AI work — a functional clone of
[Copper by shadcn](https://shadcn.com), built with [Bun](https://bun.sh) +
[Electrobun](https://electrobun.dev). (Oxidized copper → Oxide.)

Notes are 100% local (a single JSON file), no accounts, no sync, no telemetry.

## What it does

- **Floating panel** — frameless, transparent, rounded, always-on-top sidebar.
- **Double-Shift capture** — select text in *any* app, tap `Shift` twice, and the
  selection lands in Oxide with a "Captured" toast. (Windows: implemented with a
  low-level keyboard hook helper that simulates `Ctrl+C` and verifies the
  clipboard actually changed.)
- **Prompt staging** — type follow-up prompts into the bottom input while the AI
  is still generating; check them off as you go.
- **Copy as List** — select several notes → copies them as a numbered list,
  ready to paste into ChatGPT / Claude / Cursor.
- **Sections** — group notes (`RESEARCH`, `PROMPT QUEUE`, …), collapse, rename,
  drag notes between them. Right-click a section → *Set as capture target*.
- **Markdown-lite** in cards: `**bold**`, `*italic*`, `` `code` ``, links.
- **Keyboard-first** — see shortcuts below.

## Run it

```sh
bun install

# Website mode (works everywhere, uses localStorage)
bun run web        # → http://localhost:4820

# Desktop app (floating always-on-top panel, local JSON file storage)
bun run dev
```

Data file (desktop): `%APPDATA%\OxideNotes\notes.json`

## Shortcuts

### Global (desktop only)

| Keys | Action |
| --- | --- |
| `Shift` `Shift` | Capture the current selection from any app |
| `Ctrl+Shift+C` | Capture whatever is on the clipboard |
| `Ctrl+Shift+Space` | Show / hide the panel |

### In the panel

| Keys | Action |
| --- | --- |
| `↑` / `↓` | Navigate notes (`Shift` extends selection) |
| `Space` | Mark done / not done |
| `Enter` | Edit note (`Ctrl+Enter` saves, `Esc` cancels) |
| `Ctrl+C` | Copy selected note(s) |
| `Ctrl+Alt+C` | Copy selected notes as a numbered list |
| `Ctrl+A` | Select all visible notes |
| `Ctrl+M` | Merge selected notes |
| `Del` | Delete selected note(s) |
| `/` or `Ctrl+F` | Focus search |
| just type | Focus the composer |

Right-click cards/sections for the full menu (Copy as List, Merge Notes,
Move to…, Expand, etc.). Double-click a card to edit, double-click a section
title to rename. Drag cards to reorder or drop them on a section header.

## Notes & caveats

- Electrobun officially supports **Windows 11+**; on Windows 10 it may or may
  not run — the web mode works regardless.
- The double-Shift helper simulates `Ctrl+C`, so a capture briefly replaces
  your clipboard with the captured text (that's also true of most Windows
  clipboard tools). If nothing is selected, nothing is captured.
- Elevated (admin) windows won't receive the simulated `Ctrl+C` from a
  non-elevated Oxide.

## Project layout

```
electrobun.config.ts     app/build config
serve.ts                 website-mode dev server
src/
  shared/types.ts        state + typed RPC schema (bun ↔ webview)
  bun/index.ts           main process: window, storage, shortcuts, clipboard
  bun/shiftshift.ts      double-Shift low-level keyboard hook helper (Windows)
  mainview/index.html    webview shell
  mainview/style.css     the floating-panel look
  mainview/index.ts      the whole UI (vanilla TS, no framework)
```
