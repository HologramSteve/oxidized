# Floating Utility UI Display Language

This document defines the visual language of the current interface and translates it into a reusable design system for other applications.

The source reference is Oxide, a compact floating scratchpad. The rules below intentionally avoid depending on scratchpads, notes, sections, desktop shells, or any other specific product model. They describe how to reproduce the same visual character for a task manager, launcher, inbox, inspector, dashboard, capture tool, or other focused utility.

The goal is not to copy isolated colors or rounded corners. The goal is to reproduce the relationship between density, hierarchy, state, motion, and restraint that makes the interface feel like the same design family.

## 1. Style Summary

The display language is a calm, compact, tactile utility interface.

It should feel:

- Small enough to live beside other work.
- Dense enough to support frequent scanning.
- Quiet enough to stay open for long periods.
- Native enough to feel like part of the operating system.
- Tactile enough that clicks, selections, and transitions feel physical.
- Personal and local rather than corporate or dashboard-like.
- Keyboard-friendly without looking like a terminal.

The visual signature is built from:

- An opaque rounded panel floating above the environment.
- A neutral canvas with lighter or darker raised surfaces.
- System-like typography at a compact `13px` base size.
- Small rounded fields, cards, menus, and pills.
- One clear blue action accent.
- Amber for importance and red for destructive actions.
- Soft shadows instead of heavy borders.
- Short transitions with a gentle settling curve.
- Feedback that stays close to the element being changed.

The interface should communicate competence and calm. It should not look playful, glossy, futuristic, corporate, or heavily branded.

## 2. Design Intent

### The emotional target

The user should feel that the application is:

- Ready immediately.
- Easy to trust.
- Easy to scan.
- Hard to accidentally damage.
- Responsive without being frantic.
- Present without demanding attention.

### The primary design tension

The interface must hold a lot of state in a small space without becoming visually loud. Solve this through hierarchy rather than decoration:

- Use surface contrast before borders.
- Use spacing before dividers.
- Use opacity before extra colors.
- Use local state changes before global notifications.
- Use type weight before large type.
- Use motion to explain change, not to decorate the screen.

### Anti-goals

Avoid these visual directions when extending the system:

- Large hero sections inside a utility surface.
- Full-bleed gradients inside the main panel.
- Persistent colored toolbars.
- Thick outlines around every control.
- Large floating action buttons.
- Excessive glassmorphism or blur.
- Neon status colors.
- Bouncy, elastic, or playful motion.
- Card layouts with equal visual weight for every element.
- Dense icon-only controls without tooltips or context.
- Marketing-style copy inside operational screens.

## 3. Core Design Grammar

The style can be understood as seven rules that should remain true regardless of the application domain.

### 1. Neutral first

Most of the interface is neutral. The default state should be visually quiet. Color appears when the user needs to understand action, selection, importance, danger, or completion.

### 2. Layer by surface

Use a small number of surfaces with clear depth relationships:

1. Environment or backdrop.
2. Main panel.
3. Raised content surfaces.
4. Fields and compact controls.
5. Floating menus and temporary feedback.

Do not introduce a new surface color for every component. Reuse the same surfaces so the interface feels coherent.

### 3. Keep controls compact

Controls should occupy the smallest comfortable footprint. The current reference uses `30px` icon buttons, `8px` to `10px` compact-control radii, and `10px 12px` card padding. Keep labels readable, but do not surround small actions with oversized visual containers.

### 4. Give state a local visual owner

The element that changes should show the change whenever possible:

- A selected item gets the accent border and halo.
- A completed item changes its own opacity and text treatment.
- A loading preview pulses in its own region.
- A menu item owns its hover state.
- A compact shell flashes when an event arrives while minimized.

Use a toast only when the result is not otherwise visible or when the user needs confirmation after the element has disappeared.

### 5. Use semantic accents

Blue, amber, and red have stable meanings. Do not use them as arbitrary decoration:

- Blue: active, selected, focused, linked, completed, or primary.
- Amber: important, pinned, or needs attention without being destructive.
- Red: destructive, irreversible, or failure.
- Pastels: user-defined grouping or categorization.

### 6. Preserve spatial continuity

When content moves, the interface should show where it came from and where it went. Prefer local transforms, FLIP movement, collapses, and morphs over instant replacement.

### 7. Make the shell feel physical

The panel is an object with an edge, a shadow, a drag surface, and compact states. It should feel like a small tool that can be moved, resized, minimized, and brought back without losing its identity.

## 4. Application Shell

### Baseline form

The reference form is a narrow floating panel:

| Property | Baseline |
| --- | --- |
| Width | `380px` |
| Height | `680px` |
| Minimum width | `280px` |
| Minimum height | `360px` |
| Panel radius | `18px` |
| Main layout | Vertical flex column |
| Panel overflow | Hidden |
| Content overflow | Internal scrolling |
| Native shadow | `0 12px 40px rgba(0, 0, 0, 0.22)` plus `0 2px 8px` |

