import { describe, expect, test } from "bun:test";
import * as notes from "../src/mainview/notes";
import { isArchive, isTrash } from "../src/shared/state";
import type { AppState, Note, Section } from "../src/shared/types";

function note(id: string, extra: Partial<Note> = {}): Note {
  return { id, text: `text ${id}`, done: false, createdAt: 1, ...extra };
}

function section(id: string, noteIds: string[], extra: Partial<Section> = {}): Section {
  return { id, title: id, collapsed: false, notes: noteIds.map((n) => note(n)), ...extra };
}

/** Two visible sections: A = [a1 a2 a3], B = [b1 b2]. */
function sample(): AppState {
  return {
    sections: [section("A", ["a1", "a2", "a3"]), section("B", ["b1", "b2"])],
    activeSectionId: "B",
  };
}

const ids = (state: AppState, sectionId: string) =>
  notes.findSection(state, sectionId)!.notes.map((n) => n.id);
const trash = (state: AppState) => state.sections.find(isTrash);
const archive = (state: AppState) => state.sections.find(isArchive);

describe("addNote", () => {
  test("appends to the requested section, trimmed", () => {
    const state = sample();
    const added = notes.addNote(state, "  hello  ", "A");
    expect(added?.text).toBe("hello");
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3", added!.id]);
  });

  test("ignores blank text", () => {
    const state = sample();
    expect(notes.addNote(state, "   \n ", "A")).toBeNull();
    expect(ids(state, "A")).toHaveLength(3);
  });

  test("never lands in a hidden section", () => {
    const state = sample();
    notes.trashNotes(state, ["a1"]);
    const added = notes.addNote(state, "x", trash(state)!.id);
    expect(ids(state, "A")).toContain(added!.id);
    expect(trash(state)!.notes.map((n) => n.id)).toEqual(["a1"]);
  });

  test("creates a section when none is visible", () => {
    const state: AppState = { sections: [], activeSectionId: "" };
    const added = notes.addNote(state, "x");
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].title).toBe("Notes");
    expect(state.sections[0].notes).toEqual([added!]);
    expect(state.activeSectionId).toBe(state.sections[0].id);
  });
});

describe("toggleDone", () => {
  test("marks all done when any is open, then reopens all", () => {
    const state = sample();
    notes.findEntry(state, "a1")!.note.done = true;
    const first = notes.toggleDone(state, ["a1", "a2"]);
    expect(first?.done).toBe(true);
    expect(first?.changed.map((n) => n.id)).toEqual(["a2"]);
    const second = notes.toggleDone(state, ["a1", "a2"]);
    expect(second?.done).toBe(false);
    expect(second?.changed.map((n) => n.id)).toEqual(["a1", "a2"]);
  });

  test("returns null for unknown ids", () => {
    expect(notes.toggleDone(sample(), ["nope"])).toBeNull();
  });
});

describe("trash / purge / restore", () => {
  test("trashNotes moves notes into a Trash section and stamps them", () => {
    const state = sample();
    const moved = notes.trashNotes(state, ["a2", "b1"]);
    expect(moved.map((n) => n.id)).toEqual(["a2", "b1"]);
    expect(ids(state, "A")).toEqual(["a1", "a3"]);
    expect(ids(state, "B")).toEqual(["b2"]);
    expect(trash(state)!.notes.every((n) => typeof n.deletedAt === "number")).toBe(true);
  });

  test("trashing an already trashed note leaves it alone", () => {
    const state = sample();
    notes.trashNotes(state, ["a1"]);
    const stamp = trash(state)!.notes[0].deletedAt;
    expect(notes.trashNotes(state, ["a1"])).toEqual([]);
    expect(trash(state)!.notes).toHaveLength(1);
    expect(trash(state)!.notes[0].deletedAt).toBe(stamp);
  });

  test("purgeNotes removes for good", () => {
    const state = sample();
    notes.purgeNotes(state, ["a1", "b2"]);
    expect(notes.findEntry(state, "a1")).toBeNull();
    expect(notes.findEntry(state, "b2")).toBeNull();
    expect(trash(state)).toBeUndefined();
  });

  test("restoreNotes brings a trashed note back without its deleted mark", () => {
    const state = sample();
    notes.trashNotes(state, ["b1"]);
    notes.restoreNotes(state, ["b1"]);
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3", "b1"]);
    expect(notes.findEntry(state, "b1")!.note.deletedAt).toBeUndefined();
  });

  test("restoreNotes creates a section when only hidden ones remain", () => {
    const state: AppState = { sections: [section("A", ["a1"])], activeSectionId: "A" };
    notes.deleteSection(state, "A", true);
    notes.restoreNotes(state, ["a1"]);
    const visible = notes.visibleSections(state);
    expect(visible).toHaveLength(1);
    expect(visible[0].notes.map((n) => n.id)).toEqual(["a1"]);
  });

  test("archiveNotes moves notes into an Archive section", () => {
    const state = sample();
    notes.archiveNotes(state, ["a1"]);
    expect(archive(state)!.notes.map((n) => n.id)).toEqual(["a1"]);
    expect(notes.archivedNotes(state)).toHaveLength(1);
    expect(notes.visibleSections(state).map((s) => s.id)).toEqual(["A", "B"]);
  });
});

