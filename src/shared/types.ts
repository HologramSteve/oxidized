// Shared between the Electron main process and the renderer.
// Pure data + types only (no imports), so this file is safe in both contexts.
// Validation lives next door: ./settings.ts (settings) and ./state.ts (notes);
// the desktop IPC contract lives in ./ipc.ts.

export interface Note {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  // set while the note sits in the Trash section
  deletedAt?: number;
  // flagged as important (amber accent in the list)
  important?: boolean;
}

export interface Section {
  id: string;
  title: string;
  collapsed: boolean;
  notes: Note[];
  // category accent color (hex), shown in the section header
  color?: string;
}

export interface AppState {
  sections: Section[];
  activeSectionId: string;
}

export type ThemePreference = "system" | "light" | "dark";

export type DoubleTapKey = "shift" | "ctrl" | "alt";

// preset home spot for the snap-to-position shortcut
export type SnapPosition =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Which display the snap shortcut targets. A number is Electron's Display.id. */
export type SnapDisplay = "primary" | "current" | number;

/** Panel frame in logical px. x/y are absent until the window has been placed. */
export interface WindowFrame {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface OxideSettings {
  shortcuts: {
    togglePanel: string;
    captureClipboard: string;
    doubleShiftCapture: boolean;
    // max ms between the two Shift taps
    doubleShiftWindowMs: number;
    // which key is double-tapped to capture
    doubleTapKey: DoubleTapKey;
    // global shortcut that moves the window to its snap position
    snapWindow: string;
  };
  // where the snap shortcut sends the window
  snapPosition: SnapPosition;
  // which display the snap shortcut uses
  snapDisplay: SnapDisplay;
  sounds: boolean;
  // skip a capture when identical text was already captured in the last 30s
  dedupeCaptures: boolean;
  alwaysOnTop: boolean;
  theme: ThemePreference;
  // mark notes as done after copying them as a list
  autoCompleteOnCopy: boolean;
  // pop the window back out of the pill when a capture lands
  expandOnCapture: boolean;
  // last panel position (logical px), restored on launch. Owned by the main
  // process — the renderer never writes it. Width/height in this blob are
  // ignored at startup: the window always opens at DEFAULT_WINDOW.
  window?: WindowFrame;
  // hide completed notes in the main list
  hideCompleted: boolean;
  // start Oxide when the user signs in (desktop, packaged builds)
  launchAtLogin: boolean;
}

/** Design-baseline panel size (logical px). Applied on every launch. */
export const DEFAULT_WINDOW = { width: 380, height: 680 };
/** Floor used by the resize grip and by fitting DEFAULT_WINDOW to a small display. */
export const MIN_WINDOW = { width: 280, height: 360 };

/** Allowed range for shortcuts.doubleShiftWindowMs. */
export const TAP_WINDOW_MS = { min: 150, max: 10_000 };

export const DEFAULT_SETTINGS: OxideSettings = {
  shortcuts: {
    togglePanel: "CommandOrControl+Shift+Space",
    captureClipboard: "CommandOrControl+Shift+C",
    doubleShiftCapture: true,
    doubleShiftWindowMs: 400,
    doubleTapKey: "shift",
    snapWindow: "CommandOrControl+Shift+M",
  },
  snapPosition: "left",
  snapDisplay: "primary",
  sounds: true,
  dedupeCaptures: true,
  alwaysOnTop: true,
  theme: "system",
  autoCompleteOnCopy: true,
  expandOnCapture: false,
  hideCompleted: false,
  launchAtLogin: false,
  window: { ...DEFAULT_WINDOW },
};