These values are a visual baseline, not a requirement that every app use exactly `380px` by `680px`. Preserve the proportion: narrow, tall, and immediately scannable. For a wider application, increase the dimensions proportionally while keeping the same radius hierarchy and density.

### Panel anatomy

A typical shell contains:

1. A top bar with search, title, navigation, or compact actions.
2. A flexible scrollable workspace.
3. A fixed primary input or action area when the product has continuous capture or entry.
4. An optional resize affordance in the bottom-right corner.

The top bar and fixed action area should not shrink away when the workspace becomes crowded. The workspace owns overflow.

### Desktop presentation

For a desktop or embedded utility:

- Use a frameless or visually frameless surface where the platform permits it.
- Hide redundant native title chrome if the application already has a custom shell.
- Keep the panel opaque and use the transparent area around it only for the rounded edge and shadow.
- Make safe background regions draggable if the platform supports window movement.
- Exclude controls, fields, scrollbars, cards, and resize handles from drag behavior.

### Browser presentation

For a browser or responsive version:

- Center the panel over a subdued blue-gray backdrop.
- Preserve the narrow utility proportion.
- Cap the panel height around `92vh`.
- Let the internal workspace scroll instead of forcing the page to grow.
- Keep the same component surfaces and state colors.
- Gracefully replace unavailable native actions with explanatory copy.

The browser version should feel like the same utility in a different container, not like a separate marketing page.

### Backdrop

When the panel needs a visible browser backdrop, use a restrained diagonal blue-gray gradient:

```css
background: linear-gradient(
  135deg,
  #3d5a80 0%,
  #6b8cae 50%,
  #a8bdd0 100%
);
```

The gradient belongs outside the panel. Avoid putting this gradient behind individual cards or controls.

## 5. Surface Hierarchy

The interface should have enough contrast to separate layers without making every layer feel like a separate object.

### Surface levels

| Level | Light treatment | Dark treatment | Use |
| --- | --- | --- | --- |
| Environment | Blue-gray backdrop or transparent desktop surroundings | Dark surroundings or transparent desktop surroundings | Outside the panel |
| Panel | `#ececee` | `#1f1f21` | Main shell |
| Raised surface | `#ffffff` | `#2b2b2e` | Cards, rows, search, composer |
| Raised hover | `#fdfdfd` | `#313134` | Hover and drop targets |
| Completed surface | `#f6f6f7` | `#26262a` | De-emphasized completed content |
| Field surface | `#f1f1f3` | `#3a3a3e` | Selects, switches, compact controls |
| Field hover | `#e8e8ec` | `#454549` | Hovered fields |
| Menu surface | `#fafafa` | `#2c2c2f` | Floating menus |

### Surface rules

- Use the panel surface as the quiet background.
- Use raised surfaces for content that can be selected, edited, or acted upon.
- Use field surfaces for controls that are secondary to content.
- Use menu surfaces only for elements floating above the shell.
- Do not use shadows to compensate for insufficient color contrast.
- Do not make every surface pure white in light mode or pure black in dark mode.

### Borders and hairlines

Borders are reserved for:

- Panel edges.
- Interaction states.
- Menu edges.
- Screenshot or media boundaries.
- Thin separators.

Default cards should reserve border space with a transparent border if selected or focused states need to appear without changing layout size. Avoid outlining every default card.

## 6. Color Tokens

Use semantic names in implementation. The values below are the reference palette, while the roles are more important than the exact hex values.

### Light theme

| Token | Value | Meaning |
| --- | --- | --- |
| `--canvas` | `#ececee` | Main application canvas or panel |
| `--surface` | `#ffffff` | Raised content surface |
| `--surface-hover` | `#fdfdfd` | Hovered raised surface |
| `--surface-muted` | `#f6f6f7` | Completed or de-emphasized surface |
| `--surface-selected` | `#f3f8ff` | Selected surface |
| `--surface-field` | `#f1f1f3` | Compact input/control surface |
| `--surface-field-hover` | `#e8e8ec` | Hovered compact control |
| `--surface-field-focus` | `#f3f8ff` | Focused compact control |
| `--surface-menu` | `#fafafa` | Floating menu surface |
| `--text` | `#1d1d1f` | Primary content text |
| `--text-secondary` | `#86868b` | Supporting text and labels |
| `--text-muted` | `#aeaeb2` | Placeholder, metadata, and quiet hints |
| `--accent` | `#007aff` | Primary active state |
| `--accent-soft` | `rgba(0, 122, 255, 0.12)` | Accent wash and halo |
| `--focus-ring` | `rgba(0, 122, 255, 0.5)` | Focus outline |
| `--danger` | `#d64541` | Destructive action |
| `--warning` | `#ff9f0a` | Important or attention state |
| `--hairline` | `rgba(0, 0, 0, 0.09)` | Thin border or divider |
| `--scroll-thumb` | `rgba(0, 0, 0, 0.18)` | Scrollbar thumb |
| `--code-surface` | `rgba(0, 0, 0, 0.055)` | Inline code |

### Dark theme

