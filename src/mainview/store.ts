// The persisted model: notes state + settings, and how they get saved.
//
// State is a single JSON blob. Changes are debounced (350 ms) and flushed
// early whenever the panel might be about to go away (blur, hide, quit), so
// a quick edit followed by a quit still reaches the disk.

import { mergeSettings } from "../shared/settings";
import type { AppState, OxideSettings } from "../shared/types";
import type { Placement } from "./notes";
import { platform } from "./platform";
import { setSoundsEnabled } from "./sounds";
import { toast } from "./toast";

/** Static facts about this run, filled in at boot. */
export const env = {
  version: "",
  /** Where the data lives, as shown in Settings. */
  dataLocation: platform.isDesktop ? "%LOCALAPPDATA%\\oxidized" : "localStorage",
};

export const store: { state: AppState; settings: OxideSettings } = {
  state: { sections: [], activeSectionId: "" },
  settings: mergeSettings(null),
};

// ---------------------------------------------------------------------------
// Notes persistence
// ---------------------------------------------------------------------------

const SAVE_DELAY_MS = 350;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsaved = false;
// avoid a toast per keystroke while the disk is unhappy: one per failure streak
let saveFailing = false;

/** Schedule a save of the notes state. */
export function persist(): void {
  unsaved = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushState(), SAVE_DELAY_MS);
}

/** Save pending changes now. Safe to call at any time; a no-op when nothing changed. */
export async function flushState(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!unsaved) return;
  unsaved = false;
  let ok = false;
  try {
    ok = await platform.saveState(JSON.stringify(store.state));
  } catch (err) {
    console.error("[oxide] saveState failed", err);
  }
  if (ok) {
    saveFailing = false;
    return;
  }
  // keep the changes marked dirty so the next flush tries again
  unsaved = true;
  if (!saveFailing) toast("Couldn't save notes");
  saveFailing = true;
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

// which shortcuts failed on the last save — re-announced only when it changes
let lastShortcutFailures = "";

/** Change one or more settings, then apply and save them. */
export function updateSettings(change: (settings: OxideSettings) => void): void {
  change(store.settings);
  void saveSettings();
}

/** Apply and save the current settings (they are small — no debounce). */
export async function saveSettings(): Promise<void> {
  setSoundsEnabled(store.settings.sounds);
  try {
    const res = await platform.saveSettings(store.settings);
    const failures = [
      res.togglePanelOk ? "" : "toggle",
      res.captureClipboardOk ? "" : "capture",
      res.snapWindowOk ? "" : "snap",
    ].join("|");
    if (failures !== "||" && failures !== lastShortcutFailures) {
      toast("A shortcut failed to register");
    }
    lastShortcutFailures = failures;
  } catch (err) {
    console.error("[oxide] saveSettings failed", err);
    toast("Couldn't save settings");
  }
}

// ---------------------------------------------------------------------------
// Undo stack (see notes.ts: snapshotPlacements / restorePlacements)
// ---------------------------------------------------------------------------

const UNDO_LIMIT = 20;
const undoStack: Placement[][] = [];

export function pushUndo(placements: Placement[]): void {
  if (placements.length === 0) return;
  undoStack.push(placements);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

export function popUndo(): Placement[] | undefined {
  return undoStack.pop();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function clearUndo(): void {
  undoStack.length = 0;
}
