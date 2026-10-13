# AGENTS.md

Oxide — a floating, keyboard-first scratchpad (Copper-style clone). One UI codebase runs as an Electron desktop app and as a plain website. Bun + TypeScript (strict), vanilla TS/CSS, **no frontend framework**, no build framework beyond Bun/Electron.

## Commands

```sh
bun install                 # install (CI pins bun 1.3.14 + --frozen-lockfile)
bun run dev                 # Electron dev: bundle main+preload, start serve.ts, launch Electron against it
bun run web                 # browser mode at http://localhost:4820 (serve.ts)
bun run build:app           # bundle main/preload → dist-electron/, renderer → dist-renderer/
bun run build               # build:app + electron-builder → artifacts/ (NSIS/zip, dmg/zip, AppImage/deb)
bunx tsc --noEmit           # typecheck (CI gate)
bun test                    # unit tests in tests/ (CI gate)
```

There is **no linter or formatter**. Verification is `bunx tsc --noEmit`, `bun test`, and `bun build src/mainview/index.ts --target browser` (all three run in CI). CI also runs `bun run build` (electron-builder) on macOS, Windows, and Linux.

Tests cover the pure logic only (`src/shared`, `src/mainview/notes.ts`, `markdown.ts`, `accelerator.ts`, `src/main/storage.ts`) — nothing that needs a DOM or Electron. Keep new logic in modules like those so it stays testable.

## Architecture

Main process (`src/main/`, Node + Electron):

- `index.ts` — wiring only: creates the pieces below, clipboard capture, tray, app lifecycle (quit waits for pending writes).
- `panel.ts` — the one `BrowserWindow`: create/show/hide, pill frame, snap, off-screen recovery, renderer-crash reload.
- `motion.ts` — window drag / momentum glide / resize / slide state machine (no Electron imports; driven through a small `MotionTarget`).
- `storage.ts` — data paths, atomic writes, `StateFile` (notes) and `SettingsStore`. Node-only, so it is unit-tested.
- `shortcuts.ts` — global shortcuts + the double-tap helper's lifecycle; `shiftshift.ts` is the Windows low-level keyboard hook (hidden PowerShell/C# child over stdout).
- `ipc.ts` — every IPC handler, with sender check and payload validation.
- `preload.ts` — sandboxed preload: `contextBridge` exposes the typed `OxideDesktopApi` as `window.oxide`. The renderer never gets Node.

View (`src/mainview/`, runs in Electron and in a plain browser):

- `index.ts` — entry point only; holds `APP_VERSION` (see Gotchas) and calls `boot()` in `app.ts`.
- `platform.ts` — the desktop/browser seam (`isDesktop = !!window.oxide`); browser mode uses `localStorage` keys `oxide-state-v1` / `oxide-settings-v1`.
- `store.ts` — persisted state + settings, saving, undo. `ui.ts` — transient UI state (selection, view, drafts).
- `notes.ts` — **pure** operations on the notes state. `actions.ts` — user commands: call `notes.ts`, `persist()`, `invalidate()`.
- `render.ts` — microtask render scheduler: `invalidate("list" | "settings")`, `afterRender()`. Never call a view's render function directly.
- `shell.ts` — the persistent `.panel`, view switching, pill face. `views/list.ts` — the note list (rebuilt from state each render, events delegated). `views/settings/` — one file per Settings tab (`general`, `shortcuts`, `data`, `about`); `views/controls.ts` — the shared row widgets.
- `menus.ts` (note / section / app menus) on top of `menu.ts` (the floating menu itself); `keyboard.ts`, `selection.ts`, `pill.ts`, `grab.ts`, `resize.ts`, `theme.ts`, `toast.ts`, `markdown.ts`, `accelerator.ts`.

Shared (`src/shared/`, imported by both sides):

- `types.ts` — state/settings types + `DEFAULT_SETTINGS`. Must stay pure data (**no imports**).
- `settings.ts` — `mergeSettings()`: validates every field of a settings object. `state.ts` — `parseAppState()`: validates/repairs a notes file; Archive/Trash helpers. `ipc.ts` — IPC channel names + `OxideDesktopApi`.

Elsewhere:

