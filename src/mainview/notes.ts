// Note and section operations on an AppState.
//
// Pure data manipulation: no DOM, no sounds, no persistence — the callers in
// actions.ts add those. Everything here mutates the state it is given and is
// covered by tests/notes.test.ts.

import {
  ARCHIVE_TITLE,
  TRASH_TITLE,
  isArchive,
  isHidden,
  isTrash,
  newId,
} from "../shared/state";
import type { AppState, Note, Section } from "../shared/types";

export interface NoteEntry {
  note: Note;
  section: Section;
}

export type CopyFormat = "plain" | "numbered" | "markdown";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createSection(title: string, collapsed = false): Section {
  return { id: newId(), title, collapsed, notes: [] };
}

function createNote(text: string): Note {
  return { id: newId(), text, done: false, createdAt: Date.now() };
}

/** First-run content. */
export function seedState(): AppState {
  const welcome = createSection("Welcome");
  welcome.notes = [
    "**This is Oxide** — a floating scratchpad for AI-scattered work. Type below to stage prompts, check them off as you go.",
    "**Keyboard first:** arrows to navigate, `Space` marks done, `Enter` edits, `Ctrl+C` copies, `Ctrl+Alt+C` copies selection as a numbered list.",
    "Right-click a card for *Copy as List*, *Merge Notes*, *Move to…* and more.",
    "On desktop: `Ctrl+Shift+C` captures your clipboard as a note from anywhere, `Ctrl+Shift+Space` toggles this panel.",
  ].map(createNote);
  const prompts = createSection("Prompt queue");
  return { sections: [welcome, prompts], activeSectionId: prompts.id };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Sections shown in the main list (everything but Archive and Trash). */
export function visibleSections(state: AppState): Section[] {
  return state.sections.filter((section) => !isHidden(section));
}

export function firstVisibleSection(state: AppState): Section | undefined {
  return state.sections.find((section) => !isHidden(section));
}

export function findSection(state: AppState, sectionId: string): Section | undefined {
  return state.sections.find((section) => section.id === sectionId);
}

export function findEntry(state: AppState, id: string): NoteEntry | null {
  for (const section of state.sections) {
    for (const note of section.notes) {
      if (note.id === id) return { note, section };
    }
  }
  return null;
}

/** The given notes with their sections, in display order. */
export function findEntries(state: AppState, ids: Iterable<string>): NoteEntry[] {
  const want = new Set(ids);
  const out: NoteEntry[] = [];
  if (want.size === 0) return out;
  for (const section of state.sections) {
    for (const note of section.notes) {
      if (want.has(note.id)) out.push({ note, section });
    }
  }
  return out;
}

export function matchesFilter(note: Note, query: string, hideCompleted: boolean): boolean {
  if (hideCompleted && note.done) return false;
  if (!query) return true;
  return note.text.toLowerCase().includes(query.toLowerCase());
}

/** Notes currently visible (search-filtered, sections expanded), in display order. */
export function visibleNotes(state: AppState, query: string, hideCompleted: boolean): Note[] {
  const out: Note[] = [];
  for (const section of visibleSections(state)) {
    if (section.collapsed && !query) continue;
    for (const note of section.notes) {
      if (matchesFilter(note, query, hideCompleted)) out.push(note);
    }
  }
  return out;
}

/** Open tasks in the main list — the number on the pill. */
export function remainingCount(state: AppState): number {
  let count = 0;
  for (const section of visibleSections(state)) {
    for (const note of section.notes) if (!note.done) count++;
  }
  return count;
}

export function archivedNotes(state: AppState): Note[] {
  return state.sections.filter(isArchive).flatMap((section) => section.notes);
}

export function trashedNotes(state: AppState): Note[] {
  return state.sections.filter(isTrash).flatMap((section) => section.notes);
}

/** Done notes in the main list (Archive and Trash are left alone). */
export function completedIds(state: AppState): string[] {
  return visibleSections(state).flatMap((section) =>
    section.notes.filter((note) => note.done).map((note) => note.id)
  );
}

export function formatForCopy(notes: Note[], format: CopyFormat): string {
  const oneLine = (note: Note) => note.text.replace(/\n+/g, " ");
  if (format === "numbered") return notes.map((note, i) => `${i + 1}. ${oneLine(note)}`).join("\n");
  // markdown bullet list, one item per note
  if (format === "markdown") return notes.map((note) => `- ${oneLine(note)}`).join("\n");
  return notes.map((note) => note.text).join("\n\n");
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function hiddenSection(state: AppState, find: (s: Section) => boolean, title: string): Section {
  let section = state.sections.find(find);
  if (!section) {
    section = createSection(title, true);
    state.sections.push(section);
  }
  return section;
}

function trashSection(state: AppState): Section {
  return hiddenSection(state, isTrash, TRASH_TITLE);
}

function archiveSection(state: AppState): Section {
  return hiddenSection(state, isArchive, ARCHIVE_TITLE);
}

/** Pull notes out of every section (except `keep`), in display order. */
function takeNotes(state: AppState, ids: Iterable<string>, keep?: Section): Note[] {
  const want = new Set(ids);
  const taken: Note[] = [];
  if (want.size === 0) return taken;
  for (const section of state.sections) {
    if (section === keep) continue;
    const stay: Note[] = [];
    for (const note of section.notes) {
      if (want.has(note.id)) taken.push(note);
      else stay.push(note);
    }
    if (stay.length !== section.notes.length) section.notes = stay;
  }
  return taken;
}

/**
 * Add a note. Never lands in Trash/Archive — if the target is hidden or
 * gone it falls back to the first visible section, creating one if needed.
 */
export function addNote(state: AppState, text: string, sectionId?: string): Note | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const target = sectionId ? findSection(state, sectionId) : undefined;
  let section = target && !isHidden(target) ? target : firstVisibleSection(state);
  if (!section) {
    section = createSection("Notes");
    state.sections.push(section);
    state.activeSectionId = section.id;
  }
  const note = createNote(trimmed);
  section.notes.push(note);
  return note;
}

/**
 * Flip the done state: if any of the notes is open they all become done,
 * otherwise they all reopen. Returns the notes whose state changed.
 */
export function toggleDone(state: AppState, ids: Iterable<string>): { changed: Note[]; done: boolean } | null {
  const entries = findEntries(state, ids);
  if (entries.length === 0) return null;
  const done = entries.some((entry) => !entry.note.done);
  const changed: Note[] = [];
  for (const { note } of entries) {
    if (note.done === done) continue;
    note.done = done;
    changed.push(note);
  }
  return { changed, done };
}

/** Mark notes done. Returns the ones that weren't already. */
export function markDone(state: AppState, ids: Iterable<string>): Note[] {
  const changed: Note[] = [];
  for (const { note } of findEntries(state, ids)) {
    if (note.done) continue;
    note.done = true;
    changed.push(note);
  }
  return changed;
}

/** Same any-then-all rule as toggleDone. Returns the new flag, or null if nothing matched. */
export function toggleImportant(state: AppState, ids: Iterable<string>): boolean | null {
  const entries = findEntries(state, ids);
  if (entries.length === 0) return null;
  const important = entries.some((entry) => !entry.note.important);
  for (const { note } of entries) {
    if (important) note.important = true;
    else delete note.important;
  }
  return important;
}

/** Soft delete: move notes into the Trash section. Returns the moved notes. */
export function trashNotes(state: AppState, ids: Iterable<string>): Note[] {
  const trash = trashSection(state);
  const moving = takeNotes(state, ids, trash);
  const now = Date.now();
  for (const note of moving) note.deletedAt = now;
  trash.notes.push(...moving);
  return moving;
}

/** Hard delete. */
export function purgeNotes(state: AppState, ids: Iterable<string>): Note[] {
  return takeNotes(state, ids);
}

/** Move notes to the end of a section. Leaving the Trash clears the deleted mark. */
export function moveNotesToSection(state: AppState, ids: Iterable<string>, sectionId: string): Note[] {
  const dest = findSection(state, sectionId);
  if (!dest) return [];
  const moving = takeNotes(state, ids);
  if (!isTrash(dest)) for (const note of moving) delete note.deletedAt;
  dest.notes.push(...moving);
  return moving;
}

/** Drag & drop: place notes right before or after another note. */
export function placeNotesNextTo(
  state: AppState,
  ids: Iterable<string>,
  targetId: string,
  before: boolean
): boolean {
  const want = new Set(ids);
  if (want.size === 0 || want.has(targetId)) return false;
  const target = findEntry(state, targetId);
  if (!target) return false;
  const moving = takeNotes(state, want);
  if (moving.length === 0) return false;
  if (!isTrash(target.section)) for (const note of moving) delete note.deletedAt;
  const index = target.section.notes.findIndex((note) => note.id === targetId);
  target.section.notes.splice(before ? index : index + 1, 0, ...moving);
  return true;
}

/** Shift notes one slot up or down, hopping section edges. Returns whether anything moved. */
export function shiftNotes(state: AppState, ids: Iterable<string>, delta: -1 | 1): boolean {
  const want = new Set(ids);
  if (want.size === 0) return false;
  const sections = visibleSections(state);
  let moved = false;

  if (delta === -1) {
    for (let si = 0; si < sections.length; si++) {
      const notes = sections[si].notes;
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (!want.has(note.id)) continue;
        if (i > 0 && !want.has(notes[i - 1].id)) {
          notes.splice(i, 1);
          notes.splice(i - 1, 0, note);
          moved = true;
        } else if (i === 0 && si > 0) {
          notes.splice(i, 1);
          sections[si - 1].notes.push(note);
          i--; // the list shifted under us
          moved = true;
        }
      }
    }
  } else {
    for (let si = sections.length - 1; si >= 0; si--) {
      const notes = sections[si].notes;
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        if (!want.has(note.id)) continue;
        if (i < notes.length - 1 && !want.has(notes[i + 1].id)) {
          notes.splice(i, 1);
          notes.splice(i + 1, 0, note);
          moved = true;
        } else if (i === notes.length - 1 && si < sections.length - 1) {
          notes.splice(i, 1);
          sections[si + 1].notes.unshift(note);
          moved = true;
        }
      }
    }
  }
  return moved;
}