| Token | Value | Meaning |
| --- | --- | --- |
| `--canvas` | `#1f1f21` | Main application canvas or panel |
| `--surface` | `#2b2b2e` | Raised content surface |
| `--surface-hover` | `#313134` | Hovered raised surface |
| `--surface-muted` | `#26262a` | Completed or de-emphasized surface |
| `--surface-selected` | `#263140` | Selected surface |
| `--surface-field` | `#3a3a3e` | Compact input/control surface |
| `--surface-field-hover` | `#454549` | Hovered compact control |
| `--surface-field-focus` | `#2b3a4d` | Focused compact control |
| `--surface-menu` | `#2c2c2f` | Floating menu surface |
| `--text` | `#f2f2f4` | Primary content text |
| `--text-secondary` | `#9a9aa0` | Supporting text and labels |
| `--text-muted` | `#6f6f76` | Placeholder, metadata, and quiet hints |
| `--accent` | `#0a84ff` | Primary active state |
| `--accent-soft` | `rgba(10, 132, 255, 0.2)` | Accent wash and halo |
| `--focus-ring` | `rgba(10, 132, 255, 0.55)` | Focus outline |
| `--danger` | `#ff5f57` | Destructive action |
| `--warning` | `#ffb340` | Important or attention state |
| `--hairline` | `rgba(255, 255, 255, 0.1)` | Thin border or divider |
| `--scroll-thumb` | `rgba(255, 255, 255, 0.22)` | Scrollbar thumb |
| `--code-surface` | `rgba(255, 255, 255, 0.09)` | Inline code |

### Semantic color behavior

Color should communicate behavior consistently:

| Meaning | Treatment |
| --- | --- |
| Default | Neutral surface and primary text |
| Secondary | Dim text or field surface |
| Selected | Accent border, accent-soft halo, cool accent-tinted surface |
| Focused | Focus ring or neutral focus border with a small halo |
| Completed | Lower opacity, muted surface, muted text, optional strike |
| Important | Amber edge, marker, or soft amber halo |
| Destructive | Danger text and separated menu action |
| Disabled | Faint text, reduced contrast, no pointer response |
| Loading | Existing field surface with restrained opacity pulse |
| Drop target | Dashed accent border or accent line at destination |

### Pastel grouping colors

Pastels are optional and should represent user-defined groups, categories, or workspaces. They should not replace semantic status colors.

| Name | Value |
| --- | --- |
| Blush | `#ffb3ba` |
| Peach | `#ffd6a5` |
| Lemon | `#fdffb6` |
| Mint | `#caffbf` |
| Sky | `#9bf6ff` |
| Periwinkle | `#a0c4ff` |
| Lavender | `#bdb2ff` |
| Rose | `#ffc6ff` |

Apply a pastel primarily as:

- A small title pill.
- A softened divider.
- A count badge.
- A subtle background wash over related content.

Keep text on pastel surfaces dark, approximately `#3c3c3f`, so the grouping remains readable in both themes.

## 7. Typography

### Font personality

Use a system-first sans-serif stack:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
```

The system should feel native on the platform where it runs. Avoid decorative display fonts, condensed headline faces, and custom fonts that make a small utility feel like a brand campaign.

### Baseline type scale

| Role | Size | Weight | Line height | Treatment |
| --- | --- | --- | --- | --- |
| Primary UI and body | `13px` | `400` | `1.4` to `1.45` | Default content |
| Strong inline text | `13px` | `650` | Inherited | Bold emphasis |
| Group label | `11px` | `600` | Normal | Uppercase, `0.02em` spacing |
| Supporting text | `11px` | `400` | `1.4` to `1.5` | Secondary description |
| Metadata | `9.5px` to `10.5px` | `500` | Normal | Hover-only or supporting detail |
| Compact menu item | `12.5px` | `400` | Normal | Action label |
| Menu shortcut | `10.5px` | `400` | Normal | Faint keyboard hint |
| Compact pill label | `12px` | `500` | Normal | Lowercase status summary |
| Small brand title | `21px` | `700` | Normal | Optional About or identity mark |
| Inline code | `11.5px` | `400` | Inherited | Monospace |

### Type rules

- Use small uppercase labels as structural landmarks, not as primary content.
- Keep primary content near `13px` so many items can coexist in a narrow panel.
- Use weight changes more often than size changes to establish emphasis.
- Keep secondary text clearly subordinate through color and size, not through extreme opacity.
- Use lowercase for compact product labels or status pills when a softer utility tone is desired.
- Use a monospace face only for code, keyboard values, paths, IDs, or technical strings.
- Keep line lengths constrained inside cards so a long item does not dominate the entire panel.

### Text density

The style is information-dense but not typographically compressed. Preserve breathing room through:

- `1.45` line height for primary content.
- At least `10px 12px` internal card padding.
- Short supporting descriptions rather than paragraph-length explanations.
- Four-line clamping for list content when a detail view is not necessary.
- Ellipsis for paths and single-line utility metadata.

## 8. Spacing and Geometry

The spacing system is handcrafted but consistent. It favors small increments and avoids large empty regions inside the utility panel.

### Spacing rhythm

| Use | Baseline |
| --- | --- |
| Panel inset | `12px` |
| Top bar vertical padding | `8px` to `12px` |
| Main control gap | `8px` |
| Small internal gap | `4px` to `6px` |
| Card-to-card gap | `7px` |
| Card padding | `10px 12px` |
| Settings row gap | `7px` |
| Settings row padding | `10px 12px` |
| Menu item padding | `6px 10px` |
| Composer padding | `8px 12px 12px` |
| Empty-state padding | `28px 20px` |

Use the following mental scale when adding new layouts:

```text
4  6  7  8  9  10  12  16  20  28
```

The unusual `7px` card gap is part of the reference density. It keeps adjacent cards visually separated without producing a loose dashboard layout.

### Radius hierarchy

| Element | Baseline radius |
| --- | --- |
| Main shell | `18px` |
| Compact shell or pill | `22px` |
| Content card | `12px` |
| Search or larger field | `10px` |
| Icon button | `9px` |
| Compact field | `8px` |
| Menu item | `7px` |
| Screenshot or media preview | `8px` |
| Status badge | `999px` or `100px` |
| Circular status control | `50%` |

The shell radius should always be larger than the card radius, and the card radius should always be larger than the compact-control radius. This establishes nested scale without requiring more decoration.

### Width behavior

- Let the main content area fill the panel.
- Keep compact controls at their intrinsic width where possible.
- Cap right-side selects around `46%` of a settings row so labels retain room.
- Allow text bodies to shrink with `min-width: 0` and break long content.
- Keep menus at least `190px` wide so labels and keyboard hints do not collide.

## 9. Elevation and Depth

The reference uses low, soft elevation. Shadows should be felt more than seen.

### Card elevation

```css
--shadow-card:
  0 1px 2px rgba(0, 0, 0, 0.06),
  0 1px 1px rgba(0, 0, 0, 0.04);

