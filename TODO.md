# TODO

_Drop new items here and I'll work through them, easiest first._

## Done

- [x] **GitHub link** — About page now points to https://github.com/HologramSteve/oxidized. (X link is still the `wqffles` placeholder — give me the real handle or say drop it.)
- [x] **Window not restoring after clicking pill — root-caused & fixed.** Reproduced with an automated self-test, then found an aliasing bug: Electrobun's `getFrame()` returns the window's *internal* frame object, and `setSize()` mutates that same object — so the "snapshot" taken before shrinking silently became the pill size, and restore no-oped. Fixed by copying the frame (`{ ...getFrame() }`). Same bug also made menu-grown windows never shrink back (invisible window area left over other apps — very likely the real cause of the "top-right buttons stop working" weirdness). Self-test now shows perfect restores across plain, menu-then-pill, and rapid cycles.
- [x] **Logo** — rust-orange rounded-square mark with the app's check-circle motif (inline SVG), shown on the About page above the wordmark. A real Windows app/taskbar icon needs an .ico wired into the build — say the word if you want that too.

- [x] **Button to open the local data folder** — Settings → Storage now has an "Open folder" button (also on the About page). Opens `%LOCALAPPDATA%\oxidized` in Explorer.
- [x] **Auto-complete when copied as list (configurable)** — "Copy as List" / "Copy as Markdown" now tick the copied notes off (with the new checkbox animation) and toast "Copied as list · marked done". Toggle: Settings → General → "Complete on copy" (default on). Plain Copy never auto-completes.
- [x] **Info tab** — menu (⋯) → "About Oxide": wordmark, version, short description, GitHub + X links, data-folder button, credits. Esc goes back. ⚠️ The GitHub/X URLs are placeholders (`github.com/wqffles/oxidized`, `x.com/wqffles`) — tell me the real ones and I'll swap them (constants at the top of the About section in `src/mainview/index.ts`).
- [x] **Completed-note animation like the sample** — checkbox is now the sample's design: circle fills blue with a slight scale pop, the checkmark *draws itself in* (stroke-dashoffset), text fades to grey with strikethrough. Works on check, uncheck, and auto-complete-on-copy. (Cards are rebuilt on render, so I mount them in the old state and flip a frame later to let the transitions play.)
- [x] **Dark mode** — Settings → General → Appearance: Auto / Light / Dark. Auto follows Windows and switches live. Whole palette moved to CSS variables; every surface (cards, menus, fields, pill, About) has a dark variant.
- [x] **Custom capture key instead of Shift** — Settings → Shortcuts → "Capture key": Shift / Ctrl / Alt. The keyboard-hook helper now takes the key's VK codes as parameters and restarts live when you change it (same as the tap-window setting).
- [x] **Right-click menu can extend outside the panel** — kept the styled HTML menu. When a menu would be clipped, the (transparent) native window silently grows just enough to fit it, with the panel pinned to its size so nothing visibly moves; when the menu closes the window snaps back to its exact previous frame. Native-menu experiment reverted.
- [x] Allow moving the pilled version — whole pill is a drag handle; clean click (≤4px movement) expands.
- [x] Pill text greyed lowercase "oxidized - X tasks".
- [x] Removed the big rectangular shadow around the pill (was the panel shadow clipped by the tiny window; pill now has its own small fitted shadow).
- [x] Fixed window growing after collapse → reopen — bun snapshots the native frame before shrinking and restores it verbatim; resizes now use per-monitor devicePixelRatio.
- [x] Double-click on section arrow no longer triggers rename (rename only when double-clicking the title itself).
- [x] Duplicate-capture guard: identical text within 30 s is skipped (Settings → "Skip duplicate captures", default on).
- [x] Move animations — cards slide (FLIP) on drag-reorder, Move to…, archive and delete.
- [x] Easier dragging — grab any empty surface (panel edges, gaps, empty list space) to move the window.
- [x] Collapse fixed — animated grid collapse, no more flicker.
- [x] "Keep on top" setting (Settings → General + ⋯ menu, persisted).
- [x] Custom double-press window (Settings → "Double-press window", 150–10000 ms).
