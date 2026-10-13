// Sandboxed preload bridge: exposes the typed desktop API on window.oxide
// via contextBridge. No Node integration in the renderer — only this API and
// the IPC channels from src/shared/ipc.ts cross the boundary.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CH, type CapturePayload, type OxideDesktopApi } from "../shared/ipc";

const api: OxideDesktopApi = {
  loadState: () => ipcRenderer.invoke(CH.loadState),
  saveState: (json) => ipcRenderer.invoke(CH.saveState, json),
  copyText: (text) => ipcRenderer.invoke(CH.copyText, text),
  loadSettings: () => ipcRenderer.invoke(CH.loadSettings),
  saveSettings: (settings) => ipcRenderer.invoke(CH.saveSettings, settings),
  exportNotes: (json) => ipcRenderer.invoke(CH.exportNotes, json),
  importNotes: () => ipcRenderer.invoke(CH.importNotes),
  listDisplays: () => ipcRenderer.invoke(CH.listDisplays),
  appInfo: () => ipcRenderer.invoke(CH.appInfo),
  hideWindow: () => ipcRenderer.send(CH.hideWindow),
  quitApp: () => ipcRenderer.send(CH.quitApp),
  openExternal: (url) => ipcRenderer.send(CH.openExternal, url),
  openDataDir: () => ipcRenderer.send(CH.openDataDir),
  pillShrink: (width, height) => ipcRenderer.send(CH.pillShrink, width, height),
  pillRestore: () => ipcRenderer.send(CH.pillRestore),
  windowDragStart: () => ipcRenderer.send(CH.windowDragStart),
  windowDragEnd: () => ipcRenderer.send(CH.windowDragEnd),
  windowResizeStart: () => ipcRenderer.send(CH.windowResizeStart),
  windowResizeEnd: () => ipcRenderer.send(CH.windowResizeEnd),
  debug: (text) => ipcRenderer.send(CH.debugLog, text),
  onCapture: (cb) => {
    ipcRenderer.on(CH.capture, (_e: IpcRendererEvent, payload: CapturePayload) => cb(payload));
  },
};

contextBridge.exposeInMainWorld("oxide", api);