- `serve.ts` — browser dev server, and the dev Electron renderer; bundles `src/mainview/index.ts` on the fly with `Bun.build`.
- `site/` — static marketing page (`bun run site` → localhost:5173). Deployed to GitHub Pages by `.github/workflows/site.yml`.
- `electron-builder.yml` — packaging: appId, icons, targets (NSIS/zip, dmg/zip, AppImage/deb), output → `artifacts/`.
- `DESIGN.md` — the visual language spec; its appendix maps CSS classes to `src/mainview/style.css`. Keep style changes consistent with it.

## Storage

- Desktop: `%LOCALAPPDATA%\oxidized\settings.json`, `blobs/notes.json` (non-Windows: `~/.local/share/oxidized`). One-time migration from legacy `%APPDATA%\OxideNotes\notes.json`. `OXIDE_DATA_DIR=<dir>` overrides the location — **use it for any manual or automated run that shouldn't touch real notes**.
- Writes are atomic (temp file + rename) and serialized. `blobs/notes.json.bak` is the notes as they were at the last launch; an unreadable `notes.json` is copied to `notes.corrupt-<time>.json` before anything overwrites it, and the load falls back to the backup.
- State is a single JSON blob; the view debounces saves 350 ms (`persist()`), flushes on blur/hide/quit, then IPC `saveState`.
- The notes file format is unchanged and must stay backward compatible: Archive and Trash are ordinary sections recognized by title (`isArchive` / `isTrash` in `shared/state.ts`).
- Settings pass through `mergeSettings()` on every load and save — **every new setting needs a default in `DEFAULT_SETTINGS` and a line in `mergeSettings()`**, or it is dropped. The window frame in settings is owned by the main process.

## Gotchas

- **`src/main/` changes require a full dev restart** (`scripts/dev.ts` builds main+preload once); view code hot-reloads through `serve.ts`. Renderer `console` lands in the terminal when launched via `bun run dev`; `platform.debug()` routes renderer logs over IPC as `[oxide:view]`.
- **DIP everywhere**: Electron windows, `setBounds`/`screen` all use logical px — never multiply desktop IPC sizes by `devicePixelRatio`.
- **Window dragging is main-driven**: the view only signals drag start/end over IPC (`grab.ts`); `motion.ts` tracks the cursor, moves the window with a locked size (electron#51679), then glides with momentum. Don't reintroduce CSS `-webkit-app-region` — it suppresses clicks (menu buttons, pill click-to-expand) and can't do just-in-time grab-anywhere. The `electrobun-webkit-app-region-drag/no-drag` class names remain in the DOM as inert JS markers (`DRAG_CLASS` / `NO_DRAG_CLASS` in `dom.ts`).
- The window can be closed or destroyed at any time — go through `Panel` (it guards `isDestroyed()`); capture events are dropped when no window is available. Closing the panel hides it while the tray exists.
- The pill frame snapshot (`prePillFrame` in `panel.ts`) must not stack, and the pill-sized frame is never saved as the window size.
- After a prevented `will-quit`, call `app.quit()` from a new task (`setImmediate`) — Electron ignores it until the event has unwound.
- The list is rebuilt on every render: keep anything that must survive (edit drafts, selection) in `ui.ts`, not in DOM nodes, and attach list events by delegation in `views/list.ts`.
- The release workflow requires the version in **exactly two places, in sync**, each matching a single regex: `package.json` and the `APP_VERSION` const at the start of a line in `src/mainview/index.ts`. Adding another `version:` line or `APP_VERSION` const breaks releases. Releases are manual GitHub Actions only (`workflow_dispatch`, X.Y.Z newer than current, from `main`) — never tag or bump version locally.
- Keep `bun.lock` committed and current — CI installs with `--frozen-lockfile`. `electron`/`electron-builder` are devDependencies; the packaged app ships its own runtime.
- Windows double-tap capture briefly simulates `Ctrl+C`, replacing the clipboard; capturing from elevated windows fails without admin rights.
- CI builds set `CSC_IDENTITY_AUTO_DISCOVERY=false` (no code-signing certs configured).
- `TODO.md` exists as scratch but is gitignored/untracked; don't rely on it or commit it.
