// Sandboxed preload bridge: exposes the typed desktop API on window.oxide
// via contextBridge. No Node integration in the renderer — only this API and
// the IPC channels from src/shared/ipc.ts cross the boundary.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CH, type CapturePayload, type DisplayInfo, type OxideDesktopApi } from "../shared/ipc";

const api: OxideDesktopApi = {
  loadState: () => ipcRenderer.invoke(CH.loadState) as Promise<string | null>,
  saveState: (json) => ipcRenderer.invoke(CH.saveState, { json }),
  copyText: (text) => ipcRenderer.invoke(CH.copyText, { text }),
  loadSettings: () => ipcRenderer.invoke(CH.loadSettings) as Promise<string | null>,
  saveSettings: (json) => ipcRenderer.invoke(CH.saveSettings, { json }),
  loadScreenshot: (name) => ipcRenderer.invoke(CH.loadScreenshot, { name }),
  exportNotes: (json) => ipcRenderer.invoke(CH.exportNotes, { json }),
  importNotes: () => ipcRenderer.invoke(CH.importNotes) as Promise<string | null>,
  listDisplays: () => ipcRenderer.invoke(CH.listDisplays) as Promise<DisplayInfo[]>,
  hideWindow: () => ipcRenderer.send(CH.hideWindow),
  quitApp: () => ipcRenderer.send(CH.quitApp),
  setAlwaysOnTop: (value) => ipcRenderer.send(CH.setAlwaysOnTop, { value }),
  openExternal: (url) => ipcRenderer.send(CH.openExternal, { url }),
  openDataDir: () => ipcRenderer.send(CH.openDataDir),
  setWindowSize: (width, height) => ipcRenderer.send(CH.setWindowSize, { width, height }),
  pillShrink: (width, height) => ipcRenderer.send(CH.pillShrink, { width, height }),
  pillRestore: () => ipcRenderer.send(CH.pillRestore),
  menuGrow: (width, height) => ipcRenderer.send(CH.menuGrow, { width, height }),
  menuRestore: () => ipcRenderer.send(CH.menuRestore),
  windowDragStart: () => ipcRenderer.send(CH.windowDragStart),
  windowDragEnd: () => ipcRenderer.send(CH.windowDragEnd),
  windowResizeStart: () => ipcRenderer.send(CH.windowResizeStart),
  windowResizeEnd: () => ipcRenderer.send(CH.windowResizeEnd),
  deleteScreenshot: (name) => ipcRenderer.send(CH.deleteScreenshot, { name }),
  debug: (text) => ipcRenderer.send(CH.debugLog, { text }),
  onCapture: (cb) => {
    ipcRenderer.on(CH.capture, (_e: IpcRendererEvent, payload: CapturePayload) => cb(payload));
  },
};

contextBridge.exposeInMainWorld("oxide", api);
