# Oxide Design System

This document describes the visual language, layout rules, interaction patterns, and motion system currently implemented by Oxide.

It is an implementation-grounded design reference rather than a hypothetical redesign. The source of truth is the current interface in `src/mainview/index.ts` and `src/mainview/style.css`, with platform behavior supplied by `src/bun/index.ts`.

## 1. Product Character

Oxide is a small floating scratchpad for ideas, prompts, snippets, and captured text. The interface is designed to sit beside active work rather than become the user's primary workspace.

The visual character is:

- Compact and information-dense without feeling cramped.
- Quiet by default, with emphasis reserved for selection, completion, capture, and danger states.
- Keyboard-first, with mouse interactions available but deliberately lightweight.
- Tactile, using soft shadows, small press responses, rounded surfaces, and short confirmation sounds.
- Local and personal, presented as a private utility rather than a collaborative web product.
- MacOS-inspired in its use of system colors, pill controls, subtle depth, and spring-like settling motion.
- Desktop-oriented, shaped like a narrow floating panel instead of a responsive content site.

The interface should feel like a calm command surface: it is always ready to receive a thought, but it should not compete with the work that produced that thought.

## 2. Design Principles

### Keep capture friction low

The main action is adding a note. The composer is always visible at the bottom of the panel, accepts text immediately, grows only as needed, and submits with Enter. The visual treatment is intentionally quieter than a conventional primary call-to-action. The empty composer, not a large button, is the main invitation.

### Use hierarchy instead of decoration

Hierarchy comes from surface contrast, spacing, font weight, opacity, and small accent colors. There are no large illustrations, gradients inside the panel, or decorative backgrounds. Pastel colors are reserved for section identity and the About mark.

### Make state visible without interrupting flow

Selection, completion, importance, dragging, and capture feedback all have immediate visual feedback. The feedback is mostly local to the affected element: a card changes border and shadow, a check animates, a pill flashes, or a toast appears briefly. Avoid modal interruption for normal note operations.

### Treat the panel as a physical object

The panel has a shell, a shadow, a draggable surface, a resize grip, and a minimized pill form. Motion should preserve the sense that the same object is changing state rather than replacing one screen with another.

### Prefer reversible actions

Deletion moves notes to Trash instead of immediately destroying them. Archive is also separated from the main list. Destructive actions are colored red and separated from routine actions in menus.

### Keep the interface local-first

Storage messaging is part of the UI. Settings explicitly identifies local data and shows the desktop data folder or browser `localStorage`. This is communicated as a small supporting detail, not as a marketing banner.

## 3. Shell and Layout

### Native desktop shell

The desktop app uses a frameless, transparent, hidden-title-bar window. The native window is initially `380px` wide by `680px` high and is positioned at approximately `(80px, 80px)` on launch. The webview fills the window.

The visible panel is a rounded rectangle inside that transparent window:

- Width: fills the native window.
- Height: fills the native window.
- Panel radius: `18px`.
- Panel border: a faint light or dark translucent line.
- Panel shadow: `0 12px 40px rgba(0, 0, 0, 0.22)` plus a smaller `0 2px 8px` shadow.
- Overflow: hidden so the shell clips its internal content and keeps its rounded silhouette.
- Layout: vertical flex column.

The panel is not visually translucent despite the stylesheet comment describing it as translucent. The panel background is opaque in both themes. Transparency belongs to the native window around the panel so the shadow and rounded edge can read cleanly.

### Browser shell

Browser mode places the same panel in the center of a full-page backdrop:

- Body background: diagonal blue-gray gradient from `#3d5a80` through `#6b8cae` to `#a8bdd0`.
- Horizontal alignment: centered.
- Vertical alignment: centered.
- Panel width: `380px`.
- Panel height: `min(680px, 92vh)`.

Browser mode is a preview of the desktop utility rather than a separate responsive website. It preserves the same narrow panel proportions and uses scrolling where the native desktop window would grow.

### Main vertical structure

The full panel follows this order:

1. Top bar.
2. Scrollable list or settings content.
3. Fixed composer on the list screen.
4. Resize grip on desktop.

The top bar and composer are flex-shrink resistant. The list and settings regions own the available vertical space and scroll independently inside the panel.

### Panel dimensions and constraints

The desktop resize grip permits a minimum window size of approximately `280px` by `360px`. The panel is therefore expected to remain usable at narrow sizes, but it is not designed as a mobile layout.

There are no media queries. Adaptation comes from flex behavior, text clamping, scrolling, maximum control widths, and native window resizing.

### Draggable surfaces

The native desktop window can be dragged from non-interactive surfaces:

- Panel background.
- List gaps.
- Section gaps.
- Empty list space.
- Composer padding.
- Settings background.
- Top bar outside controls.
- The minimized pill face.

