// Global shortcuts — driven by settings, re-registrable at runtime.
// Double-tap capture (Copper-style) runs via a low-level keyboard hook
// helper (shiftshift.ts) that simulates Ctrl+C and reports CAPTURE only when
// the clipboard actually changed — i.e. there was a real selection.

import { globalShortcut } from "electron";
import type { SaveSettingsResult } from "../shared/ipc";
import type { DoubleTapKey, OxideSettings } from "../shared/types";
import { startShiftShiftHelper, type ShiftShiftHandle } from "./shiftshift";

export interface ShortcutHandlers {
  togglePanel(): void;
  captureClipboard(): void;
  snapWindow(): void;
}

// a crashed helper is restarted a few times, then left alone until the next
// settings save — no restart loop if the hook can't be installed at all
const MAX_HELPER_RESTARTS = 3;
const HELPER_RESTART_DELAY_MS = 2000;
const HELPER_STABLE_AFTER_MS = 60_000;

/** Keeps the double-tap helper process in line with the settings. */
class DoubleTapCapture {
  private handle: ShiftShiftHandle | null = null;
  private config = ""; // "tapMs:key" the running helper was started with
  private wanted: { tapMs: number; tapKey: DoubleTapKey } | null = null;
  private startedAt = 0;
  private restarts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onCapture: () => void) {}

  sync(enabled: boolean, tapMs: number, tapKey: DoubleTapKey): void {
    if (!enabled) {
      this.stop();
      return;
    }
    const config = `${tapMs}:${tapKey}`;
    if (this.handle && this.config === config) return;
    this.stop();
    this.wanted = { tapMs, tapKey };
    this.config = config;
    this.restarts = 0;
    this.start();
  }

  stop(): void {
    this.wanted = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.handle?.stop();
    this.handle = null;
  }

  private start(): void {
    const wanted = this.wanted;
    if (!wanted) return;
    this.startedAt = Date.now();
    this.handle = startShiftShiftHelper({
      ...wanted,
      onCapture: this.onCapture,
      onStatus: (line) => console.log("[oxide:shiftshift]", line),
      onExit: (expected) => {
        if (!expected) this.onUnexpectedExit();
      },
    });
  }

  private onUnexpectedExit(): void {
    this.handle = null;
    if (!this.wanted) return;
    if (Date.now() - this.startedAt > HELPER_STABLE_AFTER_MS) this.restarts = 0;
    if (this.restarts >= MAX_HELPER_RESTARTS) {
      console.error("[oxide:shiftshift] helper keeps exiting — double-tap capture is off");
      return;
    }
    this.restarts++;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, HELPER_RESTART_DELAY_MS);
  }
}

export class Shortcuts {
  private registered: string[] = [];
  private readonly doubleTap: DoubleTapCapture;

  constructor(private readonly handlers: ShortcutHandlers) {
    this.doubleTap = new DoubleTapCapture(() => handlers.captureClipboard());
  }

  /** (Re-)register everything from the settings. Reports which shortcuts took. */
  apply(settings: OxideSettings): SaveSettingsResult {
    this.unregisterAll();
    const { shortcuts } = settings;
    const result: SaveSettingsResult = {
      togglePanelOk: this.register(shortcuts.togglePanel, this.handlers.togglePanel),
      captureClipboardOk: this.register(shortcuts.captureClipboard, this.handlers.captureClipboard),
      snapWindowOk: this.register(shortcuts.snapWindow, this.handlers.snapWindow),
    };
    this.doubleTap.sync(
      shortcuts.doubleShiftCapture,
      shortcuts.doubleShiftWindowMs,
      shortcuts.doubleTapKey
    );
    return result;
  }

  dispose(): void {
    this.unregisterAll();
    this.doubleTap.stop();
  }

  private register(accelerator: string, handler: () => void): boolean {
    if (!accelerator) return true; // left unset on purpose — nothing to register
    let ok = false;
    try {
      ok = globalShortcut.register(accelerator, handler);
    } catch (err) {
      // an accelerator Electron can't parse throws instead of returning false
      console.warn(`[oxide] invalid shortcut ${accelerator}:`, err);
      return false;
    }
    if (ok) this.registered.push(accelerator);
    else console.warn(`[oxide] could not register ${accelerator} (in use?)`);
    return ok;
  }

  private unregisterAll(): void {
    for (const accelerator of this.registered) {
      try {
        globalShortcut.unregister(accelerator);
      } catch {}
    }
    this.registered = [];
  }
}
