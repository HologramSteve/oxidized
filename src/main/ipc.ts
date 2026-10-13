// IPC between renderer and main (contract: src/shared/ipc.ts).
//
// The renderer is our own sandboxed page, but every payload is still checked
// here: a malformed message must never crash a handler or reach the shell.

import {
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { CH, type AppInfo, type DisplayInfo, type SaveSettingsResult } from "../shared/ipc";
import type { OxideSettings } from "../shared/types";
import { listDisplays, openExternalSafe, type Panel } from "./panel";
import {
  describeDataDir,
  ensureDataDirs,
  type DataPaths,
  type SettingsStore,
  type StateFile,
} from "./storage";

export interface IpcDeps {
  panel: Panel;
  paths: DataPaths;
  stateFile: StateFile;
  settings: SettingsStore;
  /** Apply freshly saved settings to the running app; reports shortcut registration. */
  applySettings(settings: OxideSettings, previous: OxideSettings): SaveSettingsResult;
  quit(): void;
}

// generous ceiling for a window dimension in DIP; anything beyond is a bug
const MAX_DIMENSION = 16_384;

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_DIMENSION;
}

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

export function registerIpc(deps: IpcDeps): void {
  const { panel, paths, stateFile, settings } = deps;

  /** Request handler. Messages from anything but the panel's page are refused. */
  const handle = <T>(
    channel: string,
    fallback: T,
    handler: (...args: unknown[]) => T | Promise<T>
  ): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!panel.owns(event.sender)) return fallback;
      try {
        return await handler(...args);
      } catch (err) {
        console.error(`[oxide] ${channel} failed:`, err);
        return fallback;
      }
    });
  };

  /** One-way message handler, with the same sender check and error guard. */
  const on = (channel: string, handler: (...args: unknown[]) => void): void => {
    ipcMain.on(channel, (event: IpcMainEvent, ...args: unknown[]) => {
      if (!panel.owns(event.sender)) return;
      try {
        handler(...args);
      } catch (err) {
        console.error(`[oxide] ${channel} failed:`, err);
      }
    });
  };

  handle<string | null>(CH.loadState, null, () => stateFile.load());
  handle(CH.saveState, false, (json) => {
    if (typeof json !== "string" || json.length === 0) return false;
    return stateFile.save(json);
  });
  handle(CH.copyText, false, async (text) => {
    if (typeof text !== "string") return false;
    await clipboard.writeText(text);
    return true;
  });
  handle<OxideSettings>(CH.loadSettings, settings.current, () => settings.current);
  handle<SaveSettingsResult>(
    CH.saveSettings,
    { togglePanelOk: false, captureClipboardOk: false, snapWindowOk: false },
    (raw) => {
      const previous = settings.current;
      return deps.applySettings(settings.replace(raw), previous);
    }
  );
  handle(CH.exportNotes, false, async (json) => {
    if (typeof json !== "string") return false;
    const stamp = new Date().toISOString().slice(0, 10);
    const opts = {
      title: "Export notes",
      defaultPath: `oxide-notes-${stamp}.json`,
      filters: JSON_FILTER,
    };
    const win = panel.window;
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return false;
    await writeFile(res.filePath, json, "utf8");
    return true;
  });
  handle<string | null>(CH.importNotes, null, async () => {
    const opts = {
      title: "Import notes",
      filters: JSON_FILTER,
      properties: ["openFile" as const],
    };
    const win = panel.window;
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const filePath = res.filePaths[0];
    if (res.canceled || !filePath) return null;
    return await readFile(filePath, "utf8");
  });
  handle<DisplayInfo[]>(CH.listDisplays, [], () => listDisplays());
  handle<AppInfo>(CH.appInfo, { dataDir: "" }, () => ({ dataDir: describeDataDir(paths) }));

  on(CH.hideWindow, () => panel.hide());
  on(CH.quitApp, () => deps.quit());
  on(CH.openExternal, (url) => {
    if (typeof url === "string") openExternalSafe(url);
  });
  on(CH.openDataDir, () => {
    ensureDataDirs(paths);
    shell.openPath(paths.baseDir).then((error) => {
      if (error) console.error("[oxide] openDataDir failed:", error);
    });
  });
  on(CH.pillShrink, (width, height) => {
    if (isDimension(width) && isDimension(height)) panel.pillShrink(width, height);
  });
  on(CH.pillRestore, () => panel.pillRestore());
  on(CH.windowDragStart, () => panel.beginDrag());
  on(CH.windowDragEnd, () => panel.endDrag());
  on(CH.windowResizeStart, () => panel.beginResize());
  on(CH.windowResizeEnd, () => panel.endResize());
  on(CH.debugLog, (text) => {
    console.log("[oxide:view]", String(text));
  });
}