describe("undo placements", () => {
  test("a trashed note returns to its exact slot", () => {
    const state = sample();
    const snapshot = notes.snapshotPlacements(state, ["a2", "b1"]);
    notes.trashNotes(state, ["a2", "b1"]);
    const restored = notes.restorePlacements(state, snapshot);
    expect(restored).toEqual(["a2", "b1"]);
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3"]);
    expect(ids(state, "B")).toEqual(["b1", "b2"]);
    expect(notes.findEntry(state, "a2")!.note.deletedAt).toBeUndefined();
    expect(trash(state)!.notes).toHaveLength(0);
  });

  test("falls back to the first visible section when the origin is gone", () => {
    const state = sample();
    const snapshot = notes.snapshotPlacements(state, ["b1"]);
    notes.trashNotes(state, ["b1"]);
    notes.deleteSection(state, "B", true);
    notes.restorePlacements(state, snapshot);
    expect(ids(state, "A")).toContain("b1");
  });
});

describe("moving", () => {
  test("moveNotesToSection appends in display order", () => {
    const state = sample();
    notes.moveNotesToSection(state, ["a3", "a1"], "B");
    expect(ids(state, "A")).toEqual(["a2"]);
    expect(ids(state, "B")).toEqual(["b1", "b2", "a1", "a3"]);
  });

  test("placeNotesNextTo inserts before or after the target", () => {
    const before = sample();
    expect(notes.placeNotesNextTo(before, ["a3"], "a1", true)).toBe(true);
    expect(ids(before, "A")).toEqual(["a3", "a1", "a2"]);

    const after = sample();
    notes.placeNotesNextTo(after, ["a1", "a2"], "b1", false);
    expect(ids(after, "A")).toEqual(["a3"]);
    expect(ids(after, "B")).toEqual(["b1", "a1", "a2", "b2"]);
  });

  test("placeNotesNextTo refuses to drop a note onto itself", () => {
    const state = sample();
    expect(notes.placeNotesNextTo(state, ["a1", "a2"], "a2", true)).toBe(false);
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3"]);
  });

  test("shiftNotes moves within a section", () => {
    const state = sample();
    expect(notes.shiftNotes(state, ["a2"], -1)).toBe(true);
    expect(ids(state, "A")).toEqual(["a2", "a1", "a3"]);
    expect(notes.shiftNotes(state, ["a2"], 1)).toBe(true);
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3"]);
  });

  test("shiftNotes keeps a multi-selection together", () => {
    const state = sample();
    notes.shiftNotes(state, ["a2", "a3"], -1);
    expect(ids(state, "A")).toEqual(["a2", "a3", "a1"]);
  });

  test("shiftNotes hops across section edges", () => {
    const up = sample();
    notes.shiftNotes(up, ["b1"], -1);
    expect(ids(up, "A")).toEqual(["a1", "a2", "a3", "b1"]);
    expect(ids(up, "B")).toEqual(["b2"]);

    const down = sample();
    notes.shiftNotes(down, ["a3"], 1);
    expect(ids(down, "A")).toEqual(["a1", "a2"]);
    expect(ids(down, "B")).toEqual(["a3", "b1", "b2"]);
  });

  test("shiftNotes stops at the list boundaries and skips hidden sections", () => {
    const state = sample();
    notes.trashNotes(state, ["b2"]);
    expect(notes.shiftNotes(state, ["a1"], -1)).toBe(false);
    expect(notes.shiftNotes(state, ["b1"], 1)).toBe(false);
    expect(ids(state, "B")).toEqual(["b1"]);
  });
});

