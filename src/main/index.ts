// Oxide — floating, keyboard-first scratchpad.
// Electron main process: window, global shortcuts, clipboard capture, JSON
// storage, Windows-native helpers (double-tap keyboard hook). The UI lives
// in src/mainview; the renderer bridge is src/main/preload.ts; the IPC
// contract is src/shared/ipc.ts.

import {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  shell,
  screen,
  ipcMain,
  Menu,
  Tray,
  dialog,
  nativeTheme,
  type MenuItemConstructorOptions,
  type Rectangle,
} from "electron";
import {
  DEFAULT_WINDOW,
  MIN_WINDOW,
  mergeSettings,
  type OxideSettings,
  type SnapPosition,
} from "../shared/types";
import { CH, type CapturePayload, type DisplayInfo, type SaveSettingsResult } from "../shared/ipc";
import { startShiftShiftHelper, type ShiftShiftHandle } from "./shiftshift";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Local storage — everything under %LOCALAPPDATA%/oxidized:
//   settings.json     app settings (shortcuts, sounds, …)
//   blobs/notes.json  note data
// No cloud, no accounts. (Copper-style.)
// ---------------------------------------------------------------------------
const baseDir = join(
  process.env.LOCALAPPDATA || join(homedir(), ".local", "share"),
  "oxidized"
);
const blobsDir = join(baseDir, "blobs");
const settingsFile = join(baseDir, "settings.json");
const dataFile = join(blobsDir, "notes.json");
// pre-0.2 location, migrated on first load
const legacyDataFile = join(process.env.APPDATA || homedir(), "OxideNotes", "notes.json");

function ensureDirs() {
  if (!existsSync(blobsDir)) mkdirSync(blobsDir, { recursive: true });
  const leftoverShots = join(blobsDir, "shots");
  if (existsSync(leftoverShots)) {
    try {
      rmSync(leftoverShots, { recursive: true, force: true });
    } catch (err) {
      console.error("[oxide] failed to remove leftover shots:", err);
    }
  }
}

async function loadStateFile(): Promise<string | null> {
  try {
    // one-time migration from the old location
    if (!existsSync(dataFile) && existsSync(legacyDataFile)) {
      ensureDirs();
      copyFileSync(legacyDataFile, dataFile);
      console.log("[oxide] migrated notes from", legacyDataFile);
    }
    return await readFile(dataFile, "utf8");
  } catch (err) {
    console.error("[oxide] failed to read state:", err);
    return null;
  }
}

async function saveStateFile(json: string): Promise<boolean> {
  try {
    ensureDirs();
    await writeFile(dataFile, json, "utf8");
    return true;
  } catch (err) {
    console.error("[oxide] failed to write state:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function loadSettingsSync(): OxideSettings {
  try {
    if (existsSync(settingsFile)) {
      return mergeSettings(JSON.parse(readFileSync(settingsFile, "utf8")));
    }
  } catch (err) {
    console.error("[oxide] failed to read settings, using defaults:", err);
  }
  return mergeSettings(null);
}

function applyNativeTheme() {
  nativeTheme.themeSource = settings.theme;
}

function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin === true });
  } catch (err) {
    console.error("[oxide] setLoginItemSettings failed:", err);
  }
}

function saveSettingsFile(settings: OxideSettings): boolean {
  try {
    ensureDirs();
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[oxide] failed to write settings:", err);
    return false;
  }
}

let settings = loadSettingsSync();

// native frame captured right before shrinking to the pill
let prePillFrame: { x: number; y: number; width: number; height: number } | null = null;
// native frame captured before growing the window for an overflowing menu
let preMenuFrame: { x: number; y: number; width: number; height: number } | null = null;

// ---------------------------------------------------------------------------
// Window position helpers. Electron's BrowserWindow works in DIP (logical
// px), so no per-monitor scaling math is needed here.
// ---------------------------------------------------------------------------
let win: BrowserWindow | null = null;

function getWinPos(): { x: number; y: number } {
  const p = win?.getPosition();
  return p ? { x: p[0], y: p[1] } : { x: 0, y: 0 };
}

