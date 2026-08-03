# Oxide

Oxide is a small, floating scratchpad for the ideas, snippets, and prompts you pick up while working. It stays out of the way until you need it, then lets you capture text, organize it, and keep moving without breaking your flow.

Everything stays local. There are no accounts, sync services, or telemetry.

## Features

- **Capture text from anywhere** - Select text in another app and double-tap the configured capture key, or use the clipboard shortcut.
- **Stage prompts and ideas** - Keep follow-up prompts in a queue while an AI tool or another task is still running.
- **Floating workspace** - Keep Oxide above other windows, minimize it to a small pill, or snap it to a screen edge or corner.
- **Organize with sections** - Create, rename, collapse, color, and reorder sections. Choose a default section for new captures.
- **Drag and drop notes** - Reorder notes, move them between sections, and see a clear preview of where a dragged note will land.
- **Search and filter** - Search notes quickly or hide completed items when you want a cleaner view.
- **Work with batches** - Select notes to copy them as plain text, a numbered list, or Markdown. Merge, duplicate, mark important, archive, or delete them in batches.
- **Archive and Trash** - Restore archived or deleted notes, or permanently remove items when you are ready.
- **Markdown-lite notes** - Use bold, italics, inline code, and links inside note cards.
- **Source screenshots** - On Windows, optionally capture a screenshot of the source window alongside a captured note.
- **Personal settings** - Choose a light, dark, or system theme; configure sounds, shortcuts, capture behavior, and completion preferences.

## Run it

```sh
bun install
```

Run the browser version:

```sh
bun run web
```

Then open `http://localhost:4820`. Browser mode stores notes and settings in `localStorage`.

Run the desktop version:

```sh
bun run dev
```

Build the desktop app:

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
| `/` or `Ctrl+F` | Focus search |
| Type with nothing selected | Focus the composer |

Right-click notes and sections for additional actions. Double-click a note to edit it and double-click a section title to rename it.

## Tech stack

- **Bun** for the runtime, package scripts, filesystem access, and build tooling.
- **TypeScript** with strict type checking.
- **Electrobun** for the native desktop window, webview, RPC bridge, global shortcuts, and Windows packaging.
- **Vanilla TypeScript and CSS** for the interface. There is no frontend framework.
- **Windows APIs and PowerShell helpers** for keyboard capture, DPI-aware window behavior, screenshots, and native window movement.
- **Local storage** through JSON files on desktop and browser `localStorage` in web mode.

## Project structure

```text
oxidized/
|-- assets/
|   `-- icon.ico               Application icon
|-- scripts/
|   `-- embed-icon.ts          Embeds the Windows icon during packaging
|-- electrobun.config.ts       Desktop and packaging configuration
|-- package.json               Scripts and dependencies
|-- serve.ts                   Browser-mode development server
`-- src/
    |-- bun/
    |   |-- index.ts           Main process, window, storage, capture, and shortcuts
    |   `-- shiftshift.ts      Low-level double-tap capture helper
    |-- mainview/
    |   |-- index.html         Webview shell
    |   |-- index.ts           Application state and UI behavior
    |   |-- style.css          Panel, cards, settings, and animations
    |   |-- sounds.ts          UI sounds
    |   `-- logo.ts            Embedded About-page logos
    `-- shared/
        `-- types.ts           Shared state types and RPC schema
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

## A note from the maker

_This space is reserved for a short handwritten message._

____________________________________________________________

____________________________________________________________

____________________________________________________________