Interactive controls are explicitly excluded from the drag region. This creates a grab-anywhere utility window while preserving normal behavior for inputs, buttons, cards, headers, menus, scrollbars, and the resize grip.

## 4. Color System

The color system is built around neutral surfaces and a single system-blue action accent. Light and dark themes use different values but preserve the same semantic roles.

### Light theme tokens

| Token | Value | Role |
| --- | --- | --- |
| `--panel-bg` | `#ececee` | Main panel surface |
| `--panel-border` | `rgba(255, 255, 255, 0.55)` | Panel edge highlight |
| `--card-bg` | `#ffffff` | Cards, search field, composer, settings rows |
| `--card-bg-hover` | `#fdfdfd` | Hovered cards and drop targets |
| `--card-bg-done` | `#f6f6f7` | Completed cards |
| `--card-bg-selected` | `#f3f8ff` | Selected cards |
| `--focus-border` | `rgba(0, 0, 0, 0.16)` | Keyboard focus border |
| `--text` | `#1d1d1f` | Primary text |
| `--text-dim` | `#86868b` | Secondary text, labels, controls |
| `--text-faint` | `#aeaeb2` | Placeholder text, metadata, quiet hints |
| `--accent` | `#007aff` | Links, selection, completion, active controls |
| `--accent-soft` | `rgba(0, 122, 255, 0.12)` | Accent halo and selected background support |
| `--ring` | `rgba(0, 122, 255, 0.5)` | Input focus ring |
| `--done` | `#007aff` | Filled completion check |
| `--danger` | `#d64541` | Delete and irreversible actions |
| `--hairline` | `rgba(0, 0, 0, 0.09)` | Dividers, thin borders |
| `--menu-bg` | `#fafafa` | Context menus |
| `--field-bg` | `#f1f1f3` | Switches, selects, compact controls |
| `--field-bg-hover` | `#e8e8ec` | Hovered compact controls |
| `--field-bg-focus` | `#f3f8ff` | Focused compact controls |
| `--switch-off` | `#d5d5da` | Off switch track |
| `--check-border` | `#c7c7cc` | Unchecked note circle |
| `--check-ghost-border` | `#d8d8dc` | Composer's non-interactive check circle |
| `--scroll-thumb` | `rgba(0, 0, 0, 0.18)` | Scrollbar thumb |
| `--strike` | `rgba(0, 0, 0, 0.25)` | Completed-note strikethrough |
| `--code-bg` | `rgba(0, 0, 0, 0.055)` | Inline code background |
| `--pill-grip` | `#b6b6bc` | Minimized pill grip dot |
| `--important` | `#ff9f0a` | Important-note amber |
| `--important-soft` | `rgba(255, 159, 10, 0.14)` | Important-note halo |

### Dark theme tokens

| Token | Value | Role |
| --- | --- | --- |
| `--panel-bg` | `#1f1f21` | Main panel surface |
| `--panel-border` | `rgba(255, 255, 255, 0.09)` | Panel edge |
| `--card-bg` | `#2b2b2e` | Cards, search field, composer, settings rows |
| `--card-bg-hover` | `#313134` | Hovered cards and drop targets |
| `--card-bg-done` | `#26262a` | Completed cards |
| `--card-bg-selected` | `#263140` | Selected cards |
| `--focus-border` | `rgba(255, 255, 255, 0.22)` | Keyboard focus border |
| `--text` | `#f2f2f4` | Primary text |
| `--text-dim` | `#9a9aa0` | Secondary text, labels, controls |
| `--text-faint` | `#6f6f76` | Placeholder text, metadata, quiet hints |
| `--accent` | `#0a84ff` | Links, selection, completion, active controls |
| `--accent-soft` | `rgba(10, 132, 255, 0.2)` | Accent halo and selected background support |
| `--ring` | `rgba(10, 132, 255, 0.55)` | Input focus ring |
| `--done` | `#0a84ff` | Filled completion check |
| `--danger` | `#ff5f57` | Delete and irreversible actions |
| `--hairline` | `rgba(255, 255, 255, 0.1)` | Dividers, thin borders |
| `--menu-bg` | `#2c2c2f` | Context menus |
| `--field-bg` | `#3a3a3e` | Switches, selects, compact controls |
| `--field-bg-hover` | `#454549` | Hovered compact controls |
| `--field-bg-focus` | `#2b3a4d` | Focused compact controls |
| `--switch-off` | `#48484d` | Off switch track |
| `--check-border` | `#5a5a60` | Unchecked note circle |
| `--check-ghost-border` | `#4a4a4f` | Composer's non-interactive check circle |
| `--scroll-thumb` | `rgba(255, 255, 255, 0.22)` | Scrollbar thumb |
| `--strike` | `rgba(255, 255, 255, 0.32)` | Completed-note strikethrough |
| `--code-bg` | `rgba(255, 255, 255, 0.09)` | Inline code background |
| `--pill-grip` | `#6f6f76` | Minimized pill grip dot |
| `--important` | `#ffb340` | Important-note amber |
| `--important-soft` | `rgba(255, 179, 64, 0.16)` | Important-note halo |