/** Insert a copy right after each note. Returns the copies in display order. */
export function duplicateNotes(state: AppState, ids: Iterable<string>): Note[] {
  const want = new Set(ids);
  const copies: Note[] = [];
  if (want.size === 0) return copies;
  for (const section of state.sections) {
    if (!section.notes.some((note) => want.has(note.id))) continue;
    const next: Note[] = [];
    for (const note of section.notes) {
      next.push(note);
      if (!want.has(note.id)) continue;
      const copy: Note = { ...note, id: newId(), createdAt: Date.now() };
      next.push(copy);
      copies.push(copy);
    }
    section.notes = next;
  }
  return copies;
}

/**
 * Join notes into the first one (display order), separated by blank lines.
 * The others are removed for good — their text lives on in the merged note.
 */
export function mergeNotes(state: AppState, ids: Iterable<string>): Note | null {
  const entries = findEntries(state, ids);
  if (entries.length < 2) return null;
  const first = entries[0].note;
  first.text = entries.map((entry) => entry.note.text).join("\n\n");
  first.done = false;
  purgeNotes(
    state,
    entries.slice(1).map((entry) => entry.note.id)
  );
  return first;
}

export function archiveNotes(state: AppState, ids: Iterable<string>): Note[] {
  return moveNotesToSection(state, ids, archiveSection(state).id);
}