// Frozen during drag/glide/snap so a hold can't feed a grown HWND
// back into the next setBounds (Electron 41.3+ / Windows, electron#51679).
let lockedSize: { width: number; height: number } | null = null;

function lockWinSize() {
  const b = win?.getBounds();
  lockedSize = b ? { width: b.width, height: b.height } : null;
}

function unlockWinSize() {
  lockedSize = null;
}

let boundsTimer: ReturnType<typeof setTimeout> | null = null;

function persistWindowBounds() {
  if (!win || win.isDestroyed()) return;
  if (prePillFrame || preMenuFrame) return;
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    boundsTimer = null;
    persistWindowBoundsNow();
  }, 250);
}

function persistWindowBoundsNow() {
  if (boundsTimer) {
    clearTimeout(boundsTimer);
    boundsTimer = null;
  }
  if (!win || win.isDestroyed()) return;
  if (prePillFrame || preMenuFrame) return;
  const b = win.getBounds();
  settings.window = { width: b.width, height: b.height, x: b.x, y: b.y };
  saveSettingsFile(settings);
}

/** Design size, shrunk to the primary work area so it still fits a small display. */
function defaultLaunchSize(): { width: number; height: number } {
  const wa = screen.getPrimaryDisplay().workArea;
  const margin = 24;
  return {
    width: Math.min(DEFAULT_WINDOW.width, Math.max(MIN_WINDOW.width, wa.width - margin)),
    height: Math.min(DEFAULT_WINDOW.height, Math.max(MIN_WINDOW.height, wa.height - margin)),
  };
}

/** Default size on every launch; restore last x/y if that point is still on a display. */
function initialBounds(): { width: number; height: number; x: number; y: number } {
  const { width, height } = defaultLaunchSize();
  let x = settings.window?.x;
  let y = settings.window?.y;
  if (typeof x !== "number" || typeof y !== "number") {
    return { width, height, x: 80, y: 80 };
  }
  const onScreen = screen.getAllDisplays().some((d) => {
    const r = d.workArea;
    return x! + 40 < r.x + r.width && x! + width > r.x && y! + 40 < r.y + r.height && y! + height > r.y;
  });
  if (!onScreen) {
    const r = screen.getPrimaryDisplay().workArea;
    x = r.x + 80;
    y = r.y + 80;
  }
  return { width, height, x, y };
}

function setWinPos(x: number, y: number) {
  if (!win || win.isDestroyed()) return;
  const nx = Math.round(x);
  const ny = Math.round(y);
  const b = win.getBounds();
  if (b.x === nx && b.y === ny) return;
  const width = lockedSize?.width ?? b.width;
  const height = lockedSize?.height ?? b.height;
  // setBounds(..., false) keeps size in the same call; setPosition on a
  // frameless Windows window can grow the HWND a few DIP per invocation
  win.setBounds({ x: nx, y: ny, width, height }, false);
}

// ---------------------------------------------------------------------------
// Window drag. The renderer tells us when the user grabs a surface and when
// they release; we move the window here by tracking the cursor, keeping the
// grabbed point fixed under it like a native drag. On release we sample the
// recent velocity and let the window glide to a soft stop instead of a hard
// stop. (CSS -webkit-app-region dragging can't do just-in-time grab-anywhere
// and suppresses clicks, so the main process drives the move instead.)
// ---------------------------------------------------------------------------
let winStart: { x: number; y: number } | null = null;
let cursorStart: { x: number; y: number } | null = null;
let dragSamples: { x: number; y: number; t: number }[] = [];
let dragPoll: ReturnType<typeof setInterval> | null = null;
let glideTimer: ReturnType<typeof setInterval> | null = null;

function stopGlide() {
  if (glideTimer) {
    clearInterval(glideTimer);
    glideTimer = null;
  }
  unlockWinSize();
  persistWindowBounds();
}

