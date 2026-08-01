// Shared between the bun main process and the webview.
// Type-only imports are erased at build time, so this file is safe in both contexts.
import type { RPCSchema } from "electrobun";

export interface Note {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface Section {
  id: string;
  title: string;
  collapsed: boolean;
  notes: Note[];
}

export interface AppState {
  sections: Section[];
  activeSectionId: string;
}

export type DoubleTapKey = "shift" | "ctrl" | "alt";

export interface OxideSettings {
  shortcuts: {
    togglePanel: string;
    captureClipboard: string;
    doubleShiftCapture: boolean;
    // max ms between the two Shift taps
    doubleShiftWindowMs: number;
    // which key is double-tapped to capture
    doubleTapKey: DoubleTapKey;
  };
  sounds: boolean;
  // skip a capture when identical text was already captured in the last 30s
  dedupeCaptures: boolean;
  alwaysOnTop: boolean;
  theme: "system" | "light" | "dark";
  // mark notes as done after copying them as a list
  autoCompleteOnCopy: boolean;
  // last user-chosen panel size (logical px), restored on launch
  window?: { width: number; height: number };
}

export const DEFAULT_SETTINGS: OxideSettings = {
  shortcuts: {
    togglePanel: "CommandOrControl+Shift+Space",
    captureClipboard: "CommandOrControl+Shift+C",
    doubleShiftCapture: true,
    doubleShiftWindowMs: 400,
    doubleTapKey: "shift",
  },
  sounds: true,
  dedupeCaptures: true,
  alwaysOnTop: true,
  theme: "system",
  autoCompleteOnCopy: true,
};

export type OxideRPC = {
  // functions that execute in the bun main process
  bun: RPCSchema<{
    requests: {
      loadState: {
        params: Record<string, never>;
        response: string | null;
      };
      saveState: {
        params: { json: string };
        response: boolean;
      };
      copyText: {
        params: { text: string };
        response: boolean;
      };
      loadSettings: {
        params: Record<string, never>;
        response: string | null;
      };
      // persists settings.json AND applies shortcuts live
      saveSettings: {
        params: { json: string };
        response: { togglePanelOk: boolean; captureClipboardOk: boolean };
      };
    };
    messages: {
      hideWindow: Record<string, never>;
      quitApp: Record<string, never>;
      setAlwaysOnTop: { value: boolean };
      // open a URL in the default browser
      openExternal: { url: string };
      // open the local data folder in the file manager
      openDataDir: Record<string, never>;
      // physical device pixels (the webview converts with its own
      // devicePixelRatio, which is per-monitor-correct)
      setWindowSize: { width: number; height: number };
      // shrink to pill: bun snapshots the native frame first, so
      // pillRestore can put it back verbatim — sizes can never stack
      pillShrink: { width: number; height: number };
      pillRestore: Record<string, never>;
      // temporarily grow the window so an open context menu can extend past
      // the panel; menuRestore puts the exact previous frame back
      menuGrow: { width: number; height: number };
      menuRestore: Record<string, never>;
      // webview console isn't forwarded in dev — route diagnostics here
      debugLog: { text: string };
    };
  }>;
  // functions that execute in the webview
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      // fired when the global capture shortcut grabs clipboard text
      capture: { text: string };
    };
  }>;
};
