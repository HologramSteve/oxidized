// Desktop IPC contract between the Electron main process (src/main), the
// preload bridge (src/main/preload.ts) and the renderer (src/mainview).
//
// Channel names must match on all three sides. Payloads mirror the old
// Electrobun OxideRPC schema 1:1, so settings/state files stay compatible;
// the renderer's PlatformBridge maps straight onto OxideDesktopApi.
//
// Pure data + types only: no imports, safe to bundle in both the Node main
// process and the browser renderer.

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
  // one-way renderer -> main: ipcMain.on / ipcRenderer.send
  hideWindow: "oxide:hideWindow",
  quitApp: "oxide:quitApp",
  setAlwaysOnTop: "oxide:setAlwaysOnTop",
  openExternal: "oxide:openExternal",
  openDataDir: "oxide:openDataDir",
  setWindowSize: "oxide:setWindowSize",
  pillShrink: "oxide:pillShrink",
  pillRestore: "oxide:pillRestore",
  menuGrow: "oxide:menuGrow",
  menuRestore: "oxide:menuRestore",
  windowDragStart: "oxide:windowDragStart",
  windowDragEnd: "oxide:windowDragEnd",
  windowResizeStart: "oxide:windowResizeStart",
  windowResizeEnd: "oxide:windowResizeEnd",
  debugLog: "oxide:debugLog",
  // one-way main -> renderer: webContents.send
  capture: "oxide:capture",
} as const;

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

/** The API the preload exposes on window.oxide (desktop only). */
export interface OxideDesktopApi {
  // requests
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<SaveSettingsResult>;
  exportNotes(json: string): Promise<boolean>;
  importNotes(): Promise<string | null>;
  listDisplays(): Promise<DisplayInfo[]>;
  // one-way messages
  hideWindow(): void;
  quitApp(): void;
  setAlwaysOnTop(value: boolean): void;
  openExternal(url: string): void;
  openDataDir(): void;
  // logical CSS px (the main process is DIP-aware; never physical px)
  setWindowSize(width: number, height: number): void;
  pillShrink(width: number, height: number): void;
  pillRestore(): void;
  menuGrow(width: number, height: number): void;
  menuRestore(): void;
  windowDragStart(): void;
  windowDragEnd(): void;
  windowResizeStart(): void;
  windowResizeEnd(): void;
  debug(text: string): void;
  onCapture(cb: (payload: CapturePayload) => void): void;
}