/** Bring notes back from Archive/Trash into the first visible section. */
export function restoreNotes(state: AppState, ids: Iterable<string>): Note[] {
  let target = firstVisibleSection(state);
  if (!target) {
    target = createSection("Notes");
    state.sections.unshift(target);
    state.activeSectionId = target.id;
  }
  return moveNotesToSection(state, ids, target.id);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Append a section and make it the capture target. */
export function addSection(state: AppState, title: string): Section {
  const section = createSection(title || "New section");
  state.sections.push(section);
  state.activeSectionId = section.id;
  return section;
}

/**
 * Remove a section. Its notes either go to the Trash (`withNotes`) or move
 * to the first remaining visible section, which is created if there is none.
 */
export function deleteSection(state: AppState, sectionId: string, withNotes: boolean): boolean {
  const index = state.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return false;
  const [removed] = state.sections.splice(index, 1);
  if (removed.notes.length > 0) {
    if (withNotes) {
      // soft delete: the section's notes survive in the trash
      const now = Date.now();
      for (const note of removed.notes) note.deletedAt = now;
      trashSection(state).notes.push(...removed.notes);
    } else {
      let fallback = firstVisibleSection(state);
      if (!fallback) {
        fallback = createSection("Notes");
        state.sections.unshift(fallback);
      }
      fallback.notes.push(...removed.notes);
    }
  }
  if (state.activeSectionId === sectionId) {
    state.activeSectionId = firstVisibleSection(state)?.id ?? "";
  }
  return true;
}

/** Collapse every visible section — or expand them all when they already are. */
export function toggleAllCollapsed(state: AppState): void {
  const sections = visibleSections(state);
  const collapse = sections.some((section) => !section.collapsed);
  for (const section of sections) section.collapsed = collapse;
}

// ---------------------------------------------------------------------------
// Undo (delete / archive). Soft-moves are reversible; purges are not.
// ---------------------------------------------------------------------------

export interface Placement {
  note: Note;
  sectionId: string;
  index: number;
}

/** Remember where notes are, so a later move can be reversed. */
export function snapshotPlacements(state: AppState, ids: Iterable<string>): Placement[] {
  const want = new Set(ids);
  const out: Placement[] = [];
  if (want.size === 0) return out;
  for (const section of state.sections) {
    section.notes.forEach((note, index) => {
      if (want.has(note.id)) out.push({ note: { ...note }, sectionId: section.id, index });
    });
  }
  return out;
}

/** Put notes back where a snapshot found them. Returns the restored note ids. */
export function restorePlacements(state: AppState, placements: Placement[]): string[] {
  takeNotes(
    state,
    placements.map((placement) => placement.note.id)
  );
  const restored: string[] = [];
  for (const placement of placements) {
    const dest = findSection(state, placement.sectionId) ?? firstVisibleSection(state);
    if (!dest) continue;
    const note: Note = { ...placement.note };
    if (!isTrash(dest)) delete note.deletedAt;
    const index = Math.max(0, Math.min(placement.index, dest.notes.length));
    dest.notes.splice(index, 0, note);
    restored.push(note.id);
  }
  return restored;
}
