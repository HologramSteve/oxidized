import { BrowserWindow, BrowserView, GlobalShortcut, Utils } from "electrobun/bun";
import { DEFAULT_SETTINGS, type OxideRPC, type OxideSettings } from "../shared/types";
import { startShiftShiftHelper, type ShiftShiftHandle } from "./shiftshift";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// DPI awareness (Windows).
// Electrobun's binaries ship without a DPI-awareness manifest, so at >100%
// display scaling Windows bitmap-stretches the whole window → blurry text.
// Opt this process into Per-Monitor V2 *before* any window is created;
// WebView2 then rasterizes at the real monitor scale and text is crisp.
// ---------------------------------------------------------------------------
let dpiScale = 1;
if (process.platform === "win32") {
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const user32 = dlopen("user32.dll", {
      SetProcessDpiAwarenessContext: { args: [FFIType.i64], returns: FFIType.i32 },
      GetDpiForSystem: { args: [], returns: FFIType.u32 },
    });
    // -4 = DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (Windows 10 1703+)
    const ok = user32.symbols.SetProcessDpiAwarenessContext(-4);
    dpiScale = user32.symbols.GetDpiForSystem() / 96;
    console.log(`[oxide] DPI awareness ${ok ? "enabled" : "already set"}, scale=${dpiScale}`);
  } catch (err) {
    console.warn("[oxide] DPI awareness setup failed:", err);
  }
}
// Once DPI-aware, window coordinates are physical pixels — scale the frame
// so the panel keeps the same apparent size at any display scaling.
const px = (n: number) => Math.round(n * dpiScale);

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
}

async function loadStateFile(): Promise<string | null> {
  try {
    // one-time migration from the old location
    if (!existsSync(dataFile) && existsSync(legacyDataFile)) {
      ensureDirs();
      copyFileSync(legacyDataFile, dataFile);
      console.log("[oxide] migrated notes from", legacyDataFile);
    }
    const f = Bun.file(dataFile);
    if (await f.exists()) return await f.text();
  } catch (err) {
    console.error("[oxide] failed to read state:", err);
  }
  return null;
}

async function saveStateFile(json: string): Promise<boolean> {
  try {
    ensureDirs();
    await Bun.write(dataFile, json);
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
      const raw = JSON.parse(readFileSync(settingsFile, "utf8"));
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(raw.shortcuts ?? {}) },
      };
    }
  } catch (err) {
    console.error("[oxide] failed to read settings, using defaults:", err);
  }
  return structuredClone(DEFAULT_SETTINGS);
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
// RPC between webview and bun
// ---------------------------------------------------------------------------
const rpc = BrowserView.defineRPC<OxideRPC>({
  maxRequestTime: 10_000,
  handlers: {
    requests: {
      loadState: () => loadStateFile(),
      saveState: ({ json }) => saveStateFile(json),
      copyText: ({ text }) => {
        try {
          Utils.clipboardWriteText(text);
          return true;
        } catch (err) {
          console.error("[oxide] clipboard write failed:", err);
          return false;
        }
      },
      loadSettings: () => {
        try {
          return JSON.stringify(settings);
        } catch {
          return null;
        }
      },
      saveSettings: ({ json }) => {
        try {
          const raw = JSON.parse(json);
          settings = {
            ...DEFAULT_SETTINGS,
            ...raw,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(raw.shortcuts ?? {}) },
          };
          saveSettingsFile(settings);
          win.setAlwaysOnTop(settings.alwaysOnTop !== false);
          return applyShortcuts();
        } catch (err) {
          console.error("[oxide] saveSettings failed:", err);
          return { togglePanelOk: false, captureClipboardOk: false };
        }
      },
    },
    messages: {
      hideWindow: () => hideWindow(),
      quitApp: () => {
        try {
          shiftShift?.stop();
          win.close();
        } finally {
          process.exit(0);
        }
      },
      setAlwaysOnTop: ({ value }) => {
        win.setAlwaysOnTop(value);
      },
      openExternal: ({ url }) => {
        try {
          Utils.openExternal(url);
        } catch (err) {
          console.error("[oxide] openExternal failed:", err);
        }
      },
      openDataDir: () => {
        try {
          ensureDirs();
          Utils.openPath(baseDir);
        } catch (err) {
          console.error("[oxide] openDataDir failed:", err);
        }
      },
      debugLog: ({ text }) => {
        console.log("[oxide:view]", text);
      },
      setWindowSize: ({ width, height }) => {
        try {
          win.setSize(Math.round(width), Math.round(height));
        } catch (err) {
          console.error("[oxide] setWindowSize failed:", err);
        }
      },
      pillShrink: ({ width, height }) => {
        try {
          // copy! getFrame() returns the window's internal frame object,
          // which setSize() mutates in place — an aliased snapshot would
          // silently become the pill size and restore would no-op
          prePillFrame = { ...win.getFrame() };
          win.setSize(Math.round(width), Math.round(height));
        } catch (err) {
          console.error("[oxide] pillShrink failed:", err);
        }
      },
      pillRestore: () => {
        try {
          if (prePillFrame) win.setSize(prePillFrame.width, prePillFrame.height);
        } catch (err) {
          console.error("[oxide] pillRestore failed:", err);
        }
      },
      menuGrow: ({ width, height }) => {
        try {
          // snapshot once — repeated grows while a menu is open must not
          // overwrite the frame we'll restore to. Copy: setSize() mutates
          // the object getFrame() returns.
          if (!preMenuFrame) preMenuFrame = { ...win.getFrame() };
          win.setSize(Math.round(width), Math.round(height));
        } catch (err) {
          console.error("[oxide] menuGrow failed:", err);
        }
      },
      menuRestore: () => {
        try {
          if (preMenuFrame) {
            win.setSize(preMenuFrame.width, preMenuFrame.height);
            preMenuFrame = null;
          }
        } catch (err) {
          console.error("[oxide] menuRestore failed:", err);
        }
      },
    },
  },
});

