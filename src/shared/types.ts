// Shared between the Electron main process and the renderer.
// Pure data + types only (no imports), so this file is safe in both contexts.
// The desktop IPC contract lives in ./ipc.ts.

export interface Note {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  // set while the note sits in the Trash section
  deletedAt?: number;
  // flagged as important (amber accent in the list)
  important?: boolean;
  // filename of the source-window screenshot in blobs/shots (desktop capture)
  screenshot?: string;
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
  theme: "system" | "light" | "dark";
  // mark notes as done after copying them as a list
  autoCompleteOnCopy: boolean;
  // pop the window back out of the pill when a capture lands
  expandOnCapture: boolean;
  // screenshot the source window when a note is captured (Windows desktop)
  captureScreenshot: boolean;
  // last panel position (logical px), restored on launch. Width/height in this
  // blob are ignored at startup — the window always opens at DEFAULT_WINDOW.
  window?: { width: number; height: number; x?: number; y?: number };
  // hide completed notes in the main list
  hideCompleted: boolean;
  // start Oxide when the user signs in (desktop, packaged builds)
  launchAtLogin: boolean;
}

/** Design-baseline panel size (logical px). Applied on every launch. */
export const DEFAULT_WINDOW = { width: 380, height: 680 };
/** Floor used by the resize grip and by fitting DEFAULT_WINDOW to a small display. */
export const MIN_WINDOW = { width: 280, height: 360 };

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
  captureScreenshot: true,
  hideCompleted: false,
  launchAtLogin: false,
  window: { ...DEFAULT_WINDOW },
};

const THEMES: ReadonlySet<OxideSettings["theme"]> = new Set(["system", "light", "dark"]);
const SNAP_POSITIONS: ReadonlySet<SnapPosition> = new Set([
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
const DOUBLE_TAP_KEYS: ReadonlySet<DoubleTapKey> = new Set(["shift", "ctrl", "alt"]);

function parseSnapDisplay(raw: unknown): SnapDisplay {
  if (raw === "primary" || raw === "current") return raw;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  return DEFAULT_SETTINGS.snapDisplay;
}

/** Merge a settings JSON blob over defaults. Used by both main and the view. */
export function mergeSettings(raw: unknown): OxideSettings {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<OxideSettings>) : {};
  const shortcutsIn: Partial<OxideSettings["shortcuts"]> =
    parsed.shortcuts && typeof parsed.shortcuts === "object" ? parsed.shortcuts : {};
  const theme = THEMES.has(parsed.theme as OxideSettings["theme"])
    ? (parsed.theme as OxideSettings["theme"])
    : DEFAULT_SETTINGS.theme;
  const snapPosition = SNAP_POSITIONS.has(parsed.snapPosition as SnapPosition)
    ? (parsed.snapPosition as SnapPosition)
    : DEFAULT_SETTINGS.snapPosition;
  const snapDisplay = parseSnapDisplay(parsed.snapDisplay);
  const doubleTapKey = DOUBLE_TAP_KEYS.has(shortcutsIn.doubleTapKey as DoubleTapKey)
    ? (shortcutsIn.doubleTapKey as DoubleTapKey)
    : DEFAULT_SETTINGS.shortcuts.doubleTapKey;
  const win = parsed.window;
  let window = DEFAULT_SETTINGS.window;
  if (win && typeof win.width === "number" && typeof win.height === "number") {
    window = { width: win.width, height: win.height };
    if (typeof win.x === "number" && typeof win.y === "number") {
      window.x = win.x;
      window.y = win.y;
    }
  }

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    theme,
    snapPosition,
    snapDisplay,
    window,
    hideCompleted: parsed.hideCompleted === true,
    launchAtLogin: parsed.launchAtLogin === true,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...shortcutsIn,
      doubleTapKey,
    },
  };
}

// The desktop RPC contract (channels + payloads) lives in ./ipc.ts as
// OxideDesktopApi — kept separate so it can be imported by the Node main
// process, the sandboxed preload, and the browser renderer alike.
