// Platform adapter: Electron preload API (window.oxide) on desktop,
// localStorage in the browser. Everything the view needs from "outside"
// goes through this one interface.

import type { CapturePayload, DisplayInfo, SaveSettingsResult } from "../shared/ipc";
import type { OxideDesktopApi } from "../shared/ipc";
import type { OxideSettings } from "../shared/types";

const LS_KEY = "oxide-state-v1";
const SETTINGS_LS_KEY = "oxide-settings-v1";

export interface Platform {
  readonly isDesktop: boolean;
  /** The saved notes as JSON, or null when there are none yet. */
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<boolean>;
  /** Keep a state blob we couldn't parse, so overwriting it loses nothing. */
  stashUnreadableState(raw: string): void;
  /** The stored settings, unvalidated — run them through mergeSettings(). */
  loadSettings(): Promise<unknown>;
  saveSettings(settings: OxideSettings): Promise<SaveSettingsResult>;
  copy(text: string): Promise<boolean>;
  exportNotes(json: string): Promise<boolean>;
  importNotes(): Promise<string | null>;
  listDisplays(): Promise<DisplayInfo[]>;
  /** Where the data lives, for display in Settings. */
  dataLocation(): Promise<string>;
  hide(): void;
  quit(): void;
  openExternal(url: string): void;
  openDataDir(): void;
  // logical CSS px — never multiply by devicePixelRatio
  pillShrink(width: number, height: number): void;
  pillRestore(): void;
  windowDragStart(): void;
  windowDragEnd(): void;
  windowResizeStart(): void;
  windowResizeEnd(): void;
  debug(text: string): void;
  onCapture(cb: (payload: CapturePayload) => void): void;
}

function desktopPlatform(oxide: OxideDesktopApi): Platform {
  return {
    isDesktop: true,
    loadState: () => oxide.loadState(),
    saveState: (json) => oxide.saveState(json),
    stashUnreadableState() {}, // the main process quarantines the file itself
    loadSettings: () => oxide.loadSettings(),
    saveSettings: (settings) => oxide.saveSettings(settings),
    copy: (text) => oxide.copyText(text),
    exportNotes: (json) => oxide.exportNotes(json),
    importNotes: () => oxide.importNotes(),
    listDisplays: () => oxide.listDisplays(),
    dataLocation: async () => (await oxide.appInfo()).dataDir,
    hide: () => oxide.hideWindow(),
    quit: () => oxide.quitApp(),
    openExternal: (url) => oxide.openExternal(url),
    openDataDir: () => oxide.openDataDir(),
    pillShrink: (width, height) => oxide.pillShrink(width, height),
    pillRestore: () => oxide.pillRestore(),
    windowDragStart: () => oxide.windowDragStart(),
    windowDragEnd: () => oxide.windowDragEnd(),
    windowResizeStart: () => oxide.windowResizeStart(),
    windowResizeEnd: () => oxide.windowResizeEnd(),
    debug: (text) => oxide.debug(text),
    onCapture: (cb) => oxide.onCapture(cb),
  };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage disabled (private mode, blocked cookies)
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error("[oxide] localStorage write failed", err);
    return false;
  }
}

function copyWithExecCommand(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

function browserPlatform(): Platform {
  return {
    isDesktop: false,
    async loadState() {
      return readStorage(LS_KEY);
    },
    async saveState(json) {
      return writeStorage(LS_KEY, json);
    },
    stashUnreadableState(raw) {
      writeStorage(`${LS_KEY}.unreadable`, raw);
    },
    async loadSettings() {
      const raw = readStorage(SETTINGS_LS_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async saveSettings(settings) {
      if (!writeStorage(SETTINGS_LS_KEY, JSON.stringify(settings))) {
        throw new Error("settings could not be stored");
      }
      return { togglePanelOk: true, captureClipboardOk: true, snapWindowOk: true };
    },
    async copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fallback for non-secure contexts
        return copyWithExecCommand(text);
      }
    },
    async exportNotes(json) {
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `oxide-notes-${stamp}.json`;
      a.click();
      // revoking right away can cancel the download in some browsers
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    importNotes() {
      return new Promise<string | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          file.text().then(resolve, () => resolve(null));
        });
        input.addEventListener("cancel", () => resolve(null));
        input.click();
      });
    },
    async listDisplays() {
      return [];
    },
    async dataLocation() {
      return "localStorage";
    },
    hide() {},
    quit() {},
    openExternal(url) {
      window.open(url, "_blank", "noopener");
    },
    openDataDir() {},
    pillShrink() {},
    pillRestore() {},
    windowDragStart() {},
    windowDragEnd() {},
    windowResizeStart() {},
    windowResizeEnd() {},
    debug(text) {
      console.log("[oxide]", text);
    },
    onCapture() {},
  };
}

export const platform: Platform = window.oxide ? desktopPlatform(window.oxide) : browserPlatform();
export const isDesktop = platform.isDesktop;
