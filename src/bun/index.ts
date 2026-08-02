import { BrowserWindow, BrowserView, GlobalShortcut, Utils } from "electrobun/bun";
import {
  DEFAULT_SETTINGS,
  type OxideRPC,
  type OxideSettings,
  type SnapPosition,
} from "../shared/types";
import { startShiftShiftHelper, type ShiftShiftHandle } from "./shiftshift";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

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
const shotsDir = join(blobsDir, "shots");
const settingsFile = join(baseDir, "settings.json");
const dataFile = join(blobsDir, "notes.json");
// pre-0.2 location, migrated on first load
const legacyDataFile = join(process.env.APPDATA || homedir(), "OxideNotes", "notes.json");

function ensureDirs() {
  if (!existsSync(blobsDir)) mkdirSync(blobsDir, { recursive: true });
  if (!existsSync(shotsDir)) mkdirSync(shotsDir, { recursive: true });
}

// screenshot filenames are generated here and must stay path-safe
const SHOT_NAME = /^[\w.-]+\.png$/;

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
// Native window motion (Windows). Electrobun's setPosition/getFrame each do a
// synchronous RPC round trip to the host process — fine for one-off moves, far
// too jittery for a 120Hz animation. Talk to user32 directly instead.
// ---------------------------------------------------------------------------
let nativeMove: {
  get: () => { x: number; y: number } | null;
  set: (x: number, y: number) => void;
} | null = null;
if (process.platform === "win32") {
  try {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const u = dlopen("user32.dll", {
      FindWindowW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u64 },
      GetWindowRect: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
      SetWindowPos: {
        args: [
          FFIType.u64,
          FFIType.u64,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.i32,
          FFIType.u32,
        ],
        returns: FFIType.i32,
      },
    });
    const wTitle = Buffer.from("Oxide\0", "utf16le");
    let hwnd: number | bigint = 0;
    const ensureHwnd = () => {
      if (!hwnd) hwnd = u.symbols.FindWindowW(null, ptr(wTitle));
      return hwnd;
    };
    nativeMove = {
      get: () => {
        const h = ensureHwnd();
        if (!h) return null;
        const r = new Int32Array(4); // RECT
        if (!u.symbols.GetWindowRect(h, ptr(r))) return null;
        return { x: r[0], y: r[1] };
      },
      set: (x, y) => {
        const h = ensureHwnd();
        if (!h) return;
        // SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE
        u.symbols.SetWindowPos(h, 0, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010);
      },
    };
  } catch (err) {
    console.warn("[oxide] native window motion unavailable, falling back to RPC:", err);
  }
}

function getWinPos(): { x: number; y: number } {
  const p = nativeMove?.get();
  if (p) return p;
  const f = win.getFrame();
  return { x: f.x, y: f.y };
}

function setWinPos(x: number, y: number) {
  if (nativeMove) nativeMove.set(Math.round(x), Math.round(y));
  else win.setPosition(Math.round(x), Math.round(y));
}

// ---------------------------------------------------------------------------
// Window glide — while the user drags the window we sample its position,
// and on release keep it moving with decaying momentum instead of a hard
// stop. (The drag itself stays native; the webview just tells us when it
// starts and ends.)
// ---------------------------------------------------------------------------
let dragSamples: { x: number; y: number; t: number }[] = [];
let dragPoll: ReturnType<typeof setInterval> | null = null;
let glideTimer: ReturnType<typeof setInterval> | null = null;

function stopGlide() {
  if (glideTimer) {
    clearInterval(glideTimer);
    glideTimer = null;
    // we bypassed electrobun's RPC while animating — re-query the frame so
    // its internal cache matches where the window actually ended up
    try {
      win.getFrame();
    } catch {}
  }
}

function beginWindowDrag() {
  stopGlide();
  if (dragPoll) clearInterval(dragPoll);
  dragSamples = [];
  dragPoll = setInterval(() => {
    try {
      const p = getWinPos();
      dragSamples.push({ x: p.x, y: p.y, t: Date.now() });
      if (dragSamples.length > 12) dragSamples.shift();
    } catch {}
  }, 8);
}

// ---------------------------------------------------------------------------
// Snap-to-position: a global shortcut sends the window to a preset home spot
// (settings.snapPosition) with a short eased slide. The primary monitor's
// work area (screen minus taskbar) comes from SystemParametersInfoW.
// ---------------------------------------------------------------------------
let getWorkArea: () => { left: number; top: number; right: number; bottom: number } | null =
  () => null;