// ---------------------------------------------------------------------------
// The floating panel window: frameless, transparent, always on top.
// ---------------------------------------------------------------------------
const initialW = settings.window?.width ?? 380;
const initialH = settings.window?.height ?? 680;
const win = new BrowserWindow({
  title: "Oxide",
  url: "views://mainview/index.html",
  frame: { width: px(initialW), height: px(initialH), x: px(80), y: px(80) },
  titleBarStyle: "hidden",
  transparent: true,
  rpc,
});

win.setAlwaysOnTop(settings.alwaysOnTop !== false);

// Electrobun doesn't document hide()/show() on every platform, so probe for
// them at runtime and fall back to minimize/restore.
let panelVisible = true;
const anyWin = win as unknown as Record<string, undefined | (() => void)>;

function hideWindow() {
  if (typeof anyWin.hide === "function") anyWin.hide();
  else win.minimize();
  panelVisible = false;
}

function showWindow() {
  if (typeof anyWin.show === "function") anyWin.show();
  else if (typeof anyWin.restore === "function") anyWin.restore();
  if (typeof anyWin.focus === "function") anyWin.focus();
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
// ---------------------------------------------------------------------------
let lastCapture = { text: "", at: 0 };

function captureClipboard() {
  try {
    const text = Utils.clipboardReadText();
    if (!text || text.trim().length === 0) return;
    // skip duplicates: 30s window when dedupe is on (spamming Shift Shift on
    // the same selection shouldn't create twins), tiny debounce otherwise
    const dedupeMs = settings.dedupeCaptures !== false ? 30_000 : 1200;
    const now = Date.now();
    if (text === lastCapture.text && now - lastCapture.at < dedupeMs) return;
    lastCapture = { text, at: now };
    win.webview.rpc?.send.capture({ text });
  } catch (err) {
    console.error("[oxide] capture failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Global shortcuts — driven by settings, re-registrable at runtime.
// Double-Shift capture (Copper-style) runs via a low-level keyboard hook
// helper that simulates Ctrl+C and reports CAPTURE only when the clipboard
// actually changed — i.e. there was a real selection.
// ---------------------------------------------------------------------------
let registered: string[] = [];
let shiftShift: ShiftShiftHandle | null = null;
let helperConfig = ""; // "tapMs:key" the running helper was started with

function applyShortcuts(): { togglePanelOk: boolean; captureClipboardOk: boolean } {
  // drop previous registrations
  for (const acc of registered) {
    try {
      GlobalShortcut.unregister(acc);
    } catch {}
  }
  registered = [];

  const { togglePanel, captureClipboard: captureAcc, doubleShiftCapture } = settings.shortcuts;

  let togglePanelOk = false;
  if (togglePanel) {
    togglePanelOk = GlobalShortcut.register(togglePanel, toggleWindow);
    if (togglePanelOk) registered.push(togglePanel);
    else console.warn(`[oxide] could not register ${togglePanel} (in use?)`);
  }

  let captureClipboardOk = false;
  if (captureAcc) {
    captureClipboardOk = GlobalShortcut.register(captureAcc, captureClipboard);
    if (captureClipboardOk) registered.push(captureAcc);
    else console.warn(`[oxide] could not register ${captureAcc} (in use?)`);
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

  return { togglePanelOk, captureClipboardOk };
}

applyShortcuts();

console.log("[oxide] running. base dir:", baseDir);
console.log(
  `[oxide] ${settings.shortcuts.doubleShiftCapture ? `${settings.shortcuts.doubleTapKey || "shift"} x2 = capture selection, ` : ""}` +
    `${settings.shortcuts.captureClipboard} = capture clipboard, ${settings.shortcuts.togglePanel} = toggle panel`
);
