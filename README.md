# Oxide

Oxide is a small, floating scratchpad for the ideas, snippets, and prompts you pick up while working. It stays out of the way until you need it, then lets you capture text, organize it, and keep moving without breaking your flow.

Everything stays local. There are no accounts, sync services, or telemetry.

## Changelog

### 1.1.0

- **Electron desktop app** — Oxide now runs on Electron instead of Electrobun, with installers from electron-builder (Windows NSIS/zip, macOS dmg/zip, Linux AppImage/deb). Notes and settings files stay compatible.
- **Manual resize only** — Drag the bottom-right corner grip to resize. Opening or closing the ⋯ menu no longer changes the window size.
- **Default size on launch** — Every start opens at 380×680 (shrunk to fit a small screen). Last position is still restored.
- **Snap display** — Settings → Snap display picks which monitor the snap hotkey (`Ctrl+Shift+M`) uses: primary, current, or a specific screen.

### 1.0.2

- Maintenance release of the Electrobun desktop app.

### 1.0.1

- First public release (Electrobun desktop app and browser mode).

## Features

- **Capture text from anywhere** - Select text in another app and double-tap the configured capture key, or use the clipboard shortcut.
- **Stage prompts and ideas** - Keep follow-up prompts in a queue while an AI tool or another task is still running.
- **Floating workspace** - Keep Oxide above other windows, minimize it to a small pill, or snap it to a screen edge or corner on a chosen monitor.
- **Organize with sections** - Create, rename, collapse, color, and reorder sections. Choose a default section for new captures.
- **Drag and drop notes** - Reorder notes, move them between sections, and see a clear preview of where a dragged note will land.
- **Search and filter** - Search notes quickly or hide completed items when you want a cleaner view.
- **Work with batches** - Select notes to copy them as plain text, a numbered list, or Markdown. Merge, duplicate, mark important, archive, or delete them in batches.
- **Archive and Trash** - Restore archived or deleted notes, or permanently remove items when you are ready.
- **Markdown-lite notes** - Use bold, italics, inline code, and links inside note cards.
- **Source screenshots** - On Windows, optionally capture a screenshot of the source window alongside a captured note.
- **Personal settings** - Choose a light, dark, or system theme; configure sounds, shortcuts, capture behavior, and completion preferences.
- **Backup** - Export and import notes as JSON. Window position, hide-completed, and launch-at-login persist on the desktop app.
- **Tray** - The desktop app stays in the system tray so the panel can hide without quitting.

## Run it

```sh
bun install
```

Run the browser version:

```sh
bun run web
```

Then open `http://localhost:4820`. Browser mode stores notes and settings in `localStorage`.

Run the desktop version (Electron — bundles the main process + preload, starts
the web dev server for the view, then launches the app):

```sh
bun run dev
```

Build installers with electron-builder (into `artifacts/`):

```sh
bun run build
```

## Platform support

| Platform | Status |
| --- | --- |
| macOS 14+ | Officially supported |
| Windows 11+ | Officially supported |
| Ubuntu 22.04+ | Officially supported |
| Windows 10 | Works and tested, but not officially supported |

Browser mode works independently of the desktop shell and can be used on other platforms.

## Releases

Releases are published from the GitHub Actions website. The workflow updates the application version, commits it to `main`, creates the release tag, builds macOS, Windows, and Ubuntu artifacts, and publishes the GitHub release.

Before the first release, make sure the repository allows GitHub Actions to write repository contents and that branch protection allows the Actions bot to push the version commit to `main`.

To publish a version:

1. Push the changes to be released to `main`.
2. Open the repository's **Actions** tab.
3. Select the **Release** workflow.
4. Click **Run workflow**.
5. Select `main` and enter a version such as `0.2.0`.
6. Click **Run workflow** and wait for the build and publish jobs to finish.

The version must be a new `X.Y.Z` semantic version. The workflow also updates the version shown in the About screen. No local tag or release command is needed.

## Shortcuts

Global shortcuts are configurable in Settings.

