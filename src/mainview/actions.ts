// User-level commands. Each one changes the model (notes.ts), adds the
// feedback that goes with it (sound, toast, animation flags), saves, and
// asks for a re-render. Views, menus and keyboard shortcuts all call these —
// nothing else mutates the state.

import { isReservedTitle, isTrash, parseAppState } from "../shared/state";
import type { AppState, Note, Section } from "../shared/types";
import { allowMotion } from "./dom";
import { closeMenu } from "./menu";
import * as notes from "./notes";
import type { CopyFormat } from "./notes";
import { isDesktop, platform } from "./platform";
import { afterRender, invalidate } from "./render";
import { clearSelection, deselect, scrollFocusedIntoView, selectOnly, targetIds } from "./selection";
import { sounds } from "./sounds";
import { canUndo, clearUndo, persist, popUndo, pushUndo, saveSettings, store } from "./store";
import { toast } from "./toast";
import { resetSettingsPagination, ui, type EditSession, type SettingsTab, type View } from "./ui";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function navigateTo(next: View): void {
  if (ui.view === next) return;
  if (ui.view === "settings") resetSettingsPagination();
  ui.view = next;
  closeMenu();
  invalidate("list", "settings");
  if (next === "settings") void refreshDisplays();
}

/** Re-read the connected displays for the snap-display picker. */
/** Open Settings on a given page (or switch page when already there). */
export function openSettings(tab: SettingsTab = "general"): void {
  const changed = ui.settingsTab !== tab;
  ui.settingsTab = tab;
  if (ui.view !== "settings") navigateTo("settings");
  else if (changed) invalidate("settings");
}

