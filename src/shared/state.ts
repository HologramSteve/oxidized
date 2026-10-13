// Note-state validation, shared by the main process and the view.
//
// The state file is a single JSON blob that may come from an older build, a
// backup someone edited by hand, or a half-written file. parseAppState()
// rebuilds it field by field so the rest of the app can trust its shape.

import type { AppState, Note, Section } from "./types";

// Archive and Trash are ordinary sections recognized by their title. They
// never show in the main list and are managed from the Settings page.
export const ARCHIVE_TITLE = "Archive";
export const TRASH_TITLE = "Trash";

function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

export function isArchive(section: Section): boolean {
  return titleKey(section.title) === "archive";
}

export function isTrash(section: Section): boolean {
  return titleKey(section.title) === "trash";
}

export function isHidden(section: Section): boolean {
  return isArchive(section) || isTrash(section);
}

/** Titles a user section can't take, because they would turn it into a hidden one. */
export function isReservedTitle(title: string): boolean {
  const key = titleKey(title);
  return key === "archive" || key === "trash";
}

export function newId(): string {
  return crypto.randomUUID();
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A usable unique id: the given one when it is a fresh non-empty string. */
function uniqueId(value: unknown, seen: Set<string>): string {
  const id = typeof value === "string" && value && !seen.has(value) ? value : newId();
  seen.add(id);
  return id;
}

function parseNote(raw: unknown, seen: Set<string>): Note | null {
  if (!isRecord(raw) || typeof raw.text !== "string") return null;
  const note: Note = {
    id: uniqueId(raw.id, seen),
    text: raw.text,
    done: raw.done === true,
    createdAt:
      typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now(),
  };
  if (typeof raw.deletedAt === "number" && Number.isFinite(raw.deletedAt)) {
    note.deletedAt = raw.deletedAt;
  }
  if (raw.important === true) note.important = true;
  return note;
}

function parseSection(raw: unknown, seenSections: Set<string>, seenNotes: Set<string>): Section | null {
  if (!isRecord(raw) || !Array.isArray(raw.notes)) return null;
  const section: Section = {
    id: uniqueId(raw.id, seenSections),
    title: typeof raw.title === "string" ? raw.title : "Notes",
    collapsed: raw.collapsed === true,
    notes: [],
  };
  if (typeof raw.color === "string" && HEX_COLOR.test(raw.color)) section.color = raw.color;
  for (const rawNote of raw.notes) {
    const note = parseNote(rawNote, seenNotes);
    if (note) section.notes.push(note);
  }
  return section;
}

/**
 * Validate and repair a parsed state blob. Returns null when it isn't an
 * Oxide state at all; malformed sections/notes inside a valid blob are
 * dropped rather than failing the whole load.
 */
export function parseAppState(raw: unknown): AppState | null {
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return null;

  const seenSections = new Set<string>();
  const seenNotes = new Set<string>();
  const sections: Section[] = [];
  for (const rawSection of raw.sections) {
    const section = parseSection(rawSection, seenSections, seenNotes);
    if (section) sections.push(section);
  }

  // an old bug could land new notes in the hidden Trash section — anything
  // there without a deletedAt was never deleted, so pull it back out
  const rescueTarget = sections.find((section) => !isHidden(section));
  if (rescueTarget) {
    for (const section of sections) {
      if (!isTrash(section)) continue;
      const stranded = section.notes.filter((note) => note.deletedAt === undefined);
      if (stranded.length === 0) continue;
      section.notes = section.notes.filter((note) => note.deletedAt !== undefined);
      rescueTarget.notes.push(...stranded);
    }
  }

  const active = sections.find((section) => section.id === raw.activeSectionId);
  const activeSectionId =
    active && !isHidden(active)
      ? active.id
      : (sections.find((section) => !isHidden(section))?.id ?? "");

  return { sections, activeSectionId };
}

/** Parse a state file's text. Null when it isn't valid JSON or not an Oxide state. */
export function parseStateJson(text: string): AppState | null {
  try {
    return parseAppState(JSON.parse(text));
  } catch {
    return null;
  }
}