### Semantic color rules

- Blue means active, selected, focused, completed, or actionable.
- Amber means important but not destructive.
- Red means destructive or irreversible.
- Neutral grays carry most of the interface and should remain visually quiet.
- Pastels belong to user-defined section identity, not global status.
- White or near-white surfaces in light mode and charcoal surfaces in dark mode provide the main layer separation.

### Section color palette

Section colors are intentionally bright, soft pastels. They appear as a pill behind the uppercase section title, a softened rule, a count badge, a caret tint, and a subtle wash over the section's cards.

| Name | Hex |
| --- | --- |
| Blush | `#ffb3ba` |
| Peach | `#ffd6a5` |
| Lemon | `#fdffb6` |
| Mint | `#caffbf` |
| Sky | `#9bf6ff` |
| Periwinkle | `#a0c4ff` |
| Lavender | `#bdb2ff` |
| Rose | `#ffc6ff` |

Pastel section text is always dark (`#3c3c3f`) so the color remains readable in both application themes. Cards use `color-mix()` with approximately 13% section tint for active cards and 7% tint for completed cards.

## 5. Typography

### Font family

The interface uses a system-first sans-serif stack:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif
```

This supports the native utility character of the app and avoids loading a custom web font. Rendering uses antialiasing and a compact base size.

### Type scale

| Element | Size | Weight / treatment | Notes |
| --- | --- | --- | --- |
| Base UI | `13px` | Normal | Global body size |
| Note text | Inherits `13px` | Normal | Line height `1.45` |
| Section title | `11px` | `600`, uppercase | Letter spacing `0.02em` |
| Section count | `10px` | Normal | Faint unless tinted |
| Search and composer | Inherits `13px` | Normal | Uses system control typography |
| Context menu item | `12.5px` | Normal | Compact but readable |
| Context menu shortcut | `10.5px` | Normal | Faint keyboard hint |
| Metadata time chip | `9.5px` | `500` | Appears only on hover |
| Settings supporting copy | `11px` | Normal | Faint secondary line |
| Storage subtitle | `10.5px` | Normal | Tight line height |
| Storage badge | `8px` | `700`, uppercase | Letter spacing `0.07em` |
| Minimized pill label | `12px` | `500`, lowercase | Shows task count |
| About wordmark | `21px` | `700`, lowercase | Slight negative letter spacing |
| About description | `12px` | Normal | Line height `1.55` |
| Inline code | `11.5px` | Monospace | Cascadia Code, SF Mono, or Consolas |

### Text behavior

- Section labels are uppercase and compact to read as navigation landmarks.
- The product wordmark is lowercase in the About screen and minimized pill.
- Note text can contain a Markdown-lite subset: bold, italics, inline code, and links.
- Notes are clamped to four lines by default to keep the list scannable.
- Expanded notes remove the clamp and reveal the full content in place.
- Completed note text becomes faint and receives a line-through rather than being removed immediately.
- Long text breaks at word boundaries where possible and does not force the panel wider.
- Storage paths are displayed in a monospace face and ellipsized on one line.

## 6. Spacing, Shape, and Depth

The current system uses handcrafted values rather than a formal spacing scale. The repeated values still form a recognizable rhythm.

### Spacing rhythm

| Pattern | Measurement |
| --- | --- |
| Top bar outer padding | `12px 12px 8px` |
| Top bar control gap | `8px` |
| Search field internal gap | `6px` |
| Search field padding | `7px 10px` |
| List padding | `4px 12px 8px` |
| Section header padding | `10px 2px 6px` |
| Gap between note cards | `7px` |
| Card padding | `10px 12px` |
| Card content gap | `9px` |
| Composer outer padding | `8px 12px 12px` |
| Composer internal padding | `9px 12px` |
| Settings outer padding | `4px 12px 12px` |
| Settings row padding | `10px 12px` |
| Settings row gap | `10px` |
| Settings row separation | `7px` |
| Context menu outer padding | `4px` |
| Context menu item padding | `6px 10px` |
| Context menu item gap | `18px` |
| Empty state padding | `28px 20px` |

The overall rhythm is based on small increments of approximately 4px, 6px, 7px, 8px, 9px, 10px, and 12px. The layout feels dense because vertical gaps are small, while cards retain enough internal padding to remain individually legible.

### Radii

| Element | Radius |
| --- | --- |
| Main panel | `18px` |
| Minimized pill | `22px` |
| Note cards | `12px` |
| Search field | `10px` |
| Icon buttons | `9px` |
| Settings rows | `12px` through `var(--radius-card)` |
| Compact controls | `8px` |
| Context menu | `11px` |
| Menu items | `7px` |
| Pills and badges | `100px` |
| Screenshot preview | `8px` |
| Completion circle | `50%` |

Rounded geometry is used consistently. Cards are soft rectangles, controls are smaller soft rectangles, and status metadata uses full pills. The radius hierarchy makes the panel shell feel larger and calmer than its child controls.

### Shadows

Card depth is deliberately restrained:

```css
--shadow-card: 0 1px 2px rgba(0, 0, 0, 0.06),
               0 1px 1px rgba(0, 0, 0, 0.04);