if (process.platform === "win32") {
  try {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const u32 = dlopen("user32.dll", {
      SystemParametersInfoW: {
        args: [FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32],
        returns: FFIType.i32,
      },
    });
    getWorkArea = () => {
      const rect = new Int32Array(4); // RECT { left, top, right, bottom }
      const ok = u32.symbols.SystemParametersInfoW(0x0030 /* SPI_GETWORKAREA */, 0, ptr(rect), 0);
      if (!ok) return null;
      return { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] };
    };
  } catch (err) {
    console.warn("[oxide] work-area lookup unavailable:", err);
  }
}

/** Slide the window to (tx, ty) over ~320ms with an ease-out curve. */
function animateWindowTo(tx: number, ty: number) {
  stopGlide();
  const { x: sx, y: sy } = getWinPos();
  if (Math.abs(tx - sx) < 2 && Math.abs(ty - sy) < 2) return;
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
  if (!wa) return;
  const f = win.getFrame();
  const m = px(12); // breathing room from the screen edge
  const midY = Math.round(wa.top + (wa.bottom - wa.top - f.height) / 2);
  let x: number;
  let y: number;
  switch (position) {
    case "left":
      x = wa.left + m;
      y = midY;
      break;
    case "right":
      x = wa.right - f.width - m;
      y = midY;
      break;
    case "top-left":
      x = wa.left + m;
      y = wa.top + m;
      break;
    case "top-right":
      x = wa.right - f.width - m;
      y = wa.top + m;
      break;
    case "bottom-left":
      x = wa.left + m;
      y = wa.bottom - f.height - m;
      break;
    case "bottom-right":
      x = wa.right - f.width - m;
      y = wa.bottom - f.height - m;
      break;
  }
  if (!panelVisible) showWindow(); // snapping a hidden panel should reveal it
  animateWindowTo(x, y);
}

