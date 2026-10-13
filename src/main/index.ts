// Oxide — floating, keyboard-first scratchpad.
// Electron main process entry: wires the pieces together and owns the app
// lifecycle. The parts live next door:
//   storage.ts    notes + settings files      panel.ts      the window
//   motion.ts     drag / glide / resize       shortcuts.ts  global shortcuts
//   ipc.ts        renderer <-> main handlers  shiftshift.ts double-tap hook
// The UI lives in src/mainview; the renderer bridge is ./preload.ts; the IPC
// contract is src/shared/ipc.ts.

import {
  app,
  clipboard,
  globalShortcut,
  Menu,
  nativeTheme,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { CH, type CapturePayload, type SaveSettingsResult } from "../shared/ipc";
import type { OxideSettings } from "../shared/types";
import { registerIpc } from "./ipc";
import { assetPath, IS_DEV, Panel } from "./panel";
import { Shortcuts } from "./shortcuts";
import {
  ensureDataDirs,
  removeLeftoverShots,
  resolveDataPaths,
  SettingsStore,
  StateFile,
} from "./storage";

// a stray error must not take the tray app down (or pop Electron's dialog)
process.on("uncaughtException", (err) => console.error("[oxide] uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("[oxide] unhandled rejection:", err));

const paths = resolveDataPaths();
const settings = new SettingsStore(paths.settingsFile);
const stateFile = new StateFile(paths.stateFile, paths.legacyStateFile);

let quitting = false;
let tray: Tray | null = null;

const panel = new Panel({
  settings,
  hideOnClose: () => !quitting && tray !== null,
});

// ---------------------------------------------------------------------------
// Capture: send the current clipboard text into the panel as a new note.
// (Electron 44's clipboard API is promise-based — always await it.)
// ---------------------------------------------------------------------------
let lastCapture = { text: "", at: 0 };

async function captureClipboard(): Promise<void> {
  try {
    const text = await clipboard.readText();
    if (!text || text.trim().length === 0) return;
    // skip duplicates: 30s window when dedupe is on (spamming Shift Shift on
    // the same selection shouldn't create twins), tiny debounce otherwise
    const dedupeMs = settings.current.dedupeCaptures ? 30_000 : 1200;
    const now = Date.now();
    if (text === lastCapture.text && now - lastCapture.at < dedupeMs) return;
    const payload: CapturePayload = { text };
    if (!panel.send(CH.capture, payload)) {
      console.warn("[oxide] capture dropped — window not available");
      return;
    }
    lastCapture = { text, at: now };
  } catch (err) {
    console.error("[oxide] capture failed:", err);
  }
}

const shortcuts = new Shortcuts({
  togglePanel: () => panel.toggle(),
  captureClipboard: () => void captureClipboard(),
  snapWindow: () => panel.snapTo(settings.current.snapPosition),
});

// ---------------------------------------------------------------------------
// Settings → running app
// ---------------------------------------------------------------------------
function applyLoginItem(): void {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: settings.current.launchAtLogin });
  } catch (err) {
    console.error("[oxide] setLoginItemSettings failed:", err);
  }
}

function applySettings(next: OxideSettings, previous: OxideSettings): SaveSettingsResult {
  nativeTheme.themeSource = next.theme;
  if (next.launchAtLogin !== previous.launchAtLogin) applyLoginItem();
  panel.setAlwaysOnTop(next.alwaysOnTop);
  return shortcuts.apply(next);
}

// ---------------------------------------------------------------------------
// Menu. Production removes the default menu entirely (it would add
// Ctrl+R/Ctrl+Shift+I reload/devtools accelerators); dev keeps reload +
// devtools; macOS keeps the standard app/edit/window menus.
// ---------------------------------------------------------------------------
function setupMenu(): void {
  let template: MenuItemConstructorOptions[] | null = null;
  if (IS_DEV) {
    template = [{ label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] }];
  } else if (process.platform === "darwin") {
    template = [{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }];
  }
  Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template) : null);
}

// ---------------------------------------------------------------------------
// Tray — keep the app reachable while the panel is hidden.
// ---------------------------------------------------------------------------
function setupTray(): void {
  const preferred = assetPath(process.platform === "win32" ? "icon.ico" : "icon.png");
  const iconPath = existsSync(preferred) ? preferred : assetPath("icon.png");
  if (!existsSync(iconPath)) {
    console.warn("[oxide] tray icon missing:", iconPath);
    return;
  }
  try {
    tray = new Tray(iconPath);
    tray.setToolTip("Oxide");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show Oxide", click: () => panel.show() },
        { label: "Hide", click: () => panel.hide() },
        { type: "separator" },
        { label: "Quit Oxide", click: () => quitApp() },
      ])
    );
    tray.on("click", () => panel.toggle());
  } catch (err) {
    console.error("[oxide] tray failed:", err);
    tray = null;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
/** Longest a quit waits for a pending notes write. */
const QUIT_FLUSH_TIMEOUT_MS = 3000;

function quitApp(): void {
  quitting = true;
  app.quit();
}

function boot(): void {
  if (process.platform === "win32") {
    // correct taskbar identity/pinning for the packaged + dev exe
    app.setAppUserModelId("nl.stevenrs.oxide");
  }
  try {
    ensureDataDirs(paths);
    removeLeftoverShots(paths);
  } catch (err) {
    console.error("[oxide] could not prepare the data directory:", err);
  }
  nativeTheme.themeSource = settings.current.theme;
  applyLoginItem();
  setupMenu();
  registerIpc({ panel, paths, stateFile, settings, applySettings, quit: quitApp });
  panel.create();
  setupTray();
  shortcuts.apply(settings.current);

  app.on("second-instance", () => panel.show());
  // macOS: clicking the dock icon brings the panel back
  app.on("activate", () => panel.show());

  const { shortcuts: keys } = settings.current;
  console.log("[oxide] running. base dir:", paths.baseDir);
  console.log(
    `[oxide] ${keys.doubleShiftCapture ? `${keys.doubleTapKey} x2 = capture selection, ` : ""}${
      keys.captureClipboard || "(none)"
    } = capture clipboard, ${keys.togglePanel || "(none)"} = toggle panel`
  );
}

// Two instances would fight over the notes file, the shortcuts and the
// keyboard hook. Packaged builds only, so `bun run dev` still works next to
// an installed copy.
const isSecondInstance = app.isPackaged && !app.requestSingleInstanceLock();

if (isSecondInstance) {
  app.quit();
} else {
  app.on("before-quit", () => {
    quitting = true;
    panel.persistBoundsNow();
  });

  app.on("window-all-closed", () => {
    // the tray keeps the process alive while the panel is hidden/closed
    if (tray && !quitting) return;
    app.quit();
  });

  let flushed = false;
  app.on("will-quit", (event) => {
    shortcuts.dispose();
    globalShortcut.unregisterAll();
    if (flushed) return;
    // let a save that is still in flight reach the disk before exiting
    flushed = true;
    event.preventDefault();
    const giveUp = new Promise<void>((resolve) => setTimeout(resolve, QUIT_FLUSH_TIMEOUT_MS));
    // quit again from a fresh task: Electron ignores app.quit() until this
    // (prevented) will-quit has fully unwound, and an idle file resolves
    // before that
    void Promise.race([stateFile.idle(), giveUp]).finally(() => setImmediate(() => app.quit()));
  });

  void app.whenReady().then(boot);
}
