// The floating panel window: frameless, transparent, always on top.
//
// Electron's BrowserWindow works in DIP (logical px), so no per-monitor
// scaling math is needed anywhere in here.

import { app, BrowserWindow, screen, shell, type Rectangle } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DisplayInfo } from "../shared/ipc";
import { DEFAULT_WINDOW, MIN_WINDOW, type SnapPosition } from "../shared/types";
import { WindowMotion } from "./motion";
import type { SettingsStore } from "./storage";

export const IS_DEV = process.env.OXIDE_DEV === "1";
// view hot-reloads through serve.ts; main changes need a restart
const DEV_URL = "http://localhost:4820";

const BOUNDS_SAVE_DELAY_MS = 250;
const SNAP_MARGIN = 12; // breathing room from the screen edge
// a crashed renderer is reloaded, but not in a tight loop
const MAX_RELOADS_PER_MINUTE = 3;

export function assetPath(name: string): string {
  return join(app.getAppPath(), "assets", name);
}

/** Open a link in the system browser. Only web and mail links are allowed out. */
export function openExternalSafe(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (protocol !== "https:" && protocol !== "http:" && protocol !== "mailto:") {
    console.warn("[oxide] refused to open", url);
    return;
  }
  shell.openExternal(url).catch((err: unknown) => {
    console.error("[oxide] openExternal failed:", err);
  });
}

