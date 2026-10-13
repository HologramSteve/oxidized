// Desktop IPC contract between the Electron main process (src/main), the
// preload bridge (src/main/preload.ts) and the renderer (src/mainview).
//
// Channel names must match on all three sides, and all three ship together,
// so the contract can change freely — only the files on disk (settings.json,
// notes.json) have to stay compatible across versions.
//
// Pure data + types only: safe to bundle in both the Node main process and
// the browser renderer.

import type { OxideSettings } from "./types";

export const CH = {
  // requests (renderer -> main, awaited): ipcMain.handle / ipcRenderer.invoke
  loadState: "oxide:loadState",
  saveState: "oxide:saveState",
  copyText: "oxide:copyText",
  loadSettings: "oxide:loadSettings",
  saveSettings: "oxide:saveSettings",
  exportNotes: "oxide:exportNotes",
  importNotes: "oxide:importNotes",
  listDisplays: "oxide:listDisplays",
  appInfo: "oxide:appInfo",
  // one-way renderer -> main: ipcMain.on / ipcRenderer.send
  hideWindow: "oxide:hideWindow",
  quitApp: "oxide:quitApp",
  openExternal: "oxide:openExternal",
  openDataDir: "oxide:openDataDir",
  pillShrink: "oxide:pillShrink",
  pillRestore: "oxide:pillRestore",
  windowDragStart: "oxide:windowDragStart",
  windowDragEnd: "oxide:windowDragEnd",
  windowResizeStart: "oxide:windowResizeStart",
  windowResizeEnd: "oxide:windowResizeEnd",
  debugLog: "oxide:debugLog",
  // one-way main -> renderer: webContents.send
  capture: "oxide:capture",
} as const;

/** Which global shortcuts registered after a settings save. */
export interface SaveSettingsResult {
  togglePanelOk: boolean;
  captureClipboardOk: boolean;
  snapWindowOk: boolean;
}

/** Connected display, for the snap-shortcut monitor picker. */
export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  internal: boolean;
}

/** Fired when the global capture shortcut grabs clipboard text. */
export interface CapturePayload {
  text: string;
}

export interface AppInfo {
  /** Where notes and settings live, shortened for display (e.g. %LOCALAPPDATA%\oxidized). */
  dataDir: string;
}

/** The API the preload exposes on window.oxide (desktop only). */
export interface OxideDesktopApi {
  // requests
  /** The saved notes as JSON, or null on a fresh install. */
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
  loadSettings(): Promise<OxideSettings>;
  saveSettings(settings: OxideSettings): Promise<SaveSettingsResult>;
  exportNotes(json: string): Promise<boolean>;
  importNotes(): Promise<string | null>;
  listDisplays(): Promise<DisplayInfo[]>;
  appInfo(): Promise<AppInfo>;
  // one-way messages
  hideWindow(): void;
  quitApp(): void;
  openExternal(url: string): void;
  openDataDir(): void;
  // logical CSS px (the main process is DIP-aware; never physical px)
  pillShrink(width: number, height: number): void;
  pillRestore(): void;
  windowDragStart(): void;
  windowDragEnd(): void;
  windowResizeStart(): void;
  windowResizeEnd(): void;
  debug(text: string): void;
  onCapture(cb: (payload: CapturePayload) => void): void;
}