describe("duplicate / merge", () => {
  test("duplicateNotes inserts each copy right after its original", () => {
    const state = sample();
    const copies = notes.duplicateNotes(state, ["a1", "a3"]);
    expect(copies).toHaveLength(2);
    expect(ids(state, "A")).toEqual(["a1", copies[0].id, "a2", "a3", copies[1].id]);
    expect(copies[0].text).toBe("text a1");
    expect(new Set(ids(state, "A")).size).toBe(5);
  });

  test("mergeNotes joins into the first note in display order", () => {
    const state = sample();
    notes.findEntry(state, "a1")!.note.done = true;
    const merged = notes.mergeNotes(state, ["b1", "a1", "a3"]);
    expect(merged?.id).toBe("a1");
    expect(merged?.text).toBe("text a1\n\ntext a3\n\ntext b1");
    expect(merged?.done).toBe(false);
    expect(ids(state, "A")).toEqual(["a1", "a2"]);
    expect(ids(state, "B")).toEqual(["b2"]);
    expect(trash(state)).toBeUndefined();
  });

  test("mergeNotes needs at least two notes", () => {
    expect(notes.mergeNotes(sample(), ["a1"])).toBeNull();
  });
});

describe("sections", () => {
  test("deleteSection with notes sends them to the Trash", () => {
    const state = sample();
    notes.deleteSection(state, "B", true);
    expect(notes.findSection(state, "B")).toBeUndefined();
    expect(trash(state)!.notes.map((n) => n.id)).toEqual(["b1", "b2"]);
    expect(state.activeSectionId).toBe("A");
  });

  test("deleteSection keeping notes moves them to the first visible section", () => {
    const state = sample();
    notes.deleteSection(state, "B", false);
    expect(ids(state, "A")).toEqual(["a1", "a2", "a3", "b1", "b2"]);
  });

  test("deleteSection keeping notes of the last visible section makes a new home", () => {
    const state: AppState = { sections: [section("A", ["a1"])], activeSectionId: "A" };
    notes.deleteSection(state, "A", false);
    const visible = notes.visibleSections(state);
    expect(visible).toHaveLength(1);
    expect(visible[0].notes.map((n) => n.id)).toEqual(["a1"]);
    expect(state.activeSectionId).toBe(visible[0].id);
  });

  test("toggleAllCollapsed collapses, then expands", () => {
    const state = sample();
    state.sections[0].collapsed = true;
    notes.toggleAllCollapsed(state);
    expect(state.sections.map((s) => s.collapsed)).toEqual([true, true]);
    notes.toggleAllCollapsed(state);
    expect(state.sections.map((s) => s.collapsed)).toEqual([false, false]);
  });
});

describe("queries", () => {
  test("visibleNotes applies search, hide-completed and collapsed sections", () => {
    const state = sample();
    notes.findEntry(state, "a1")!.note.done = true;
    notes.findEntry(state, "a2")!.note.text = "Needle here";
    state.sections[1].collapsed = true;

    expect(notes.visibleNotes(state, "", false).map((n) => n.id)).toEqual(["a1", "a2", "a3"]);
    expect(notes.visibleNotes(state, "", true).map((n) => n.id)).toEqual(["a2", "a3"]);
    // a search looks inside collapsed sections too
    expect(notes.visibleNotes(state, "TEXT B", false).map((n) => n.id)).toEqual(["b1", "b2"]);
    expect(notes.visibleNotes(state, "needle", false).map((n) => n.id)).toEqual(["a2"]);
  });

  test("remainingCount and completedIds ignore hidden sections", () => {
    const state = sample();
    notes.findEntry(state, "a1")!.note.done = true;
    notes.findEntry(state, "b1")!.note.done = true;
    notes.archiveNotes(state, ["b1"]);
    notes.trashNotes(state, ["a2"]);
    expect(notes.remainingCount(state)).toBe(2); // a3, b2
    expect(notes.completedIds(state)).toEqual(["a1"]);
  });

  test("formatForCopy", () => {
    const list = [note("1", { text: "one\ntwo" }), note("2", { text: "three" })];
    expect(notes.formatForCopy(list, "plain")).toBe("one\ntwo\n\nthree");
    expect(notes.formatForCopy(list, "numbered")).toBe("1. one two\n2. three");
    expect(notes.formatForCopy(list, "markdown")).toBe("- one two\n- three");
  });
});