function beginWindowDrag() {
  stopWindowResize();
  stopGlide();
  lockWinSize();
  if (dragPoll) clearInterval(dragPoll);
  dragSamples = [];
  try {
    const p = win?.getPosition();
    winStart = p ? { x: p[0], y: p[1] } : null;
    const c = screen.getCursorScreenPoint();
    cursorStart = { x: c.x, y: c.y };
  } catch {
    winStart = null;
    cursorStart = null;
  }
  dragPoll = setInterval(() => {
    try {
      const cur = screen.getCursorScreenPoint();
      if (winStart && cursorStart) {
        setWinPos(
          winStart.x + (cur.x - cursorStart.x),
          winStart.y + (cur.y - cursorStart.y)
        );
      }
      const pos = win?.getPosition();
      if (pos) {
        dragSamples.push({ x: pos[0], y: pos[1], t: Date.now() });
        if (dragSamples.length > 12) dragSamples.shift();
      }
    } catch {}
  }, 8);
}

function endWindowDrag() {
  if (!dragPoll) return;
  clearInterval(dragPoll);
  dragPoll = null;
  // velocity from the last ~120ms of samples
  const now = Date.now();
  const recent = dragSamples.filter((s) => now - s.t < 120);
  dragSamples = [];
  if (recent.length < 2) {
    unlockWinSize();
    persistWindowBounds();
    return;
  }
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = b.t - a.t;
  if (dt < 20) {
    unlockWinSize();
    persistWindowBounds();
    return;
  }
  let vx = (b.x - a.x) / dt;
  let vy = (b.y - a.y) / dt;
  let speed = Math.hypot(vx, vy);
  if (speed < 0.08) {
    unlockWinSize();
    persistWindowBounds();
    return; // a gentle release shouldn't drift
  }
  // the glide is a settle, not a throw: take only a fraction of the release
  // velocity and cap it, so the window drifts a few dozen px at most
  vx *= 0.5;
  vy *= 0.5;
  speed *= 0.5;
  const MAX = 0.6;
  if (speed > MAX) {
    vx *= MAX / speed;
    vy *= MAX / speed;
  }
  let { x, y } = getWinPos();
  let last = Date.now();
  glideTimer = setInterval(() => {
    const t = Date.now();
    const step = t - last;
    last = t;
    x += vx * step;
    y += vy * step;
    // firm friction: a short, smooth settle (~60px worst case)
    const decay = Math.pow(0.85, step / 16);
    vx *= decay;
    vy *= decay;
    try {
      setWinPos(x, y);
    } catch {}
    if (Math.hypot(vx, vy) < 0.02) stopGlide();
  }, 8);
}

// ---------------------------------------------------------------------------
// Window resize. Frameless + transparent + resizable:false means there are
// no native resize edges (and alpha=0 corner pixels click through), so the
// view's grip just signals start/end; we track the cursor here in DIP and
// apply setBounds. Same idea as window drag.
// ---------------------------------------------------------------------------
const MIN_WIN_W = MIN_WINDOW.width;
const MIN_WIN_H = MIN_WINDOW.height;
let resizeOrigin: { x: number; y: number; w: number; h: number; wx: number; wy: number } | null =
  null;
let resizePoll: ReturnType<typeof setInterval> | null = null;

function stopWindowResize() {
  if (!resizePoll) return;
  clearInterval(resizePoll);
  resizePoll = null;
  resizeOrigin = null;
  persistWindowBounds();
}

function beginWindowResize() {
  stopGlide();
  if (dragPoll) {
    clearInterval(dragPoll);
    dragPoll = null;
    unlockWinSize();
  }
  if (resizePoll) clearInterval(resizePoll);
  try {
    const b = win?.getBounds();
    if (!b) return;
    const c = screen.getCursorScreenPoint();
    resizeOrigin = { x: c.x, y: c.y, w: b.width, h: b.height, wx: b.x, wy: b.y };
  } catch {
    resizeOrigin = null;
    return;
  }
  resizePoll = setInterval(() => {
    if (!win || win.isDestroyed() || !resizeOrigin) return;
    try {
      const cur = screen.getCursorScreenPoint();
      const w = Math.max(MIN_WIN_W, Math.round(resizeOrigin.w + (cur.x - resizeOrigin.x)));
      const h = Math.max(MIN_WIN_H, Math.round(resizeOrigin.h + (cur.y - resizeOrigin.y)));
      win.setBounds({ x: resizeOrigin.wx, y: resizeOrigin.wy, width: w, height: h }, false);
    } catch {}
  }, 8);
}