--shadow-card-hover:
  0 2px 8px rgba(0, 0, 0, 0.10);
```

In dark mode, increase opacity rather than adding a bright outline. A dark surface can remain visually elevated through shadow and small tonal differences.

### Elevation rules

- The panel shadow is larger and softer than card shadows.
- Cards use a small resting shadow.
- Hover increases shadow and moves the card up `1px`.
- Selected cards use an accent halo in addition to normal elevation.
- Floating menus use a broad shadow because they sit above the panel hierarchy.
- Temporary toasts use a dark shadow and high-contrast content.
- Avoid multiple stacked shadows on the same element unless the extra shadow represents a semantic halo.

## 10. Component Recipes

These recipes are app-agnostic. Replace "item" with the content object relevant to the product.

### 10.1 Floating panel

Use a vertical flex container with:

- Opaque theme-aware canvas.
- `18px` radius.
- One subtle border.
- Large soft shadow.
- Hidden overflow.
- Scroll ownership delegated to the workspace.

The panel is the visual parent of every other surface. Child surfaces should not compete with it through stronger shadows or larger radii.

### 10.2 Top bar

Use a compact row with `8px` gaps and `12px` horizontal padding. A flexible search or title surface should take the available width. Icon buttons should be `30px` square.

Top-bar actions should be recognizable without large labels. Use inline SVGs or simple glyphs. Give each action a title or accessible name.

States:

- Default: card surface, dim icon, small shadow.
- Hover: primary icon color, slightly stronger shadow.
- Active: tiny scale compression.
- Selected or pinned: accent color and accent-soft surface.
- Focused: visible focus ring.

### 10.3 Search field

Use a raised surface with:

- `10px` radius.
- `7px 10px` padding.
- A `13px` or smaller inline icon.
- `6px` icon-to-text gap.
- Transparent native input.
- Faint placeholder text.

Search should look like a calm part of the shell, not like a dominant dashboard filter bar.

### 10.4 Group header

Use a single horizontal line containing:

1. A small caret or disclosure icon.
2. An uppercase group label.
3. A flexible hairline rule.
4. An optional muted count.

The header should be quieter than the content below it but more structured than empty space. A user-defined color can appear as a small pill behind the label and a softened rule.

States:

- Expanded: caret points into the content.
- Collapsed: caret rotates and content height closes.
- Drop target: accent-soft wash.
- Renaming: small field using the same label typography.

### 10.5 Content card

Use a `12px` radius, `10px 12px` padding, a small shadow, and a transparent reserved border. The usual anatomy is:

- A leading status or selection control.
- A flexible primary content body.
- Optional metadata or inline media.

Do not add a visible toolbar to every card. Keep secondary actions in a context menu, keyboard shortcut, or hover-only affordance.

States should be easy to distinguish without changing the card's layout:

- Default: neutral raised surface.
- Hover: `translateY(-1px)` and stronger shadow.
- Selected: accent border, blue-tinted surface, `3px` accent-soft halo.
- Focused: neutral border and small focus halo.
- Completed: muted opacity and surface; content becomes faint.
- Important: amber edge stripe and soft amber halo.
- Dragging: reduced opacity.
- Drop target: accent line or dashed placeholder.

### 10.6 Leading status control

A circular `16px` status control is a signature element for item lists. It should be visually light when empty and fill with the blue action color when complete.

Use an SVG checkmark with stroke-dash animation when the control represents completion. The control should have a small press scale, but the press should never shift neighboring content.

### 10.7 Composer or persistent input

When the product has continuous entry, keep the input fixed at the bottom of the panel. Make it resemble a content card rather than a large form:

- Card surface.
- `12px` radius.
- `9px 12px` internal padding.
- Transparent textarea or input.
- One row by default.
- Auto-grow only to a bounded maximum, approximately `120px`.
- Focus indicated by a translucent blue border.

The placeholder should describe the action in plain language. Do not add a large "Add" button unless the interaction cannot be inferred from the field.

### 10.8 Settings row

Use a repeated raised row pattern:

- Main label on the left.
- Optional one-line description beneath it.
- Control aligned to the right.
- `10px 12px` padding.
- `7px` vertical spacing between rows.

Supported controls include:

- A `36px` by `22px` pill switch.
- An `8px` rounded select field.
- A segmented control with a field-colored track and selected raised segment.
- A compact number field.
- A shortcut recorder with a minimum width around `130px`.
- A compact action button with `6px 10px` padding.

Settings should feel like the same product as the main workspace. Do not introduce a separate form design system.

### 10.9 Compact switch

Use a pill track with a white circular knob:

- Track: `36px` by `22px`.
- Knob: `18px` diameter.
- Knob inset: `2px`.
- Off track: muted neutral.
- On track: completion/accent blue.
- Transition: approximately `200ms` with the shared settling curve.

The knob may stretch slightly while pressed to create a tactile response.

### 10.10 Segmented control

Use a field-colored track with `2px` internal padding and `2px` between segments. Each segment uses a `6px` radius and compact `4px 9px` padding. The selected segment uses the raised surface, primary text, and a small shadow. Unselected segments use secondary text.

Do not use saturated fills for every segment. Only the selected segment should appear raised.

### 10.11 Context menu

Use a floating surface with:

- Minimum width around `190px`.
- `11px` radius.
- `4px` outer padding.
- `6px 10px` item padding.
- `7px` item radius.
- One-pixel hairline border.
- Broad soft shadow.

Menu items should align labels and keyboard hints in two columns. Use accent-soft hover, faint disabled text, and red only for destructive actions.

Group menu entries with small uppercase sublabels and thin separators. Avoid icons on every row unless the product genuinely needs them.

### 10.12 Toast

Use a short-lived dark pill centered near the bottom of the panel:

- `12px` text.
- `500` weight.
- `7px 16px` padding.
- Full pill radius.
- High contrast white text.
- A `180ms` fade and small upward settle.

Toasts are for confirmation, recovery, or asynchronous results. They should not be the only way the user can understand a persistent state.

### 10.13 Compact or minimized state

A utility panel may collapse into a pill or capsule:

- Around `160px` by `44px` as a baseline.
- `22px` radius.
- One small grip or status dot.
- One lowercase status label.
- Minimal shadow that fits inside the compact window.

The compact state should be a morph of the full panel. Hide secondary content with opacity and pointer changes, then reveal the compact face. Do not make the minimized form look like an unrelated badge.

## 11. State Language

Every interactive component should define how it looks in each relevant state before implementation.

### Default

Use the neutral surface, normal text, minimal shadow, and no accent color. Default state is the baseline against which all feedback is judged.

### Hover

Use a small elevation increase, a one-pixel upward movement where appropriate, and a modest surface or text-color change. Hover should be noticeable but never louder than selection.

### Focus

Use a visible focus ring or border. The reference uses a translucent blue ring for form controls and a neutral focus border for keyboard-focused cards. Focus must remain visible in both themes.

### Active or pressed

Use a quick scale reduction, generally between `0.86` and `0.97` depending on the control. Restore the original scale immediately after release. Never use a press transform that changes layout flow.

### Selected

Use the accent border, blue-tinted surface, and a soft `3px` accent halo. Selection is stronger than hover and should remain legible when the selected content is completed or important.

### Completed

De-emphasize without deleting:

- Reduce opacity to roughly `0.72`.
- Use the muted surface.
- Use muted text.
- Add a strikethrough if the content represents a finished item.
- Fill the leading status control with blue.

The completed state should remain discoverable and reversible.

### Important

Use amber as a narrow, secondary signal. A left edge stripe, small marker, or soft halo is preferable to coloring the entire card amber.

### Disabled

Use muted text, no pointer response, and no hover elevation. Do not make disabled content disappear entirely if the user needs to understand why an action is unavailable.

### Loading

Keep the same surface and shape as the final content. Use a subtle opacity pulse instead of a generic spinner whenever the loading region has a predictable size.

### Error or destructive

Use the danger color for the action label and a restrained danger-tinted hover. Keep destructive choices separated from normal actions with a hairline divider or menu spacing.

### Dragging and dropping

Reduce the dragged object to roughly `45%` opacity. Show the destination with a dashed placeholder, an accent line above or below the target, or an accent-soft drop region. The user should always know where the object will land before release.

## 12. Motion Language

Motion should feel quick, soft, and physical.

### Motion principles

- Respond immediately to input.
- Use short durations for direct manipulation.
- Use a gentle settle after a movement.
- Animate opacity, color, shadow, and transform together when they describe one state change.
- Preserve spatial identity when content reorders.
- Avoid exaggerated overshoot.
- Avoid continuous animation unless it communicates loading or recording.

### Shared easing

Use this as the default settling curve:

```css
--ease: cubic-bezier(0.32, 0.72, 0, 1);
```

For more complex list movement, the reference uses a related curve:

```css
cubic-bezier(0.3, 0.75, 0.35, 1)
```

### Timing scale

| Motion | Duration |
| --- | --- |
| Hover and border transition | `120ms` to `160ms` |
| Field or switch state | `150ms` to `200ms` |
| Checkmark draw | `250ms` |
| Press feedback | `140ms` to `150ms` |
| Menu entrance | `150ms` |
| Menu exit | `130ms` |
| Toast entrance | `180ms` |
| Card entrance | `300ms` |
| Card removal | `160ms` |
| Completion pop | `320ms` |
| Section collapse | `320ms` |
| Shell morph | `300ms` to `340ms` |
| List repositioning | `400ms` |
| Capture flash | `500ms` per pulse |

### Recommended animation recipes

#### Card entrance

Start at:

- Opacity `0`.
- Translate Y `7px`.
- Scale `0.965`.

Settle to normal opacity and transform over `300ms` using the shared curve.

#### Card removal

Animate toward:

- Opacity `0`.
- Translate X `10px`.
- Scale `0.94`.

Use approximately `160ms` and an ease-in curve so removal feels decisive.

#### Completion

Render the old state for one frame, then toggle the completed state so the browser can animate the transition. Draw the checkmark through SVG stroke-dashoffset. Add a small control pop to `1.35` scale at around 45% of the animation.

#### Collapse

Use a grid row transition from `1fr` to `0fr`, with the content opacity fading toward zero. Keep the group header in place.

#### Reordering

Capture old element rectangles, render the new order, calculate the positional delta, and animate each existing element from the old position to the new one. A small settle or approximately 6% overshoot is acceptable.

#### Menu

Enter from `scale(0.95) translateY(-4px)` to normal. Exit toward `scale(0.94) translateY(-5px)`. Keep the origin at the top-left where the menu appears.

#### Shell morph

When switching between full and compact states, animate width, height, radius, transform, and shadow together. Fade the full content out while revealing the compact face. The result should read as one object changing mode.

### Repeating animation

Use repeating pulses only for:

- Screenshot or media loading.
- Shortcut recording.
- Capture arrival while the shell is minimized.

The pulse should change opacity, border, or glow softly. Never make the whole panel continuously bounce.

### Reduced motion

Every animated component must have a reduced-motion behavior:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}
```

