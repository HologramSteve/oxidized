// Settings validation, shared by the main process and the view.
//
// Settings arrive from places we don't control (a hand-edited settings.json,
// an older build, localStorage), so every field is checked against its type
// and falls back to the default. Unknown keys are dropped.

import {
  DEFAULT_SETTINGS,
  TAP_WINDOW_MS,
  type DoubleTapKey,
  type OxideSettings,
  type SnapDisplay,
  type SnapPosition,
  type ThemePreference,
  type WindowFrame,
} from "./types";

export const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];
export const SNAP_POSITIONS: readonly SnapPosition[] = [
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
export const DOUBLE_TAP_KEYS: readonly DoubleTapKey[] = ["shift", "ctrl", "alt"];

// far longer than any real accelerator; keeps junk out of globalShortcut
const MAX_ACCELERATOR_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** An empty accelerator is valid: it means "no shortcut". */
function accelerator(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length <= MAX_ACCELERATOR_LENGTH ? value : fallback;
}

function tapWindow(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(TAP_WINDOW_MS.min, Math.min(TAP_WINDOW_MS.max, Math.round(value)));
}

function snapDisplay(value: unknown): SnapDisplay {
  if (value === "primary" || value === "current") return value;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return DEFAULT_SETTINGS.snapDisplay;
}

function windowFrame(value: unknown): WindowFrame {
  const fallback: WindowFrame = { ...DEFAULT_SETTINGS.window! };
  if (!isRecord(value)) return fallback;
  const { width, height, x, y } = value;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return fallback;
  const frame: WindowFrame = { width, height };
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    frame.x = x;
    frame.y = y;
  }
  return frame;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Merge a settings blob over the defaults. Always returns a fresh object. */
export function mergeSettings(raw: unknown): OxideSettings {
  const src = isRecord(raw) ? raw : {};
  const shortcuts = isRecord(src.shortcuts) ? src.shortcuts : {};
  const d = DEFAULT_SETTINGS;
  return {
    shortcuts: {
      togglePanel: accelerator(shortcuts.togglePanel, d.shortcuts.togglePanel),
      captureClipboard: accelerator(shortcuts.captureClipboard, d.shortcuts.captureClipboard),
      doubleShiftCapture: bool(shortcuts.doubleShiftCapture, d.shortcuts.doubleShiftCapture),
      doubleShiftWindowMs: tapWindow(shortcuts.doubleShiftWindowMs, d.shortcuts.doubleShiftWindowMs),
      doubleTapKey: oneOf(shortcuts.doubleTapKey, DOUBLE_TAP_KEYS, d.shortcuts.doubleTapKey),
      snapWindow: accelerator(shortcuts.snapWindow, d.shortcuts.snapWindow),
    },
    snapPosition: oneOf(src.snapPosition, SNAP_POSITIONS, d.snapPosition),
    snapDisplay: snapDisplay(src.snapDisplay),
    sounds: bool(src.sounds, d.sounds),
    dedupeCaptures: bool(src.dedupeCaptures, d.dedupeCaptures),
    alwaysOnTop: bool(src.alwaysOnTop, d.alwaysOnTop),
    theme: oneOf(src.theme, THEMES, d.theme),
    autoCompleteOnCopy: bool(src.autoCompleteOnCopy, d.autoCompleteOnCopy),
    expandOnCapture: bool(src.expandOnCapture, d.expandOnCapture),
    hideCompleted: bool(src.hideCompleted, d.hideCompleted),
    launchAtLogin: bool(src.launchAtLogin, d.launchAtLogin),
    window: windowFrame(src.window),
  };
}