function endWindowDrag() {
  if (!dragPoll) return;
  clearInterval(dragPoll);
  dragPoll = null;
  // velocity from the last ~120ms of samples
  const now = Date.now();
  const recent = dragSamples.filter((s) => now - s.t < 120);
  dragSamples = [];
  if (recent.length < 2) return;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = b.t - a.t;
  if (dt < 20) return;
  let vx = (b.x - a.x) / dt; // physical px per ms
  let vy = (b.y - a.y) / dt;
  let speed = Math.hypot(vx, vy);
  if (speed < 0.08) return; // a gentle release shouldn't drift
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
          return { togglePanelOk: false, captureClipboardOk: false, snapWindowOk: false };
        }
      },
      loadScreenshot: async ({ name }) => {
        try {
          if (!SHOT_NAME.test(name)) return null;
          const f = Bun.file(join(shotsDir, name));
          if (!(await f.exists())) return null;
          return Buffer.from(await f.arrayBuffer()).toString("base64");
        } catch (err) {
          console.error("[oxide] loadScreenshot failed:", err);
          return null;
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
      windowDragStart: () => beginWindowDrag(),
      windowDragEnd: () => endWindowDrag(),
      debugLog: ({ text }) => {
        console.log("[oxide:view]", text);
      },
      deleteScreenshot: ({ name }) => {
        try {
          if (!SHOT_NAME.test(name)) return;
          const p = join(shotsDir, name);
          if (existsSync(p)) unlinkSync(p);
        } catch (err) {
          console.error("[oxide] deleteScreenshot failed:", err);
        }
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

// ---------------------------------------------------------------------------
// Taskbar icon (Windows). In dev the process runs under bun's exe, so the
// taskbar shows the Bun logo — override it at runtime with WM_SETICON.
// Packaged builds also get build.win.icon from electrobun.config.ts.
// ---------------------------------------------------------------------------
async function applyTaskbarIcon() {
  if (process.platform !== "win32") return;
  try {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const user32 = dlopen("user32.dll", {
      FindWindowW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u64 },
      LoadImageW: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
        returns: FFIType.u64,
      },
      SendMessageW: {
        args: [FFIType.u64, FFIType.u32, FFIType.u64, FFIType.u64],
        returns: FFIType.i64,
      },
    });
    // dev runs from the project root; packaged builds carry assets/ alongside
    const candidates = [
      join(process.cwd(), "assets", "icon.ico"),
      join(import.meta.dir, "assets", "icon.ico"),
      join(import.meta.dir, "..", "assets", "icon.ico"),
      join(import.meta.dir, "..", "..", "assets", "icon.ico"),
    ];
    const icoPath = candidates.find((p) => existsSync(p));
    if (!icoPath) {
      console.warn("[oxide] icon.ico not found, keeping default taskbar icon");
      return;
    }
    const wPath = Buffer.from(icoPath + "\0", "utf16le");
    const wTitle = Buffer.from("Oxide\0", "utf16le");
    const WM_SETICON = 0x0080;
    const IMAGE_ICON = 1;
    const LR_LOADFROMFILE = 0x10;
    const big = user32.symbols.LoadImageW(null, ptr(wPath), IMAGE_ICON, 256, 256, LR_LOADFROMFILE);
    const small = user32.symbols.LoadImageW(null, ptr(wPath), IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
    if (!big && !small) {
      console.warn("[oxide] could not load icon.ico");
      return;
    }
    // the native window appears asynchronously — poll for it briefly
    let tries = 0;
    const attempt = () => {
      const hwnd = user32.symbols.FindWindowW(null, ptr(wTitle));
      if (!hwnd) {
        if (++tries < 40) setTimeout(attempt, 250);
        else console.warn("[oxide] window not found, taskbar icon not applied");
        return;
      }
      if (big) user32.symbols.SendMessageW(hwnd, WM_SETICON, 1 /* ICON_BIG */, big);
      if (small) user32.symbols.SendMessageW(hwnd, WM_SETICON, 0 /* ICON_SMALL */, small);
      console.log("[oxide] taskbar icon applied");
    };
    attempt();
  } catch (err) {
    console.warn("[oxide] taskbar icon setup failed:", err);
  }
}
void applyTaskbarIcon();

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

// Screenshot the window the text was selected from. At capture time the
// source app is still the foreground window (Oxide never takes focus), so
// grab its DWM extended frame bounds and copy that screen region to a PNG.
// Runs in a hidden PowerShell child, fire-and-forget: the capture note is
// sent immediately with the predicted filename and the file lands ~1s later
// (the webview retries loading briefly).
function screenshotForeground(): string | null {
  if (process.platform !== "win32" || settings.captureScreenshot === false) return null;
  try {
    ensureDirs();
    const name = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    // single-quoted PS string literal; ' is the only char needing escaping
    const psPath = join(shotsDir, name).replace(/'/g, "''");
    const script = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class OxShot {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("user32.dll")] public static extern int SetProcessDpiAwarenessContext(long v);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}
'@
Add-Type -AssemblyName System.Drawing
[void][OxShot]::SetProcessDpiAwarenessContext(-4)
$h=[OxShot]::GetForegroundWindow()
if($h -eq [IntPtr]::Zero){exit 1}
$r=New-Object OxShot+RECT
if([OxShot]::DwmGetWindowAttribute($h,9,[ref]$r,16) -ne 0){[void][OxShot]::GetWindowRect($h,[ref]$r)}
$w=$r.R-$r.L; $ht=$r.B-$r.T
if($w -le 0 -or $ht -le 0){exit 1}
$bmp=New-Object System.Drawing.Bitmap($w,$ht)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L,$r.T,0,0,$bmp.Size)
$bmp.Save('${psPath}',[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    Bun.spawn(
      [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encoded,
      ],
      { stdout: "ignore", stderr: "ignore" }
    );
    return name;
  } catch (err) {
    console.error("[oxide] screenshot failed:", err);
    return null;
  }
}

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
    const screenshot = screenshotForeground();
    win.webview.rpc?.send.capture(screenshot ? { text, screenshot } : { text });
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

function applyShortcuts(): {
  togglePanelOk: boolean;
  captureClipboardOk: boolean;
  snapWindowOk: boolean;
} {
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

  let snapWindowOk = false;
  const snapAcc = settings.shortcuts.snapWindow;
  if (snapAcc) {
    snapWindowOk = GlobalShortcut.register(snapAcc, () =>
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

applyShortcuts();

console.log("[oxide] running. base dir:", baseDir);
console.log(
  `[oxide] ${settings.shortcuts.doubleShiftCapture ? `${settings.shortcuts.doubleTapKey || "shift"} x2 = capture selection, ` : ""}` +
    `${settings.shortcuts.captureClipboard} = capture clipboard, ${settings.shortcuts.togglePanel} = toggle panel`
);