Where possible, retain useful color and opacity changes while removing translation, scale, morphing, and looping effects.

## 13. Interaction and Feedback

### Keyboard-first behavior

The UI should support a complete keyboard path for the main workflow:

- Search or filter focus.
- First-item focus.
- Up and down navigation.
- Range or multi-selection.
- Primary state toggle.
- Edit.
- Delete or archive.
- Copy or export.
- Escape to cancel, close, or clear.

Keyboard behavior should not require a visually dense shortcut toolbar. Keep shortcuts discoverable through menu hints, settings, help text, or tooltips.

### Direct manipulation

Mouse or pointer interactions should remain discoverable:

- Click selects or activates.
- Double-click edits or renames when appropriate.
- Right-click reveals secondary actions.
- Dragging reorders or moves content.
- Empty background clears selection.

Do not overload a single gesture with unrelated outcomes. If a card is draggable, make the drop position explicit.

### Selection model

The reference style avoids a persistent bulk-action toolbar. For other apps, use the same strategy when the panel must remain compact:

- Show selection directly on items.
- Keep bulk actions in a context menu or command layer.
- Add count-aware labels for multi-selection.
- Disable actions that cannot operate on the current selection.

### Feedback priority

Use this order when deciding how to communicate a result:

1. Change the affected element.
2. Animate the affected element if the transition benefits from explanation.
3. Use a local inline message if the element cannot show the result.
4. Use a toast for brief confirmation or asynchronous failure.
5. Use a modal only for high-risk confirmation or a blocking decision.