--shadow-card-hover: 0 2px 8px rgba(0, 0, 0, 0.1);
```

The dark theme increases shadow opacity rather than introducing a different visual model. Hover raises a card by `1px` and increases the shadow. Selection adds a blue halo around the card. Important notes add a soft amber halo unless they are already selected or focused.

## 7. Main List Screen

The list screen is the primary workspace and should remain visually stable while the user captures, scans, selects, and moves notes.

### Top bar

The top bar contains:

- A flexible search field.
- An application menu icon button using the `...` glyph.
- A minimize-to-pill icon button using the `-` glyph.

The search field is a white or charcoal card-like surface with a `10px` radius and a small inline SVG magnifier. It has the same shadow language as note cards. Placeholder text is faint and the icon uses the faint text color.

Icon buttons are `30px` square, use a `9px` radius, and have a card surface plus small shadow. Their default color is dim text. Hover changes the icon to primary text and raises the shadow. The pinned state uses accent text and an accent-soft background.

The top bar is also a drag surface on desktop except for the controls.

### Sections

Each visible section has:

- A right-facing caret that rotates when expanded.
- An uppercase title.
- A flexible horizontal divider.
- An optional count of incomplete notes.
- A stack of cards.

Section headers are clickable to collapse or expand. Double-clicking directly on the title enters inline rename mode. Right-clicking opens section actions.

The count reports incomplete notes, not total notes. When a section has a pastel color, the count becomes a dark-text pill with a stronger tint and the divider receives a translucent version of the same color.

Collapsed sections preserve the header and animate the card region to zero height. When a search query exists, collapsed sections are effectively expanded for matching content so search results remain discoverable.

### Note cards

A note card is a horizontal flex row:

1. A circular completion control.
2. A flexible text body.
3. Optional screenshot content inside the body.
4. A hover-only creation-time chip positioned above the top-right edge.

Cards use a white or charcoal surface, a `12px` radius, `10px 12px` padding, and a small shadow. The content gap is `9px`. Cards are not borders by default; a transparent `1.5px` border reserves space for interaction states.

Cards support click selection, double-click editing, right-click menus, drag and drop, keyboard focus, and inline expansion. These behaviors are intentionally layered onto the same card surface instead of introducing separate toolbar controls.

### Composer

The composer remains fixed to the bottom of the list view. It visually resembles another card but is slightly more functional:

- Outer padding: `8px 12px 12px`.
- Inner surface: card background with `12px` radius.
- Inner padding: `9px 12px`.
- Leading ghost completion circle: `16px` diameter, non-interactive.
- Textarea: transparent, borderless, one row by default.
- Maximum height: `120px`.
- Enter submits.
- Shift+Enter inserts a newline.

When focused, the composer receives a translucent blue border. The focus treatment is intentionally contained within the composer instead of adding a large outer glow.

### Empty states

Empty list content is centered, faint, and short. The default message invites the user to type below. Search-empty content explicitly says no notes match the query. Empty states do not include illustrations or large buttons.

## 8. Note State Language

### Default

The default card is a neutral surface with a small shadow and normal text. The card is visually quiet so a list with many notes does not become noisy.

### Hover

Hover raises the card by `1px`, increases the shadow, reveals the creation-time chip, and increases screenshot chip visibility. The card does not change its fill color dramatically.

### Selected

Selected cards receive:

- Accent border.
- Cool blue selected background.
- A `3px` accent-soft outer halo.
- Hover-level shadow.

Selection is the primary multi-action signal. There is no separate selection toolbar; available actions remain in the context menu and keyboard shortcuts.

### Focused

Keyboard-focused cards that are not selected use a neutral focus border and a light focus shadow. This separates keyboard navigation from mouse or multi-selection state.

### Completed

Completed cards are de-emphasized rather than hidden by default:

- Opacity reduces to approximately `0.72`.
- Background changes to the done surface.
- Text becomes faint.
- Text receives a strikethrough.
- The circular check fills blue.
- The white checkmark draws into place.

Completed selected cards retain slightly more opacity (`0.85`) so selection remains visible.

### Important

Important cards use amber as a secondary semantic accent:

- A `3px` amber stripe runs down the left edge with `9px` inset from the top and bottom.
- A soft amber halo appears around the card unless it is selected or focused.
- The unchecked completion border becomes amber.
- A completed important card still uses blue for its filled completion state, keeping completion and importance semantically distinct.

### Expanded

Expanded cards remove the four-line clamp and show the complete note. Expansion does not create a separate detail view. It preserves the card's position and surrounding list context.

### Dragging

The dragged card reduces to `45%` opacity. The destination is made explicit with one of two treatments:

- A blue line and card border above or below the target card.
- A dashed, accent-bordered placeholder occupying the destination position.

Dropping onto a section header highlights the header with an accent-soft background. This makes cross-section movement legible even when the target section has no cards.

### Editing

Editing replaces the card text body with a transparent textarea using the same font and line height. The textarea receives focus automatically and selects the cursor at the end of the existing text. Ctrl+Enter or Cmd+Enter commits, Escape cancels, and blur commits.

## 9. Settings Screen

Settings uses the same panel shell and top bar as the list view. The top bar contains a left-facing back glyph and a centered title. The title uses right padding to visually balance the back control.

Settings are grouped into a long, scrollable vertical list. Each group has a small uppercase heading with dim text. Each setting is presented as a card-like row:

- Primary setting name on the left.
- Optional supporting description below it.
- Control on the right.
- `10px 12px` internal padding.
- `7px` spacing between rows.
- Card shadow matching note cards.

### General group

The General group contains appearance selection, sounds, complete-on-copy, default section, and desktop-only window behavior. Supporting copy explains the consequence of each setting in plain language.

### Global shortcuts group

On desktop, shortcut configuration uses the same row structure as other settings. On browser mode, the group is replaced by a subdued explanatory note that shortcuts are desktop-only.

Shortcut recording is a focused state: the field changes to `Press keys...`, receives an accent border and focused background, and pulses its border while recording. Escape restores the previous shortcut.

### Archive and Trash groups

Archive and Trash are list-like settings groups rather than separate screens. Their headings can show a count and a compact red clear action. Rows use ellipsized note text with Restore and Delete actions.

The user is protected from accidental loss by the action model:

- Clear archive moves archived notes to Trash.
- Delete moves notes to Trash.
- Delete forever removes them permanently.
- Empty trash purges all trashed notes and unreferenced screenshots.

### Storage card

Storage is represented by a dedicated card with:

- A `32px` accent-soft icon tile with `9px` radius.
- A title row.
- A `LOCAL ONLY` pill badge.
- Supporting copy.
- A monospace path.
- An Open folder action on desktop.

The card is one of the few places where the interface explicitly communicates product trust and data ownership.

### About entry

The About group is a normal settings row with a version subtitle and an Open button. It intentionally feels like another preference rather than a separate branded marketing surface.

## 10. About Screen

The About screen uses the settings layout and adds a centered hero.

The hero includes:

- A `56px` square theme-matched logo.
- `14px` image radius.
- A subtle drop shadow.
- Lowercase `oxidized` wordmark at `21px`, weight `700`.
- Version text at `11px` in faint text.
- A centered description constrained to `300px` with `12px` type and `1.55` line height.

The logo swaps between light and dark embedded PNG data URIs based on the resolved theme. The rest of the About screen is a settings-like list of link rows and credits, not a custom landing page.

The current product naming is inconsistent: the package, window, and most UI use `Oxide`, while the About wordmark and pill label use `oxidized`. This should be treated as a brand decision to resolve, not silently normalized in future UI work.

## 11. Context Menus and Overlays

### Context menus

Context menus are fixed-position floating surfaces:

- Minimum width: `190px`.
- Background: theme menu surface.
- Radius: `11px`.
- Border: one hairline.
- Shadow: `0 8px 30px rgba(0, 0, 0, 0.18)`.
- Outer padding: `4px`.
- Item radius: `7px`.
- Item padding: `6px 10px`.
- Label-to-shortcut gap: `18px`.

Menu items are compact, left-aligned, and use an accent-soft hover background. Keyboard hints are right-aligned in faint text. Disabled items use faint text and disable pointer events. Destructive items use the danger color and a danger-tinted hover background.

Sections inside menus use an uppercase, letter-spaced subheading at `10px`. Separators are one-pixel hairlines with small horizontal margins.

On desktop, the transparent native window can grow temporarily so a menu can extend beyond the panel without being clipped. The pre-menu native frame is restored after the menu closes. In browser mode, menus are clamped inside the viewport and may scroll vertically.

### Toasts

Toasts appear above the composer, centered horizontally:

- Bottom offset: `74px`.
- Dark translucent background: `rgba(29, 29, 31, 0.92)`.
- White text at `12px`, weight `500`.
- Pill radius: `100px`.
- Padding: `7px 16px`.
- Shadow: `0 4px 16px rgba(0, 0, 0, 0.25)`.

They enter from `8px` below with reduced opacity and scale (`0.94`), then settle to full opacity and scale. They remain for approximately `1.6s` and are pointer transparent.

### Screenshot previews

The source-window screenshot is exposed as a small pill button inside the note body. The button uses a camera SVG, `10px` text, a full pill radius, and field background. It is semi-transparent until the card is hovered or the preview is open.

The opened image has:

- Maximum width of the card body.
- Maximum height of `220px`.
- `8px` radius.
- A hairline border.
- A card shadow.

While the image is being written or loaded, the preview region uses a `48px` minimum height and a pulsing field background. If the image never becomes available, the reference is removed and a toast explains the failure.

## 12. Minimized Pill

The minimized pill is a second physical state of the same panel rather than a new window concept.

### Dimensions

- Panel face: `160px` by `44px`.
- Native window includes approximately `16px` extra space so the shadow is not clipped.
- Radius: `22px`.
- Shadow: `0 1px 5px rgba(0, 0, 0, 0.2)`.

### Content

The pill hides the top bar, list, composer, settings, and resize grip. It shows:

- An `8px` grip dot.
- A lowercase label such as `oxidized - 4 tasks`.
- A label area that acts as the click-to-expand surface and drag handle.

The label reports the number of incomplete notes in visible, non-system sections. It is a compact status summary, not a navigation breadcrumb.

### Capture feedback

When a capture arrives while minimized, the pill can either expand automatically or flash depending on the setting. The flash repeats three times over approximately `1.6s`, adding an accent border, accent halo, and blue glow. This preserves awareness without forcing the user out of the minimized state.

## 13. Motion System

Motion uses short durations and a Mac-style settling curve:

```css
--ease: cubic-bezier(0.32, 0.72, 0, 1);
```

The general motion principle is quick response followed by a small, soft settle. Motion should communicate state change and spatial continuity, not provide decoration.

### Timing reference

| Motion | Duration | Behavior |
| --- | --- | --- |
| Card hover and state transition | `120ms` to `240ms` | Shadow, border, fill, opacity, and transform |
| Completion control | `150ms` to `250ms` | Fill, border, scale, and check drawing |
| Section collapse | `320ms` | Grid row collapses from `1fr` to `0fr` |
| Section caret | `280ms` | Rotates between expanded and collapsed |
| Card entrance | `300ms` | Fades in, moves up `7px`, scales from `0.965` |
| Card removal | `160ms` | Fades, moves right `10px`, scales to `0.94` |
| Completion pop | `320ms` | Scales to `1.35` at 45%, then settles |
| Card settle | `300ms` | Briefly scales to `0.982` and returns |
| Context menu entrance | `150ms` | Fades and scales from `0.95`, moves up `4px` |
| Context menu exit | `130ms` | Fades and scales down to `0.94`, moves up |
| Toast entrance/exit | `180ms` | Fades and translates vertically |
| Pill morph | `300ms` to `340ms` | Width, height, radius, transform, and shadow |
| Pill capture flash | `500ms`, repeated 3 times | Accent glow and border pulse |
| Screenshot loading | `1.1s` loop | Opacity pulse |
| Shortcut recording pulse | `1.1s` loop | Border-color pulse |
| Card FLIP movement | `400ms` | Old position to new position with slight overshoot |

### Card entrance and removal

New notes animate from below with a small scale reduction and opacity fade. Removed cards move slightly right while fading and shrinking. These are intentionally short so rapid capture remains responsive.

### Completion animation

The done class is applied one animation frame after the card initially renders in its previous state. This allows the border, fill, checkmark stroke, opacity, text color, and strikethrough transitions to actually run instead of appearing instantaneously.

The checkmark uses SVG stroke-dashoffset. The stroke starts hidden and draws into view when the card becomes done. A separate scale pop on the check control provides tactile emphasis.

### Section collapse

The card stack is wrapped in a CSS grid whose row transitions from `1fr` to `0fr`. The cards also fade to zero opacity. This avoids an abrupt disappearance while keeping the layout height animation smooth.

### Reordering and drag movement

After a reorder, move, deletion, or other list rebuild, visible card rectangles are captured before rendering. Cards animate from their previous positions to their new positions using the Web Animations API. The animation briefly overshoots by approximately 6% of the travel distance before settling.

This is a FLIP-style continuity pattern and is important because the application frequently rebuilds the DOM after selection and state changes.

### Press feedback

Controls use subtle compression:

- Icon buttons scale to `0.9`.
- Completion circles scale to `0.86`.
- Pill labels scale to `0.97`.
- Compact settings buttons scale to `0.94`.
- Switch knobs stretch horizontally while pressed.

The feedback is deliberately small and fast. It should feel like a physical click, not a button animation.

### Sound as motion companion

There are no audio files. `src/mainview/sounds.ts` synthesizes short Web Audio oscillator tones with fast attack and smooth decay. The sound palette mirrors the visual language:

- Completion: bright two-note rising pop.
- Uncompletion: soft downward blip.
- Capture: triangle-wave rising tone followed by a higher note.
- Copy: short high tone.
- Delete: lower triangle-wave falling tone.
- Add note and pill toggle: neutral short pop.

Sounds are controlled by the Settings switch and are intentionally quiet. They reinforce actions without becoming a persistent notification channel.

## 14. Interaction Model

### Selection

- Click selects one card.
- Clicking the only selected card again clears selection.
- Ctrl-click or Cmd-click toggles individual selection.
- Shift-click selects a visible range.
- Ctrl+A or Cmd+A selects all visible notes.
- Escape clears selection.
- Clicking list background clears selection when the pointer did not move.

The selected card style is both a state indicator and an action target. There is no persistent toolbar, which keeps the panel compact.

### Keyboard navigation

The keyboard model is central to the product:

| Shortcut | Action |
| --- | --- |
| Up / Down | Move focus through visible notes |
| Shift + Up / Down | Extend selection while moving |
| Alt + Up / Down | Move selected notes |
| Space | Toggle completion |
| Enter | Edit the focused note |
| Delete / Backspace | Move selected notes to Trash |
| Ctrl+C / Cmd+C | Copy plain text |
| Ctrl+Alt+C / Cmd+Option+C | Copy as numbered list |
| Ctrl+D / Cmd+D | Duplicate |
| Ctrl+I / Cmd+I | Toggle important |
| Ctrl+M / Cmd+M | Merge |
| Ctrl+E / Cmd+E | Archive |
| `/` or Ctrl+F / Cmd+F | Focus search |
| Typing with no selection | Focus composer |

When a note is focused, the list scrolls it into view using nearest-edge scrolling. Inputs and textareas stop the global key handler from interpreting text entry as note actions.

### Search and filtering

Search filters note text case-insensitively. The search field is continuously visible in the top bar. Escape clears the query and blurs the field. Arrow Down leaves the search field and focuses the first visible note.

The application menu also provides Hide completed. Search and completion filtering are applied before keyboard navigation and selection range calculations.

### Note actions

Right-clicking a note opens actions for:

- Copy.
- Copy as List.
- Copy as Markdown.
- Mark done or not done.
- Mark important or remove important.
- Expand or collapse.
- Edit.
- Duplicate.
- Merge Notes.
- Archive.
- Move to another section.
- Delete.

Multi-selection changes labels to include the note count and disables actions that only make sense for one note, such as Edit.

### Section actions

Right-clicking a section opens actions for:

- Setting it as the capture target.
- Renaming.
- Collapsing or expanding.
- Choosing a pastel color.
- Deleting the section while keeping its notes.
- Deleting the section and its notes.

### Application menu

The top-right application menu contains:

- New section.
- Collapse all.
- Hide completed.
- Clear completed.
- Settings.
- Desktop-only always-on-top behavior.
- Desktop-only hide panel.
- Desktop-only quit.

The menu stays small and action-oriented. Settings and application-level operations are intentionally hidden behind the menu so the main list remains uncluttered.


## 15. Responsive and Platform Behavior

Oxide has two related execution environments.

### Desktop-only behavior

The Electrobun desktop shell provides:

- Frameless transparent window behavior.
- Always-on-top support.
- Global shortcuts.
- Clipboard capture from other applications.
- Double-tap capture.
- Source-window screenshots.
- Native window movement and snap positions.
- Native data-folder access.
- Hide, show, and quit actions.
- Window resize and minimized pill resizing.

The desktop panel is intended to remain above active work and can be positioned at a screen edge or corner.

### Browser behavior

Browser mode provides the core local scratchpad experience:

- Notes and settings persist in `localStorage`.
- External links open in a new browser tab.
- The panel is centered on a blue-gray gradient.
- Global shortcuts and native capture are unavailable.
- Screenshot loading is disabled.
- Menus are clamped to the viewport.
- The panel cannot grow its browser window and uses internal scrolling.

The browser version should preserve the same visual semantics even when a native capability is unavailable. For example, it explains that global shortcuts are desktop-only rather than rendering broken controls.


## 16. Assets and Iconography

Iconography is deliberately minimal:

- Search uses an inline SVG magnifier.
- Source screenshots use an inline SVG camera.
- Storage uses an inline SVG folder.
- Completion uses an inline SVG checkmark.
- Back, menu, and minimize use text glyphs: `<`, `...`, and `-` equivalents in the current implementation.

There is no icon library. This keeps the binary and dependency footprint small and gives the controls a simple utility character. If new icons are added, they should use the existing inline SVG approach, inherit `currentColor`, and use the same small stroke-based visual weight.

The About logos are embedded as base64 PNG data URIs in `src/mainview/logo.ts`. The source assets are `logo-1024-1024-white.png` and the corresponding dark logo asset. The logo is theme-switched rather than recolored through CSS.

## 17. Accessibility and Quality Notes

The current visual system is strong, but several implementation details should be considered when extending it.

### Focus visibility

Some native inputs and settings controls have focus styling, but cards and completion controls are `div` elements with click handlers, and many buttons do not have explicit `:focus-visible` styling. Future work should preserve the visual language while adding clear keyboard focus rings to every interactive element.

### Reduced motion

The interface currently uses many transitions and animations but does not implement `prefers-reduced-motion`. A reduced-motion mode should disable or shorten:

- Card entrance and exit transforms.
- FLIP movement.
- Pill morphing.
- Completion pop.
- Menu scaling.
- Screenshot and shortcut pulses.

Opacity and color changes can remain if they do not cause discomfort.

### Contrast

The design intentionally uses faint metadata and muted completed states. Contrast should be checked whenever new muted text or tinted sections are introduced, especially in dark mode and on pastel backgrounds.

### Interaction semantics

The card interaction model is powerful but implemented with non-semantic `div` elements. If the UI is made more accessible, preserve the existing visual states while adding appropriate roles, keyboard activation, focus management, and announcements for bulk actions.

### Theme consistency

Some values bypass semantic tokens:

- The focused card halo uses a hardcoded light black shadow.
- Danger-menu hover uses a hardcoded light-theme red alpha.
- Shortcut recorder pulse uses a hardcoded light-theme blue alpha.

These should be tokenized if the dark theme is refined.


The UI deliberately delays some DOM changes by one or two frames to expose transitions. New interactions should avoid rebuilding the entire panel when a local class toggle can preserve focus, scroll position, and motion continuity.


These are observations from the current implementation, not arbitrary style preferences:

- Product naming alternates between `Oxide` and `oxidized`.
- Archive and Trash are identified by section title, so renaming a normal section to one of those names changes its system behavior.
- The stylesheet's opening comment calls the panel translucent even though the panel background is opaque.
- No reduced-motion mode exists.
- Focus treatment is not uniformly visible across all interactive elements.
- Several dark-theme-sensitive colors are hardcoded outside the token layer.
- The context-menu Expand/Collapse label is based on the first selected note while the action toggles every selected note, which can produce a misleading label for mixed selections.
- Embedded logo data must be regenerated when source logo assets change.
- There are no media queries, so the design is optimized for a narrow desktop utility rather than a general mobile experience.


When adding a new component or state, follow these rules:

- Start with an existing surface: panel, card, field, or menu. Do not introduce a new visual material without a clear hierarchy reason.
- Use the semantic theme tokens for color. Add a token when a color has a reusable meaning.
- Keep primary text near `13px` and supporting text between `10px` and `12px` unless the content hierarchy clearly needs another scale.
- Use `12px` card radius for content surfaces and `8px` to `10px` for compact controls.
- Keep gaps in the existing small rhythm, generally between `4px` and `12px`.
- Use blue for active and completed states, amber for importance, and red only for destructive actions.
- Prefer local state feedback over global overlays.
- Use short transitions with the shared `--ease` curve and avoid elastic or decorative motion.
- Preserve list continuity with FLIP-style movement when an action reorders or removes cards.
- Keep content dense but allow text to breathe inside cards through `10px 12px` padding and `1.45` line height.
- Add a dark-theme value for every light-theme token.
- Add a reduced-motion fallback for every new transform or repeating animation.
- Preserve browser mode as a graceful core experience when a native desktop capability is unavailable.
- Keep destructive actions separated from routine actions and use the danger color consistently.


| Area | Primary source |
| --- | --- |
| Global tokens and all component styles | `src/mainview/style.css` |
| Application state and screen rendering | `src/mainview/index.ts` |
| Main list, composer, card rendering | `src/mainview/index.ts:775-1346` |
| Minimized pill and resize behavior | `src/mainview/index.ts:1348-1484` |
| Settings screen | `src/mainview/index.ts:1487-1880` |
| About screen | `src/mainview/index.ts:1882-1965` |
| Settings control patterns | `src/mainview/index.ts:1967-2133` |
| Context menus and section palette | `src/mainview/index.ts:2149-2503` |
| Toasts and keyboard navigation | `src/mainview/index.ts:2505-2662` |
| Theme resolution and desktop dragging | `src/mainview/index.ts:2664-2738` |
| Browser/desktop boot behavior | `src/mainview/index.ts:2740-2803` |
| Synthesized UI sounds | `src/mainview/sounds.ts` |
| Theme-specific About logos | `src/mainview/logo.ts` |
| Shared note, section, and settings shape | `src/shared/types.ts` |
| Native window, capture, screenshots, and shortcuts | `src/bun/index.ts` |
| Product positioning and feature inventory | `README.md` |