export async function refreshDisplays(): Promise<void> {
  if (!isDesktop) return;
  let displays = ui.displays;
  try {
    displays = await platform.listDisplays();
  } catch (err) {
    console.error("[oxide] listDisplays failed", err);
    return;
  }
  if (JSON.stringify(displays) === JSON.stringify(ui.displays)) return;
  ui.displays = displays;
  if (ui.view === "settings") invalidate("settings");
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function addNote(text: string, sectionId: string = store.state.activeSectionId): Note | null {
  const note = notes.addNote(store.state, text, sectionId);
  if (!note) return null;
  ui.animEnter.add(note.id);
  persist();
  invalidate();
  return note;
}

export function toggleDone(ids: string[]): void {
  const result = notes.toggleDone(store.state, ids);
  if (!result) return;
  for (const note of result.changed) ui.animCheck.add(note.id);
  if (result.done) sounds.check();
  else sounds.uncheck();
  persist();
  invalidate();
}

export function toggleImportant(ids: string[]): void {
  const important = notes.toggleImportant(store.state, ids);
  if (important === null) return;
  for (const { note } of notes.findEntries(store.state, ids)) ui.animPop.add(note.id);
  sounds.pop();
  persist();
  invalidate();
  toast(important ? "Marked important" : "Importance removed");
}

export function toggleExpanded(ids: string[]): void {
  for (const id of ids) {
    if (ui.expanded.has(id)) ui.expanded.delete(id);
    else ui.expanded.add(id);
  }
  invalidate();
}

const REMOVE_ANIMATION_MS = 150;
// notes whose exit animation is playing — a second Delete must not queue them again
const leaving = new Set<string>();

/**
 * Delete notes. By default they move to the Trash (undoable) after a short
 * exit animation; `purge` removes them for good.
 */
export function deleteNotes(
  ids: string[],
  opts: { animate?: boolean; sound?: boolean; purge?: boolean } = {}
): void {
  const { animate = true, sound = true, purge = false } = opts;
  const pending = ids.filter((id) => !leaving.has(id));
  if (pending.length === 0) return;

  const remove = () => {
    for (const id of pending) leaving.delete(id);
    if (purge) {
      notes.purgeNotes(store.state, pending);
    } else {
      // notes already in the Trash stay put, and stay out of the undo history
      const live = notes
        .findEntries(store.state, pending)
        .filter((entry) => !isTrash(entry.section))
        .map((entry) => entry.note.id);
      pushUndo(notes.snapshotPlacements(store.state, live));
      notes.trashNotes(store.state, live);
    }
    deselect(pending);
    if (sound) sounds.remove();
    persist();
    invalidate();
  };

  if (animate && allowMotion()) {
    const cards = pending
      .map((id) => document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`))
      .filter((el): el is HTMLElement => el !== null);
    if (cards.length > 0) {
      for (const card of cards) card.classList.add("anim-out");
      for (const id of pending) leaving.add(id);
      setTimeout(remove, REMOVE_ANIMATION_MS);
      return;
    }
  }
  remove();
}

export function clearCompleted(): void {
  const ids = notes.completedIds(store.state);
  if (ids.length > 0) deleteNotes(ids);
}

export function duplicateNotes(ids: string[]): void {
  const copies = notes.duplicateNotes(store.state, ids);
  if (copies.length === 0) return;
  ui.selected.clear();
  for (const copy of copies) {
    ui.selected.add(copy.id);
    ui.animEnter.add(copy.id);
  }
  ui.focusedId = copies[0].id;
  sounds.pop();
  persist();
  invalidate();
  toast(copies.length > 1 ? `Duplicated ${copies.length} notes` : "Duplicated");
}

export function mergeNotes(ids: string[]): void {
  const merged = notes.mergeNotes(store.state, ids);
  if (!merged) return;
  selectOnly(merged.id);
  ui.animPop.add(merged.id);
  sounds.pop();
  persist();
  invalidate();
  toast("Merged");
}

/** Shift the targeted notes one slot up or down, hopping section edges. */
export function moveNotesBy(delta: -1 | 1): void {
  if (!notes.shiftNotes(store.state, targetIds(), delta)) return;
  persist();
  invalidate();
  afterRender(scrollFocusedIntoView);
}

export function moveNotes(ids: string[], sectionId: string): void {
  if (notes.moveNotesToSection(store.state, ids, sectionId).length === 0) return;
  persist();
  invalidate(); // the list rebuild animates the cards to their new spots
}

/** Drag & drop onto a card. */
export function dropNotesNextTo(ids: string[], targetId: string, before: boolean): void {
  if (!notes.placeNotesNextTo(store.state, ids, targetId, before)) return;
  persist();
  invalidate();
}

export function archiveNotes(ids: string[]): void {
  if (ids.length === 0) return;
  pushUndo(notes.snapshotPlacements(store.state, ids));
  notes.archiveNotes(store.state, ids);
  deselect(ids);
  sounds.pop();
  persist();
  invalidate();
  toast("Archived");
}

/** Bring notes back from the Archive or the Trash. */
export function restoreNotes(ids: string[]): void {
  notes.restoreNotes(store.state, ids);
  sounds.pop();
  persist();
  invalidate("list", "settings");
}

export async function copyNotes(ids: string[], format: CopyFormat): Promise<void> {
  const copied = notes.findEntries(store.state, ids).map((entry) => entry.note);
  if (copied.length === 0) return;
  let ok = false;
  try {
    ok = await platform.copy(notes.formatForCopy(copied, format));
  } catch (err) {
    console.error("[oxide] copy failed", err);
  }
  if (ok) sounds.copy();
  // copying as a list usually means "handed off" — optionally tick them off
  let completed = false;
  if (ok && format !== "plain" && store.settings.autoCompleteOnCopy) {
    const changed = notes.markDone(
      store.state,
      copied.map((note) => note.id)
    );
    if (changed.length > 0) {
      for (const note of changed) ui.animCheck.add(note.id);
      completed = true;
      persist();
      invalidate();
    }
  }
  toast(
    !ok
      ? "Copy failed"
      : format === "plain"
        ? "Copied"
        : completed
          ? "Copied as list · marked done"
          : "Copied as list"
  );
}

// ---------------------------------------------------------------------------
// Editing a note in place
// ---------------------------------------------------------------------------

export function startEditing(id: string): void {
  const entry = notes.findEntry(store.state, id);
  if (!entry) return;
  ui.editing = { id, draft: entry.note.text };
  invalidate();
}

/** Finish an edit. Stale sessions (already committed or cancelled) are ignored. */
export function commitEdit(session: EditSession): void {
  if (ui.editing !== session) return;
  ui.editing = null;
  const entry = notes.findEntry(store.state, session.id);
  const text = session.draft.trim();
  // an emptied note keeps its old text — deleting is a separate, undoable action
  if (entry && text && text !== entry.note.text) {
    entry.note.text = text;
    persist();
  }
  invalidate();
}

export function cancelEdit(session: EditSession): void {
  if (ui.editing !== session) return;
  ui.editing = null;
  invalidate();
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function addSection(): void {
  const section = notes.addSection(store.state, "New section");
  ui.renaming = { id: section.id, draft: section.title };
  persist();
  invalidate();
}

export function deleteSection(sectionId: string, withNotes: boolean): void {
  if (!notes.deleteSection(store.state, sectionId, withNotes)) return;
  persist();
  invalidate();
}

export function startRename(section: Section): void {
  ui.renaming = { id: section.id, draft: section.title };
  invalidate();
}

export function commitRename(session: EditSession): void {
  if (ui.renaming !== session) return;
  ui.renaming = null;
  const section = notes.findSection(store.state, session.id);
  const title = session.draft.trim();
  if (section && title && title !== section.title) {
    if (isReservedTitle(title)) {
      // "Archive" / "Trash" would silently turn it into a hidden section
      toast(`"${title}" is a reserved name`);
    } else {
      section.title = title;
      persist();
    }
  }
  invalidate();
}

export function cancelRename(session: EditSession): void {
  if (ui.renaming !== session) return;
  ui.renaming = null;
  invalidate();
}

/** Flip a section's collapsed flag and save. The caller updates or re-renders the DOM. */
export function toggleSectionCollapsed(section: Section): void {
  section.collapsed = !section.collapsed;
  persist();
}

export function toggleAllCollapsed(): void {
  notes.toggleAllCollapsed(store.state);
  persist();
  invalidate();
}

export function setSectionColor(section: Section, color: string): void {
  if (color) section.color = color;
  else delete section.color;
  persist();
  invalidate();
}

/** Choose where captures and new notes land. */
export function setCaptureTarget(sectionId: string): void {
  const section = notes.findSection(store.state, sectionId);
  if (!section) return;
  store.state.activeSectionId = section.id;
  persist();
  toast(`New notes go to ${section.title}`);
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export { canUndo };

export function undo(): void {
  const placements = popUndo();
  if (!placements) {
    toast("Nothing to undo");
    return;
  }
  for (const id of notes.restorePlacements(store.state, placements)) ui.animEnter.add(id);
  persist();
  invalidate("list", "settings");
  sounds.pop();
  toast("Undone");
}

// ---------------------------------------------------------------------------
// Settings shortcuts used outside the Settings page
// ---------------------------------------------------------------------------

export function toggleHideCompleted(): void {
  store.settings.hideCompleted = !store.settings.hideCompleted;
  void saveSettings();
  invalidate();
}


// ---------------------------------------------------------------------------
// Backup: export / import
// ---------------------------------------------------------------------------

export async function exportNotesFile(): Promise<void> {
  try {
    const payload = JSON.stringify({ version: 1, exportedAt: Date.now(), state: store.state }, null, 2);
    const ok = await platform.exportNotes(payload);
    toast(ok ? "Notes exported" : "Export cancelled");
  } catch (err) {
    console.error("[oxide] export failed", err);
    toast("Couldn't export notes");
  }
}

/** Accepts both an export file ({ state }) and a bare state blob. */
function parseBackup(raw: string): AppState | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return parseAppState((data as { state?: unknown }).state ?? data);
  } catch {
    return null;
  }
}

export async function importNotesFile(): Promise<void> {
  try {
    const raw = await platform.importNotes();
    if (!raw) return;
    const next = parseBackup(raw);
    if (!next) {
      toast("That file isn't an Oxide backup");
      return;
    }
    if (!confirm("Replace all notes with this backup? This cannot be undone.")) return;
    store.state = next;
    clearUndo();
    clearSelection();
    ui.editing = null;
    ui.renaming = null;
    persist();
    invalidate("list", "settings");
    toast("Notes imported");
  } catch (err) {
    console.error("[oxide] import failed", err);
    toast("Couldn't import notes");
  }
}