## 14. Iconography and Assets

### Icon style

Use a small, stroke-based icon language:

- Inline SVG is preferred for a small dependency footprint.
- Icons should inherit `currentColor`.
- Use rounded caps and joins where appropriate.
- Keep stroke weights around `1.8` to `2.4` for small icons.
- Keep common icons between `11px` and `17px`.
- Do not mix heavy filled icons with thin utility glyphs.

The reference uses inline icons for search, camera, storage, and completion. Very simple navigation or window controls can use text glyphs when their meaning is obvious.

### Icon placement

- Give icons a stable box so text does not shift when state changes.
- Use `6px` to `8px` gaps between an icon and its label.
- Use muted icon color by default.
- Let active icons inherit the semantic accent.
- Add accessible labels or titles to icon-only controls.

### Brand assets

Brand marks should be small and theme-aware. A `56px` square mark with a `14px` radius is sufficient for an About or identity surface in this style. Do not make branding larger than the utility's primary content hierarchy.

## 15. Responsive Adaptation

The visual language is optimized for a narrow utility, but it can be adapted to other contexts.

### Narrow desktop

- Keep the panel around `280px` to `380px` wide.
- Preserve `12px` side insets.
- Clamp content to four lines where scanning is more important than reading.
- Keep the composer or primary action fixed.
- Use internal scrolling.