// ---------------------------------------------------------------------------
// Snap-to-position: a global shortcut sends the window to a preset home spot
// (settings.snapPosition) on the chosen display (settings.snapDisplay) with a
// short eased slide. Work area is that display minus the taskbar.
// ---------------------------------------------------------------------------
function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen
    .getAllDisplays()
    .slice()
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      label: (d.label || "").trim() || `Display ${i + 1}`,
      primary: d.id === primaryId,
      internal: d.internal === true,
    }));
}

function workAreaOf(d: { workArea: { x: number; y: number; width: number; height: number } }): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const wa = d.workArea;
  return { left: wa.x, top: wa.y, right: wa.x + wa.width, bottom: wa.y + wa.height };
}

function getSnapDisplay() {
  const primary = screen.getPrimaryDisplay();
  const sel = settings.snapDisplay;
  if (sel === "current") {
    if (win && !win.isDestroyed()) return screen.getDisplayMatching(win.getBounds());
    return primary;
  }
  if (typeof sel === "number") {
    return screen.getAllDisplays().find((d) => d.id === sel) ?? primary;
  }
  return primary;
}

function getWorkArea(): { left: number; top: number; right: number; bottom: number } {
  return workAreaOf(getSnapDisplay());
}

/** Slide the window to (tx, ty) over ~320ms with an ease-out curve. */
function animateWindowTo(tx: number, ty: number) {
  stopWindowResize();
  stopGlide();
  lockWinSize();
  const { x: sx, y: sy } = getWinPos();
  if (Math.abs(tx - sx) < 2 && Math.abs(ty - sy) < 2) {
    unlockWinSize();
    return;
  }
  const dur = 320;
  const start = Date.now();
  glideTimer = setInterval(() => {
    const p = Math.min(1, (Date.now() - start) / dur);
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    try {
      setWinPos(sx + (tx - sx) * e, sy + (ty - sy) * e);
    } catch {}
    if (p >= 1) stopGlide();
  }, 8);
}

function snapWindowTo(position: SnapPosition) {
  const wa = getWorkArea();
  const frame = win?.getBounds();
  if (!frame) return;
  const m = 12; // breathing room from the screen edge
  const midY = Math.round(wa.top + (wa.bottom - wa.top - frame.height) / 2);
  let x: number;
  let y: number;
  switch (position) {
    case "left":
      x = wa.left + m;
      y = midY;
      break;
    case "right":
      x = wa.right - frame.width - m;
      y = midY;
      break;
    case "top-left":
      x = wa.left + m;
      y = wa.top + m;
      break;
    case "top-right":
      x = wa.right - frame.width - m;
      y = wa.top + m;
      break;
    case "bottom-left":
      x = wa.left + m;
      y = wa.bottom - frame.height - m;
      break;
    case "bottom-right":
      x = wa.right - frame.width - m;
      y = wa.bottom - frame.height - m;
      break;
  }
  if (!panelVisible) showWindow(); // snapping a hidden panel should reveal it
  animateWindowTo(x, y);
}

// ---------------------------------------------------------------------------
// IPC between renderer and main (contract: src/shared/ipc.ts)
// ---------------------------------------------------------------------------
function sendCapture(payload: CapturePayload) {
  const wc = win?.webContents;
  if (wc && !wc.isDestroyed()) wc.send(CH.capture, payload);
  else console.warn("[oxide] capture dropped — window not available");
}