| Keys | Action |
| --- | --- |
| `Shift` `Shift` | Capture the current selection from another app |
| `Ctrl+Shift+C` | Capture the current clipboard text |
| `Ctrl+Shift+Space` | Show or hide the panel |
| `Ctrl+Shift+M` | Snap the panel to its configured position |

Panel shortcuts:

| Keys | Action |
| --- | --- |
| `Up` / `Down` | Navigate notes; hold `Shift` to extend selection |
| `Alt+Up` / `Alt+Down` | Move selected notes |
| `Space` | Mark selected notes done or not done |
| `Enter` | Edit the selected note |
| `Ctrl+C` | Copy selected notes |
| `Ctrl+Alt+C` | Copy selected notes as a numbered list |
| `Ctrl+A` | Select all visible notes |
| `Ctrl+D` | Duplicate selected notes |
| `Ctrl+I` | Mark selected notes important |
| `Ctrl+M` | Merge selected notes |
| `Ctrl+E` | Archive selected notes |
| `Delete` | Move selected notes to Trash |
| `Ctrl+Z` | Undo last delete or archive |
| `Ctrl+,` | Open Settings |
| `/` or `Ctrl+F` | Focus search |
| Type with nothing selected | Focus the composer |

Right-click notes and sections for additional actions. Double-click a note to edit it and double-click a section title to rename it.

## Tech stack

- **Bun** for package scripts, filesystem access, and build tooling (bundling main, preload, and view).
- **TypeScript** with strict type checking.
- **Electron** for the native desktop window, preload IPC bridge, global shortcuts, and packaging (electron-builder).
- **Vanilla TypeScript and CSS** for the interface. There is no frontend framework.
- **Windows APIs and PowerShell helpers** for screenshot capture and the double-tap keyboard hook.
- **Local storage** through JSON files on desktop and browser `localStorage` in web mode.

## Project structure

```text
oxidized/
|-- assets/
|   |-- icon.ico               Windows application icon
|   `-- icon.png               Cross-platform icon source (dev + electron-builder)
|-- scripts/
|   |-- build-app.ts           Bundles main/preload (dist-electron/) and view (dist-renderer/)
|   `-- dev.ts                 Dev orchestrator: serve.ts + Electron
|-- electron-builder.yml       electron-builder targets (NSIS/zip, dmg/zip, AppImage/deb)
|-- package.json               Scripts and dependencies
|-- serve.ts                   Browser-mode development server
`-- src/
    |-- main/
    |   |-- index.ts           Electron main process: window, storage, capture, shortcuts
    |   |-- preload.ts         contextBridge → window.oxide
    |   `-- shiftshift.ts      Windows double-tap capture helper
    |-- mainview/
    |   |-- index.html         Window shell
    |   |-- index.ts           Application state and UI behavior
    |   |-- style.css          Panel, cards, settings, and animations
    |   |-- sounds.ts          UI sounds
    |   `-- logo.ts            Embedded About-page logos
    `-- shared/
        |-- types.ts           Shared state types and defaults
        `-- ipc.ts             Desktop IPC contract (channels + OxideDesktopApi)
```

## Local data

Desktop data is stored under:

```text
%LOCALAPPDATA%\oxidized\
|-- settings.json
`-- blobs/
    |-- notes.json
    `-- shots/
```

Oxide does not upload or synchronize this data.

## Windows notes

- The double-tap capture helper briefly uses `Ctrl+C` to read the selected text. This can temporarily replace the clipboard contents.
- Capturing from elevated administrator windows may not work when Oxide is running without administrator privileges.
- Windows 10 has been tested and works, but it is outside the official support policy.
- Official desktop support covers macOS 14+, Windows 11+, and Ubuntu 22.04+.

## License

Public domain under the [Unlicense](LICENSE). Do whatever you want with it — no attribution required.

## A note from the maker
A few notes about this project:
- **Code quality**: this project is partly vibe-coded, I know the code quality sucks. If you don't like it, buy shadcn's version or actually fix it.
- **This shit is copied from copper**: yeah that's the whole idea. see [this link](https://shadcn.com/copper) and [this link](https://x.com/deepseekailover/status/2083541502160945584)
- **I love you**: thanks, you're not alone