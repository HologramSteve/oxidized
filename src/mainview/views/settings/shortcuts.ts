// Settings → Shortcuts (desktop): the global hotkeys and what they do.

import type { DisplayInfo } from "../../../shared/ipc";
import type { SnapDisplay, SnapPosition } from "../../../shared/types";
import { TAP_WINDOW_MS } from "../../../shared/types";
import { h } from "../../dom";
import { store, updateSettings as update } from "../../store";
import { ui } from "../../ui";
import {
  numberRow,
  segmentedRow,
  selectRow,
  shortcutRow,
  toggleRow,
  type Option,
} from "../controls";

const SNAP_POSITION_OPTIONS: Option<SnapPosition>[] = [
  { value: "left", label: "Left edge" },
  { value: "right", label: "Right edge" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

function displayLabel(display: DisplayInfo, index: number): string {
  const name = display.label || `Display ${index + 1}`;
  const tags: string[] = [];
  if (display.primary) tags.push("primary");
  if (display.internal) tags.push("built-in");
  return tags.length ? `${name} · ${tags.join(" · ")}` : name;
}

function snapDisplayOptions(selected: SnapDisplay): Option[] {
  const options: Option[] = [
    { value: "primary", label: "Primary display" },
    { value: "current", label: "Current display" },
    ...ui.displays.map((display, i) => ({
      value: String(display.id),
      label: displayLabel(display, i),
    })),
  ];
  // keep a chosen monitor selectable while it is unplugged
  if (typeof selected === "number" && !options.some((o) => o.value === String(selected))) {
    options.push({ value: String(selected), label: "Disconnected display" });
  }
  return options;
}

function parseSnapDisplay(value: string): SnapDisplay {
  if (value === "primary" || value === "current") return value;
  const id = Number(value);
  return Number.isInteger(id) ? id : "primary";
}

/**
 * Rows that only matter while another option is on. They stay in the page
 * (so a flipped switch still animates) and are shown or hidden in place.
 */
function dependentRows(rows: HTMLElement[], visible: boolean): (visible: boolean) => void {
  const show = (on: boolean) => {
    for (const row of rows) row.style.display = on ? "" : "none";
  };
  show(visible);
  return show;
}

export function shortcutRows(): HTMLElement[] {
  const { settings } = store;
  const keys = settings.shortcuts;

  // how the snap shortcut behaves — only relevant once it has a key
  const snapDetails = [
    selectRow(
      "Snap position",
      "Where the snap shortcut sends the panel",
      SNAP_POSITION_OPTIONS,
      settings.snapPosition,
      (position) => update((s) => (s.snapPosition = position))
    ),
    selectRow(
      "Snap display",
      "Which monitor the snap shortcut uses",
      snapDisplayOptions(settings.snapDisplay),
      String(settings.snapDisplay),
      (value) => update((s) => (s.snapDisplay = parseSnapDisplay(value)))
    ),
  ];
  const showSnapDetails = dependentRows(snapDetails, keys.snapWindow !== "");

  const tapDetails = [
    segmentedRow(
      "Capture key",
      "Which key to double-tap",
      [
        { value: "shift", label: "Shift" },
        { value: "ctrl", label: "Ctrl" },
        { value: "alt", label: "Alt" },
      ],
      keys.doubleTapKey,
      (key) => update((s) => (s.shortcuts.doubleTapKey = key))
    ),
    numberRow(
      "Double-press window",
      "Max time between the two taps",
      keys.doubleShiftWindowMs,
      { ...TAP_WINDOW_MS, step: 50, suffix: "ms" },
      (ms) => update((s) => (s.shortcuts.doubleShiftWindowMs = ms))
    ),
  ];
  const showTapDetails = dependentRows(tapDetails, keys.doubleShiftCapture);

  return [
    h("div", "set-group", "Panel"),
    shortcutRow("Toggle panel", "Show / hide Oxide from anywhere", keys.togglePanel, (acc) =>
      update((s) => (s.shortcuts.togglePanel = acc))
    ),
    shortcutRow(
      "Snap to position",
      "Send the panel to its home spot from anywhere",
      keys.snapWindow,
      (acc) => {
        update((s) => (s.shortcuts.snapWindow = acc));
        showSnapDetails(acc !== "");
      }
    ),
    ...snapDetails,

    h("div", "set-group", "Capture"),
    shortcutRow("Capture clipboard", "Add clipboard text as a note", keys.captureClipboard, (acc) =>
      update((s) => (s.shortcuts.captureClipboard = acc))
    ),
    toggleRow(
      "Double-tap capture",
      "Tap the capture key twice to grab the current selection",
      keys.doubleShiftCapture,
      (v) => {
        update((s) => (s.shortcuts.doubleShiftCapture = v));
        showTapDetails(v);
      }
    ),
    ...tapDetails,
    toggleRow(
      "Skip duplicate captures",
      "Ignore identical text captured within 30 seconds",
      settings.dedupeCaptures,
      (v) => update((s) => (s.dedupeCaptures = v))
    ),
    toggleRow(
      "Expand on capture",
      "Pop the window out of the pill when a note is captured",
      settings.expandOnCapture,
      (v) => update((s) => (s.expandOnCapture = v))
    ),
  ];
}