function registerIpc() {
  ipcMain.handle(CH.loadState, () => loadStateFile());
  ipcMain.handle(CH.saveState, (_e, p: { json: string }) => saveStateFile(p.json));
  ipcMain.handle(CH.copyText, async (_e, p: { text: string }) => {
    try {
      await clipboard.writeText(p.text);
      return true;
    } catch (err) {
      console.error("[oxide] clipboard write failed:", err);
      return false;
    }
  });
  ipcMain.handle(CH.loadSettings, () => {
    try {
      return JSON.stringify(settings);
    } catch {
      return null;
    }
  });
  ipcMain.handle(CH.saveSettings, (_e, p: { json: string }) => {
    try {
      settings = mergeSettings(JSON.parse(p.json));
      // renderer saves don't always include x/y — keep the live frame
      if (win && !win.isDestroyed() && !prePillFrame && !preMenuFrame) {
        const b = win.getBounds();
        settings.window = { width: b.width, height: b.height, x: b.x, y: b.y };
      }
      saveSettingsFile(settings);
      applyNativeTheme();
      applyLoginItem();
      win?.setAlwaysOnTop(settings.alwaysOnTop !== false);
      return applyShortcuts();
    } catch (err) {
      console.error("[oxide] saveSettings failed:", err);
      return { togglePanelOk: false, captureClipboardOk: false, snapWindowOk: false };
    }
  });
  ipcMain.handle(CH.exportNotes, async (_e, p: { json: string }) => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const opts = {
        title: "Export notes",
        defaultPath: `oxide-notes-${stamp}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      };
      const res =
        win && !win.isDestroyed()
          ? await dialog.showSaveDialog(win, opts)
          : await dialog.showSaveDialog(opts);
      const filePath = res.filePath;
      if (res.canceled || !filePath) return false;
      await writeFile(filePath, p.json, "utf8");
      return true;
    } catch (err) {
      console.error("[oxide] exportNotes failed:", err);
      return false;
    }
  });
  ipcMain.handle(CH.listDisplays, () => listDisplays());
  ipcMain.handle(CH.importNotes, async () => {
    try {
      const opts = {
        title: "Import notes",
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile" as const],
      };
      const res =
        win && !win.isDestroyed()
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts);
      const filePath = res.filePaths[0];
      if (res.canceled || !filePath) return null;
      return await readFile(filePath, "utf8");
    } catch (err) {
      console.error("[oxide] importNotes failed:", err);
      return null;
    }
  });

  ipcMain.on(CH.hideWindow, () => hideWindow());
  ipcMain.on(CH.quitApp, () => quitApp());
  ipcMain.on(CH.setAlwaysOnTop, (_e, p: { value: boolean }) => {
    win?.setAlwaysOnTop(p.value);
  });
  ipcMain.on(CH.openExternal, (_e, p: { url: string }) => {
    try {
      shell.openExternal(p.url);
    } catch (err) {
      console.error("[oxide] openExternal failed:", err);
    }
  });
  ipcMain.on(CH.openDataDir, () => {
    try {
      ensureDirs();
      void shell.openPath(baseDir);
    } catch (err) {
      console.error("[oxide] openDataDir failed:", err);
    }
  });
  ipcMain.on(CH.windowDragStart, () => beginWindowDrag());
  ipcMain.on(CH.windowDragEnd, () => endWindowDrag());
  ipcMain.on(CH.windowResizeStart, () => beginWindowResize());
  ipcMain.on(CH.windowResizeEnd, () => stopWindowResize());
  ipcMain.on(CH.debugLog, (_e, p: { text: string }) => {
    console.log("[oxide:view]", p.text);
  });
  ipcMain.on(CH.setWindowSize, (_e, p: { width: number; height: number }) => {
    try {
      win?.setSize(Math.round(p.width), Math.round(p.height));
      persistWindowBounds();
    } catch (err) {
      console.error("[oxide] setWindowSize failed:", err);
    }
  });
  ipcMain.on(CH.pillShrink, (_e, p: { width: number; height: number }) => {
    try {
      // getBounds() returns a fresh object — never mutated by setSize, but
      // keep the snapshot style for parity with the old getFrame() behavior
      prePillFrame = win?.getBounds() ?? null;
      win?.setSize(Math.round(p.width), Math.round(p.height));
    } catch (err) {
      console.error("[oxide] pillShrink failed:", err);
    }
  });
  ipcMain.on(CH.pillRestore, () => {
    try {
      if (prePillFrame && win) {
        win.setSize(prePillFrame.width, prePillFrame.height);
        prePillFrame = null;
        persistWindowBounds();
      }
    } catch (err) {
      console.error("[oxide] pillRestore failed:", err);
    }
  });
  // menus must not change the native frame — size only changes via the
  // resize grip (and the explicit pill minimize). Keep the channels so an
  // older renderer can't crash; they are no-ops.
  ipcMain.on(CH.menuGrow, () => {});
  ipcMain.on(CH.menuRestore, () => {});
}

// ---------------------------------------------------------------------------
// The floating panel window: frameless, transparent, always on top.
// ---------------------------------------------------------------------------
function createWindow() {
  const iconPath = join(
    app.getAppPath(),
    "assets",
    process.platform === "win32" ? "icon.ico" : "icon.png"
  );
  const start = initialBounds();
  win = new BrowserWindow({
    width: start.width,
    height: start.height,
    x: start.x,
    y: start.y,
    frame: false,
    transparent: true,
    // resizable:false + the view's custom resize grip avoids the known
    // transparent-window resize artifacts on Windows; setSize still works.
    // thickFrame:false (Windows) skips the 16×8 DIP resize inset Electron
    // 41.3+ adds to frameless windows — setPosition during a hold/drag
    // otherwise grows the HWND each tick (electron#51679).
    resizable: false,
    thickFrame: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: settings.alwaysOnTop !== false,
    show: false,
    ...(!app.isPackaged && existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(app.getAppPath(), "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });

  if (process.env.OXIDE_DEV === "1") {
    // view hot-reloads through serve.ts; main changes need a restart
    void win.loadURL("http://localhost:4820");
  } else {
    void win.loadFile(join(app.getAppPath(), "dist-renderer", "index.html"));
  }
}

// ---------------------------------------------------------------------------
// Window visibility
// ---------------------------------------------------------------------------
let panelVisible = true;

function hideWindow() {
  win?.hide();
  panelVisible = false;
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (!win) return;
  win.show();
  win.focus();
  // some platforms drop the topmost flag across hide/show — re-assert it
  win.setAlwaysOnTop(settings.alwaysOnTop !== false);
  panelVisible = true;
}

function toggleWindow() {
  if (panelVisible) hideWindow();
  else showWindow();
}

// ---------------------------------------------------------------------------
// Capture: send the current clipboard text into the panel as a new note.
// (Electron 44's clipboard API is promise-based — always await it.)
// ---------------------------------------------------------------------------
let lastCapture = { text: "", at: 0 };

async function captureClipboard() {
  try {
    const text = await clipboard.readText();
    if (!text || text.trim().length === 0) return;
    // skip duplicates: 30s window when dedupe is on (spamming Shift Shift on
    // the same selection shouldn't create twins), tiny debounce otherwise
    const dedupeMs = settings.dedupeCaptures !== false ? 30_000 : 1200;
    const now = Date.now();
    if (text === lastCapture.text && now - lastCapture.at < dedupeMs) return;
    lastCapture = { text, at: now };
    sendCapture({ text });
  } catch (err) {
    console.error("[oxide] capture failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Global shortcuts — driven by settings, re-registrable at runtime.
// Double-tap capture (Copper-style) runs via a low-level keyboard hook
// helper (shiftshift.ts) that simulates Ctrl+C and reports CAPTURE only when
// the clipboard actually changed — i.e. there was a real selection.
// ---------------------------------------------------------------------------
let registered: string[] = [];
let shiftShift: ShiftShiftHandle | null = null;
let helperConfig = ""; // "tapMs:key" the running helper was started with

function applyShortcuts(): SaveSettingsResult {
  // drop previous registrations
  for (const acc of registered) {
    try {
      globalShortcut.unregister(acc);
    } catch {}
  }
  registered = [];

  const { togglePanel, captureClipboard: captureAcc, doubleShiftCapture } = settings.shortcuts;

  let togglePanelOk = false;
  if (togglePanel) {
    togglePanelOk = globalShortcut.register(togglePanel, toggleWindow);
    if (togglePanelOk) registered.push(togglePanel);
    else console.warn(`[oxide] could not register ${togglePanel} (in use?)`);
  }

  let captureClipboardOk = false;
  if (captureAcc) {
    captureClipboardOk = globalShortcut.register(captureAcc, captureClipboard);
    if (captureClipboardOk) registered.push(captureAcc);
    else console.warn(`[oxide] could not register ${captureAcc} (in use?)`);
  }

  let snapWindowOk = false;
  const snapAcc = settings.shortcuts.snapWindow;
  if (snapAcc) {
    snapWindowOk = globalShortcut.register(snapAcc, () =>
      snapWindowTo(settings.snapPosition || "left")
    );
    if (snapWindowOk) registered.push(snapAcc);
    else console.warn(`[oxide] could not register ${snapAcc} (in use?)`);
  }

  // double-tap keyboard hook helper on/off (restart when tap window/key changed)
  const tapMs = settings.shortcuts.doubleShiftWindowMs || 400;
  const tapKey = settings.shortcuts.doubleTapKey || "shift";
  const config = `${tapMs}:${tapKey}`;
  if (doubleShiftCapture) {
    if (shiftShift && helperConfig !== config) {
      shiftShift.stop();
      shiftShift = null;
    }
    if (!shiftShift) {
      shiftShift = startShiftShiftHelper(
        () => captureClipboard(),
        (line) => console.log("[oxide:shiftshift]", line),
        tapMs,
        tapKey
      );
      helperConfig = config;
    }
  } else if (shiftShift) {
    shiftShift.stop();
    shiftShift = null;
  }

  return { togglePanelOk, captureClipboardOk, snapWindowOk };
}

// ---------------------------------------------------------------------------
// Menu. Production removes the default menu entirely (it would add
// Ctrl+R/Ctrl+Shift+I reload/devtools accelerators); dev keeps reload +
// devtools; macOS keeps the standard app/edit/window menus.
// ---------------------------------------------------------------------------
function setupMenu() {
  if (process.env.OXIDE_DEV === "1") {
    const template: MenuItemConstructorOptions[] = [
      { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else if (process.platform === "darwin") {
    const template: MenuItemConstructorOptions[] = [
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
}

function quitApp() {
  persistWindowBoundsNow();
  try {
    shiftShift?.stop();
  } catch {}
  app.quit();
}

// ---------------------------------------------------------------------------
// Tray — keep the app reachable while the panel is hidden.
// ---------------------------------------------------------------------------
let tray: Tray | null = null;

function setupTray() {
  const ico = join(
    app.getAppPath(),
    "assets",
    process.platform === "win32" ? "icon.ico" : "icon.png"
  );
  const fallback = join(app.getAppPath(), "assets", "icon.png");
  const iconPath = existsSync(ico) ? ico : fallback;
  if (!existsSync(iconPath)) {
    console.warn("[oxide] tray icon missing:", iconPath);
    return;
  }
  try {
    tray = new Tray(iconPath);
    tray.setToolTip("Oxide");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Oxide", click: () => showWindow() },
        { label: "Hide", click: () => hideWindow() },
        { type: "separator" },
        { label: "Quit Oxide", click: () => quitApp() },
      ])
    );
    tray.on("click", () => toggleWindow());
  } catch (err) {
    console.error("[oxide] tray failed:", err);
    tray = null;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
void app.whenReady().then(() => {
  if (process.platform === "win32") {
    // correct taskbar identity/pinning for the packaged + dev exe
    app.setAppUserModelId("nl.stevenrs.oxide");
  }
  ensureDirs();
  applyNativeTheme();
  applyLoginItem();
  setupMenu();
  registerIpc();
  createWindow();
  setupTray();
  applyShortcuts();

  console.log("[oxide] running. base dir:", baseDir);
  console.log(
    `[oxide] ${
      settings.shortcuts.doubleShiftCapture
        ? `${settings.shortcuts.doubleTapKey || "shift"} x2 = capture selection, `
        : ""
    }${settings.shortcuts.captureClipboard} = capture clipboard, ${settings.shortcuts.togglePanel} = toggle panel`
  );
});

app.on("window-all-closed", () => {
  // the tray keeps the process alive while the panel is hidden/closed
  if (tray) return;
  app.quit();
});

app.on("will-quit", () => {
  persistWindowBoundsNow();
  try {
    shiftShift?.stop();
  } catch {}
  globalShortcut.unregisterAll();
});