### Wide desktop

- Increase panel width only when content genuinely benefits.
- Keep card padding and type scale stable rather than stretching all spacing.
- Use the extra width for content body or preview media, not oversized controls.
- Consider a secondary column only if the product requires persistent comparison.

### Mobile

- Let the panel become a full-width or near-full-width surface.
- Reduce outer radius only when the panel touches the viewport edge.
- Preserve the same cards, fields, color roles, and state language.
- Replace hover-only affordances with always-available labels or touch actions.
- Increase hit areas without making the visual containers feel oversized.
- Replace drag-only operations with explicit move controls where necessary.

### Embedded or browser contexts

- Keep the panel visually opaque.
- Use a restrained backdrop outside it.
- Clamp menus inside the available viewport.
- Explain unavailable native features inline.
- Do not expose controls that cannot work in the current environment.

## 16. Accessibility Rules

The quiet visual language must not become an inaccessible low-contrast language.

### Focus

Every interactive element needs a visible focus state. Use the blue focus ring or an equivalent high-contrast theme-aware border. Do not rely on hover styling for keyboard users.

### Contrast

Check all combinations of:

- Primary text on raised surfaces.
- Secondary text on the panel.
- Muted text on completed surfaces.
- Dark text on pastel group pills.
- Danger text on menu surfaces.
- Accent text on accent-soft backgrounds.

Muted does not mean unreadable. If metadata is important to completing a task, it should not use the faintest token.

### Semantics

Use semantic buttons, inputs, headings, lists, and dialogs where possible. If a visual card acts as a selectable or draggable item, expose that behavior through keyboard interaction and appropriate accessibility attributes.

### Motion

Support `prefers-reduced-motion`. Avoid using animation as the only signal of a state change. A completed, selected, or error state must remain understandable when all transforms are removed.

### Touch

When adapting to touch, preserve the visual density but increase the actual hit area through padding or invisible hit targets. Do not rely on hover to reveal critical actions.

## 17. Do and Do Not

### Do

- Use neutral surfaces as the majority of the interface.
- Use one primary blue accent consistently.
- Keep cards soft, compact, and lightly elevated.
- Use a clear radius hierarchy.
- Keep labels short and supporting copy quiet.
- Use uppercase labels for structural grouping.
- Make selected state stronger than hover state.
- Keep important state amber and destructive state red.
- Animate changes locally and briefly.
- Preserve spatial continuity when content moves.
- Keep a persistent primary input visually similar to a card.
- Make compact states morph from the full shell.
- Provide a dark-theme counterpart for every semantic token.
- Provide reduced-motion behavior for every animation.

### Do not

- Use accent blue for decorative backgrounds everywhere.
- Use amber or red as general branding colors.
- Put thick outlines around every resting component.
- Make every card equally prominent.
- Turn the settings screen into a separate visual product.
- Use large empty hero areas inside a focused utility.
- Hide critical state only behind hover.
- Use a toast as the only confirmation for a persistent change.
- Use large spring overshoots or playful bouncing.
- Add a new shadow level for every component.
- Mix unrelated icon families.
- Let desktop-only controls appear as broken browser controls.
- Treat dark mode as an inversion of light mode without adjusting semantic contrast.

## 18. Portable Implementation Tokens

The following starter token block can be used in another app as a direct translation of the display language:

```css
:root {
  --canvas: #ececee;
  --surface: #ffffff;
  --surface-hover: #fdfdfd;
  --surface-muted: #f6f6f7;
  --surface-selected: #f3f8ff;
  --surface-field: #f1f1f3;
  --surface-field-hover: #e8e8ec;
  --surface-field-focus: #f3f8ff;
  --surface-menu: #fafafa;

  --text: #1d1d1f;
  --text-secondary: #86868b;
  --text-muted: #aeaeb2;

  --accent: #007aff;
  --accent-soft: rgba(0, 122, 255, 0.12);
  --focus-ring: rgba(0, 122, 255, 0.5);
  --danger: #d64541;
  --warning: #ff9f0a;
  --hairline: rgba(0, 0, 0, 0.09);

  --radius-shell: 18px;
  --radius-card: 12px;
  --radius-field: 8px;
  --radius-menu: 11px;
  --radius-pill: 999px;

  --shadow-card:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 1px 1px rgba(0, 0, 0, 0.04);
  --shadow-card-hover: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-shell:
    0 12px 40px rgba(0, 0, 0, 0.22),
    0 2px 8px rgba(0, 0, 0, 0.1);

  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
  --ease-settle: cubic-bezier(0.32, 0.72, 0, 1);
}

:root[data-theme="dark"] {
  --canvas: #1f1f21;
  --surface: #2b2b2e;
  --surface-hover: #313134;
  --surface-muted: #26262a;
  --surface-selected: #263140;
  --surface-field: #3a3a3e;
  --surface-field-hover: #454549;
  --surface-field-focus: #2b3a4d;
  --surface-menu: #2c2c2f;

  --text: #f2f2f4;
  --text-secondary: #9a9aa0;
  --text-muted: #6f6f76;

  --accent: #0a84ff;
  --accent-soft: rgba(10, 132, 255, 0.2);
  --focus-ring: rgba(10, 132, 255, 0.55);
  --danger: #ff5f57;
  --warning: #ffb340;
  --hairline: rgba(255, 255, 255, 0.1);
}
```

## 19. Fast Recipe for Mirroring the Style

When creating a new app that should look like this interface, use this sequence:

1. Start with a narrow vertical panel around `380px` by `680px`.
2. Give it an opaque neutral canvas, an `18px` radius, and a broad soft shadow.
3. Add a compact top bar with `12px` horizontal padding and `8px` gaps.
4. Build the main content from raised `12px` cards with `10px 12px` padding and `7px` gaps.
5. Use the system sans-serif stack at a `13px` base size.
6. Reserve blue for active, selected, focused, and completed states.
7. Keep default content neutral and visually quiet.
8. Use amber as a narrow attention signal and red only for destructive actions.
9. Use a fixed bottom input or primary action when the workflow is continuous.
10. Keep menus compact, floating, rounded, and lightly shadowed.
11. Define hover, focus, selected, completed, disabled, loading, and destructive states before implementation.
12. Animate state changes with short durations and the shared settling curve.
13. Use local feedback first and toasts second.
14. Add a compact pill or collapsed mode only if the product benefits from staying present but out of the way.
15. Test the entire system in both light and dark themes.
16. Add reduced-motion behavior before shipping.

If the result feels too much like a generic dashboard, reduce color, reduce border weight, reduce the number of persistent controls, and return emphasis to surface hierarchy and spacing.

## 20. Current UI Translation Appendix

This appendix maps the portable language back to the reference implementation. It is intentionally separate from the main rules so the system can be reused without adopting the original product's domain.

### Reference shell

- Main panel: `.panel` in `src/mainview/style.css`.
- Top bar: `.topbar`.
- Scrollable workspace: `.list` and `.settings`.
- Persistent entry area: `.composer` and `.composer-inner`.
- Compact shell: `.panel.pill` and `.pill-face`.
- Resize affordance: `.resize-grip`.

### Reference content mapping

- Generic content item: `.card`.
- Generic group: `.section` and `.section-header`.
- Generic leading state control: `.check`.
- Generic inline media: `.card-shot`.
- Generic settings row: `.set-row`.
- Generic floating menu: `.ctxmenu`.
- Generic temporary confirmation: `.toast`.

### Reference state mapping

- Selected item: `.card.selected`.
- Keyboard-focused item: `.card.focused`.
- Completed item: `.card.done`.
- Important item: `.card.important`.
- Dragged item: `.card.dragging`.
- Drop position: `.drop-preview`, `.card.drag-over-top`, and `.card.drag-over-bottom`.
- Group collapsed state: `.section.collapsed`.
- Loading media: `.card-shot.loading`.
- Shortcut recording: `.shortcut-field.recording`.

### Reference motion mapping

- Card entrance: `card-in`.
- Card removal: `card-out`.
- Completion emphasis: `check-pop` and `card-settle`.
- Group collapse: `grid-template-rows` transition on `.cards-wrap`.
- Menu entrance and exit: `menu-in` and `menu-out`.
- Compact-shell transition: `.panel.morphing` and `.panel.pill`.
- Capture feedback: `pill-flash`.

### Reference source files

| Concern | Source |
| --- | --- |
| Global visual tokens and component styles | `src/mainview/style.css` |
| Screen and interaction rendering | `src/mainview/index.ts` |
| Synthesized feedback sounds | `src/mainview/sounds.ts` |
| Theme-specific identity assets | `src/mainview/logo.ts` |
| Shared state and settings shape | `src/shared/types.ts` |
| Native window and platform behavior | `src/bun/index.ts` |

The appendix is descriptive, not prescriptive. A new application should use the generic names and semantic rules in the main document, then adapt the components to its own content model.