export function listDisplays(): DisplayInfo[] {
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

/** True when enough of the frame is on some display to grab it. */
function isReachable(frame: Rectangle): boolean {
  return screen.getAllDisplays().some((d) => {
    const r = d.workArea;
    return (
      frame.x + 40 < r.x + r.width &&
      frame.x + frame.width > r.x &&
      frame.y + 40 < r.y + r.height &&
      frame.y + frame.height > r.y
    );
  });
}

/** Shift a frame so it sits fully inside the work area (top-left wins if it can't fit). */
function fitInto(frame: Rectangle, workArea: Rectangle): Rectangle {
  const x = Math.max(workArea.x, Math.min(frame.x, workArea.x + workArea.width - frame.width));
  const y = Math.max(workArea.y, Math.min(frame.y, workArea.y + workArea.height - frame.height));
  return { ...frame, x, y };
}

export interface PanelOptions {
  settings: SettingsStore;
  /** Closing the window hides it instead while this returns true (tray present, not quitting). */
  hideOnClose(): boolean;
}

export class Panel {
  private win: BrowserWindow | null = null;
  // native frame captured right before shrinking to the pill
  private prePillFrame: Rectangle | null = null;
  private boundsTimer: ReturnType<typeof setTimeout> | null = null;
  private recentReloads: number[] = [];
  private readonly motion: WindowMotion;

  constructor(private readonly options: PanelOptions) {
    this.motion = new WindowMotion(
      {
        getBounds: () => this.alive()?.getBounds() ?? null,
        setBounds: (bounds) => this.alive()?.setBounds(bounds, false),
        getCursor: () => screen.getCursorScreenPoint(),
        onSettled: () => this.persistBoundsSoon(),
      },
      MIN_WINDOW
    );
  }

  /** The window, unless it has been closed or destroyed. */
  private alive(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  /** Dialog parent, when there is a window to attach to. */
  get window(): BrowserWindow | null {
    return this.alive();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  create(): BrowserWindow {
    const settings = this.options.settings.current;
    const iconPath = assetPath(process.platform === "win32" ? "icon.ico" : "icon.png");
    const bounds = this.initialBounds();
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      // resizable:false + the view's custom resize grip avoids the known
      // transparent-window resize artifacts on Windows; setBounds still works.
      // thickFrame:false (Windows) skips the 16×8 DIP resize inset Electron
      // 41.3+ adds to frameless windows — setPosition during a hold/drag
      // otherwise grows the HWND each tick (electron#51679).
      resizable: false,
      thickFrame: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: settings.alwaysOnTop,
      show: false,
      ...(!app.isPackaged && existsSync(iconPath) ? { icon: iconPath } : {}),
      webPreferences: {
        preload: join(app.getAppPath(), "dist-electron", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.win = win;
    this.prePillFrame = null;
    // on a scaled display (125 %, …) the constructor makes a frameless window
    // a few pixels wider than asked; setBounds lands exactly
    win.setBounds(bounds, false);

    win.once("ready-to-show", () => {
      if (!win.isDestroyed()) win.show();
    });
    win.on("close", (event) => {
      // the tray keeps the app alive: closing the panel just tucks it away
      if (!this.options.hideOnClose()) return;
      event.preventDefault();
      this.hide();
    });
    win.on("closed", () => {
      if (this.win !== win) return;
      this.motion.cancel();
      this.win = null;
      this.prePillFrame = null;
    });
    win.on("hide", () => this.motion.cancel());

    const contents = win.webContents;
    // the panel is a single page: links never navigate it or spawn windows
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event) => {
      event.preventDefault();
      openExternalSafe(event.url);
    });
    // a (re)loaded view always starts expanded — drop any pill-sized frame
    contents.on("dom-ready", () => {
      this.motion.cancel();
      this.pillRestore();
    });
    contents.on("render-process-gone", (_event, details) => {
      console.error("[oxide] renderer gone:", details.reason);
      this.motion.cancel();
      if (details.reason !== "clean-exit") this.reloadAfterCrash();
    });

    const loading = IS_DEV
      ? win.loadURL(DEV_URL)
      : win.loadFile(join(app.getAppPath(), "dist-renderer", "index.html"));
    loading.catch((err: unknown) => console.error("[oxide] failed to load the view:", err));
    return win;
  }

  private reloadAfterCrash(): void {
    const now = Date.now();
    this.recentReloads = this.recentReloads.filter((t) => now - t < 60_000);
    if (this.recentReloads.length >= MAX_RELOADS_PER_MINUTE) {
      console.error("[oxide] renderer keeps crashing — not reloading again");
      return;
    }
    this.recentReloads.push(now);
    this.alive()?.webContents.reload();
  }

  /** Design size, shrunk to the primary work area so it still fits a small display. */
  private defaultLaunchSize(): { width: number; height: number } {
    const wa = screen.getPrimaryDisplay().workArea;
    const margin = 24;
    return {
      width: Math.min(DEFAULT_WINDOW.width, Math.max(MIN_WINDOW.width, wa.width - margin)),
      height: Math.min(DEFAULT_WINDOW.height, Math.max(MIN_WINDOW.height, wa.height - margin)),
    };
  }

  /** Default size on every launch; restore last x/y if that point is still on a display. */
  private initialBounds(): Rectangle {
    const { width, height } = this.defaultLaunchSize();
    const saved = this.options.settings.current.window;
    if (typeof saved?.x !== "number" || typeof saved?.y !== "number") {
      return { width, height, x: 80, y: 80 };
    }
    const frame = { width, height, x: Math.round(saved.x), y: Math.round(saved.y) };
    if (isReachable(frame)) return frame;
    const wa = screen.getPrimaryDisplay().workArea;
    return { width, height, x: wa.x + 80, y: wa.y + 80 };
  }

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  isVisible(): boolean {
    return this.alive()?.isVisible() ?? false;
  }

  show(): void {
    const win = this.alive() ?? this.create();
    // a display may have been unplugged while the panel was hidden
    const frame = win.getBounds();
    if (!isReachable(frame)) {
      const wa = screen.getPrimaryDisplay().workArea;
      win.setBounds({ ...frame, x: wa.x + 80, y: wa.y + 80 }, false);
    }
    win.show();
    win.focus();
    // some platforms drop the topmost flag across hide/show — re-assert it
    win.setAlwaysOnTop(this.options.settings.current.alwaysOnTop);
  }

  hide(): void {
    this.motion.cancel();
    this.alive()?.hide();
  }

  toggle(): void {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  setAlwaysOnTop(value: boolean): void {
    this.alive()?.setAlwaysOnTop(value);
  }

  /** Send a one-way message to the view. False when there is no view to receive it. */
  send(channel: string, payload: unknown): boolean {
    const contents = this.alive()?.webContents;
    if (!contents || contents.isDestroyed()) return false;
    contents.send(channel, payload);
    return true;
  }

  /** True when an IPC message came from the panel's own page. */
  owns(sender: Electron.WebContents): boolean {
    return this.alive()?.webContents === sender;
  }

  // -------------------------------------------------------------------------
  // Frame persistence
  // -------------------------------------------------------------------------

  private persistBoundsSoon(): void {
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = setTimeout(() => {
      this.boundsTimer = null;
      this.persistBoundsNow();
    }, BOUNDS_SAVE_DELAY_MS);
  }

  persistBoundsNow(): void {
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = null;
    const win = this.alive();
    // the pill's tiny frame is temporary — never remember it
    if (!win || this.prePillFrame) return;
    const { width, height, x, y } = win.getBounds();
    this.options.settings.setWindow({ width, height, x, y });
  }

  // -------------------------------------------------------------------------
  // Pill (minimized) frame
  // -------------------------------------------------------------------------

  pillShrink(width: number, height: number): void {
    const win = this.alive();
    if (!win) return;
    this.motion.cancel();
    // a second shrink must not replace the snapshot with the pill's own frame
    this.prePillFrame ??= win.getBounds();
    const { x, y } = win.getBounds();
    win.setBounds({ x, y, width: Math.round(width), height: Math.round(height) }, false);
  }

  pillRestore(): void {
    const before = this.prePillFrame;
    const win = this.alive();
    this.prePillFrame = null;
    if (!before || !win) return;
    this.motion.cancel();
    const now = win.getBounds();
    let frame: Rectangle = { x: now.x, y: now.y, width: before.width, height: before.height };
    // the pill was dragged somewhere: make sure the panel grows back on-screen
    if (now.x !== before.x || now.y !== before.y) {
      frame = fitInto(frame, screen.getDisplayMatching(now).workArea);
    }
    win.setBounds(frame, false);
    this.persistBoundsSoon();
  }

  // -------------------------------------------------------------------------
  // Motion (see motion.ts)
  // -------------------------------------------------------------------------

  beginDrag(): void {
    this.motion.beginDrag();
  }

  endDrag(): void {
    this.motion.endDrag();
  }

  beginResize(): void {
    // the pill has a fixed size
    if (!this.prePillFrame) this.motion.beginResize();
  }

  endResize(): void {
    this.motion.endResize();
  }

  /**
   * Snap-to-position: send the window to a preset home spot on the chosen
   * display with a short eased slide. Work area is that display minus the
   * taskbar.
   */
  snapTo(position: SnapPosition): void {
    if (!this.isVisible()) this.show(); // snapping a hidden panel should reveal it
    const win = this.alive();
    if (!win) return;
    const frame = win.getBounds();
    const wa = this.snapDisplay(win).workArea;
    const left = wa.x + SNAP_MARGIN;
    const right = wa.x + wa.width - frame.width - SNAP_MARGIN;
    const top = wa.y + SNAP_MARGIN;
    const bottom = wa.y + wa.height - frame.height - SNAP_MARGIN;
    const middle = Math.round(wa.y + (wa.height - frame.height) / 2);
    const spots: Record<SnapPosition, { x: number; y: number }> = {
      left: { x: left, y: middle },
      right: { x: right, y: middle },
      "top-left": { x: left, y: top },
      "top-right": { x: right, y: top },
      "bottom-left": { x: left, y: bottom },
      "bottom-right": { x: right, y: bottom },
    };
    const spot = spots[position] ?? spots.left;
    this.motion.slideTo(spot.x, spot.y);
  }

  private snapDisplay(win: BrowserWindow): Electron.Display {
    const primary = screen.getPrimaryDisplay();
    const choice = this.options.settings.current.snapDisplay;
    if (choice === "current") return screen.getDisplayMatching(win.getBounds());
    if (typeof choice === "number") {
      return screen.getAllDisplays().find((d) => d.id === choice) ?? primary;
    }
    return primary;
  }
}
