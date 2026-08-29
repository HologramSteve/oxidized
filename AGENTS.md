# AGENTS.md

Oxide — a floating, keyboard-first scratchpad (Copper-style clone). One UI codebase runs as an Electron desktop app and as a plain website. Bun + TypeScript (strict), vanilla TS/CSS, **no frontend framework**, no build framework beyond Bun/Electron.

## Commands

```sh
bun install                 # install (CI pins bun 1.3.14 + --frozen-lockfile)
bun run dev                 # Electron dev: bundle main+preload, start serve.ts, launch Electron against it
bun run web                 # browser mode at http://localhost:4820 (serve.ts)
bun run build:app           # bundle main/preload → dist-electron/, renderer → dist-renderer/
bun run build               # build:app + electron-builder → artifacts/ (NSIS/zip, dmg/zip, AppImage/deb)
bunx tsc --noEmit           # typecheck — the only CI gate, same as bun run web's bundle
```

There are **no tests, no linter, no formatter** configured. `bunx tsc --noEmit` plus `bun build src/mainview/index.ts --target browser` (covers CI) is the verification step. CI also runs `bun run build` (electron-builder) on macOS, Windows, and Linux.

## Architecture

- `src/main/index.ts` — Electron main process: window, global shortcuts, clipboard capture, JSON storage, Windows-native helper (double-tap keyboard hook). No `bun:ffi`: Electron is DPI-aware and provides `screen`/`clipboard`/`shell`/`globalShortcut`.
- `src/main/preload.ts` — sandboxed preload: `contextBridge` exposes the typed `OxideDesktopApi` as `window.oxide` (contract + channel names in `src/shared/ipc.ts`). The renderer never gets Node.
- `src/mainview/index.ts` — the entire UI: state, rendering, keyboard nav, settings. A `PlatformBridge` abstracts desktop vs. browser via `isDesktop = !!window.oxide`; desktop calls the preload API, browser uses `localStorage` keys `oxide-state-v1` / `oxide-settings-v1`.
- `src/shared/types.ts` — shared state types + `DEFAULT_SETTINGS`. Must stay pure data (no imports) so it's safe in both contexts. The IPC contract lives in `src/shared/ipc.ts` (pure constants/types too).
- `src/main/shiftshift.ts` — Windows double-Shift capture: a low-level keyboard hook run as a hidden PowerShell/C# child over stdout.
- `serve.ts` — browser dev server, and the dev Electron renderer; bundles `src/mainview/index.ts` on the fly with `Bun.build`.
- `electron-builder.yml` — packaging: appId, icons, targets (NSIS/zip, dmg/zip, AppImage/deb), output → `artifacts/`.
- `DESIGN.md` — the visual language spec; its appendix maps CSS classes to `src/mainview/style.css`. Keep style changes consistent with it.

## Storage

- Desktop: `%LOCALAPPDATA%\oxidized\settings.json`, `blobs/notes.json` (non-Windows: `~/.local/share/oxidized`). One-time migration from legacy `%APPDATA%\OxideNotes\notes.json`.
- State is a single JSON blob; the view debounces saves 350 ms (`persist()`), then IPC `saveState`.
- Settings load merges over `DEFAULT_SETTINGS` — **every new setting needs a default there**, or existing settings files get `undefined`.

## Gotchas

- **`src/main/` changes require a full dev restart** (`scripts/dev.ts` builds main+preload once); view code hot-reloads through `serve.ts`. Renderer `console` lands in the terminal when launched via `bun run dev`; `bridge.debug()` routes renderer logs over IPC as `[oxide:view]`.
- **DIP everywhere**: Electron windows, `setSize`/`setPosition`/`screen` all use logical px — never multiply desktop IPC sizes by `devicePixelRatio` (the old Electrobun port's `phys()` was removed for exactly this reason).
- **Window dragging is main-driven**: the view only signals drag start/end over IPC; `src/main/index.ts` tracks `screen.getCursorScreenPoint()` and moves the window with `setPosition`, then glides with momentum (`endWindowDrag`). Don't reintroduce CSS `-webkit-app-region` — it suppresses clicks (menu buttons, pill click-to-expand) and can't do just-in-time grab-anywhere. The `electrobun-webkit-app-region-drag/no-drag` class names remain in the DOM as inert JS markers.
- `win` is `BrowserWindow | null` and can be destroyed mid-flight — guard `win?.` / `isDestroyed()` in IPC handlers; capture events are dropped when no window is available.
- `getBounds()` returns a fresh object (Electron), but keep the pill/menu snapshot style: `prePillFrame`/`preMenuFrame` must not stack.
- The release workflow requires the version in **exactly two places, in sync**, each matching a single regex: `package.json` and `const APP_VERSION` in `src/mainview/index.ts`. Adding another `version:` line or `APP_VERSION` const breaks releases. Releases are manual GitHub Actions only (`workflow_dispatch`, X.Y.Z newer than current, from `main`) — never tag or bump version locally.
- Keep `bun.lock` committed and current — CI installs with `--frozen-lockfile`. `electron`/`electron-builder` are devDependencies; the packaged app ships its own runtime.
- Windows double-Shift capture briefly simulates `Ctrl+C`, replacing the clipboard; capturing from elevated windows fails without admin rights.
- CI builds set `CSC_IDENTITY_AUTO_DISCOVERY=false` (no code-signing certs configured).
- `TODO.md` exists as scratch but is gitignored/untracked; don't rely on it or commit it.
