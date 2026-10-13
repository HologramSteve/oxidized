import { describe, expect, test } from "bun:test";
import { mergeSettings } from "../src/shared/settings";
import { isHidden, isReservedTitle, parseAppState, parseStateJson } from "../src/shared/state";
import { DEFAULT_SETTINGS } from "../src/shared/types";

describe("mergeSettings", () => {
  test("returns the defaults for junk input", () => {
    for (const junk of [null, undefined, 42, "x", [], { shortcuts: 7 }]) {
      expect(mergeSettings(junk)).toEqual(DEFAULT_SETTINGS);
    }
  });

  test("never hands out the shared default objects", () => {
    const a = mergeSettings(null);
    a.shortcuts.togglePanel = "changed";
    a.window!.width = 1;
    expect(DEFAULT_SETTINGS.shortcuts.togglePanel).toBe("CommandOrControl+Shift+Space");
    expect(mergeSettings(null).window).toEqual(DEFAULT_SETTINGS.window);
  });

  test("keeps valid values", () => {
    const merged = mergeSettings({
      theme: "dark",
      sounds: false,
      hideCompleted: true,
      snapPosition: "top-right",
      snapDisplay: 12345,
      shortcuts: { togglePanel: "", doubleTapKey: "alt", doubleShiftWindowMs: 650 },
      window: { width: 400, height: 500, x: -10, y: 20 },
    });
    expect(merged.theme).toBe("dark");
    expect(merged.sounds).toBe(false);
    expect(merged.hideCompleted).toBe(true);
    expect(merged.snapPosition).toBe("top-right");
    expect(merged.snapDisplay).toBe(12345);
    expect(merged.shortcuts.togglePanel).toBe(""); // empty = no shortcut
    expect(merged.shortcuts.doubleTapKey).toBe("alt");
    expect(merged.shortcuts.doubleShiftWindowMs).toBe(650);
    expect(merged.shortcuts.captureClipboard).toBe(DEFAULT_SETTINGS.shortcuts.captureClipboard);
    expect(merged.window).toEqual({ width: 400, height: 500, x: -10, y: 20 });
  });

  test("replaces values of the wrong type or out of range", () => {
    const merged = mergeSettings({
      theme: "neon",
      sounds: "yes",
      alwaysOnTop: 0,
      snapPosition: "center",
      snapDisplay: 1.5,
      shortcuts: { togglePanel: 5, doubleTapKey: "meta", doubleShiftWindowMs: 5 },
      window: { width: "wide", height: 500 },
      captureScreenshot: true,
    });
    expect(merged.theme).toBe("system");
    expect(merged.sounds).toBe(true);
    expect(merged.alwaysOnTop).toBe(true);
    expect(merged.snapPosition).toBe("left");
    expect(merged.snapDisplay).toBe("primary");
    expect(merged.shortcuts.togglePanel).toBe(DEFAULT_SETTINGS.shortcuts.togglePanel);
    expect(merged.shortcuts.doubleTapKey).toBe("shift");
    expect(merged.shortcuts.doubleShiftWindowMs).toBe(150);
    expect(merged.window).toEqual(DEFAULT_SETTINGS.window);
    expect("captureScreenshot" in merged).toBe(false);
  });

  test("drops a window position that is only half there", () => {
    expect(mergeSettings({ window: { width: 300, height: 400, x: 5 } }).window).toEqual({
      width: 300,
      height: 400,
    });
  });
});

describe("parseAppState", () => {
  const valid = () => ({
    sections: [
      {
        id: "s1",
        title: "Inbox",
        collapsed: false,
        color: "#ffb3ba",
        notes: [{ id: "n1", text: "hi", done: true, createdAt: 5, important: true }],
      },
    ],
    activeSectionId: "s1",
  });

  test("round-trips a well-formed state", () => {
    expect(parseAppState(valid())).toEqual(valid());
  });

  test("rejects things that aren't a state", () => {
    for (const junk of [null, 1, "x", [], {}, { sections: "nope" }]) {
      expect(parseAppState(junk)).toBeNull();
    }
    expect(parseStateJson("{ not json")).toBeNull();
    expect(parseStateJson("")).toBeNull();
  });

  test("drops malformed notes and sections instead of failing the load", () => {
    const state = parseAppState({
      sections: [
        { id: "s1", title: "Inbox", notes: [{ id: "n1", text: "keep" }, { id: "n2" }, null, "x"] },
        { id: "s2", title: "No notes array" },
        7,
      ],
      activeSectionId: "s1",
    });
    expect(state?.sections).toHaveLength(1);
    expect(state?.sections[0].notes.map((n) => n.text)).toEqual(["keep"]);
    expect(state?.sections[0].notes[0].done).toBe(false);
    expect(typeof state?.sections[0].notes[0].createdAt).toBe("number");
  });

  test("strips unknown fields and invalid colors", () => {
    const raw = valid();
    Object.assign(raw.sections[0], { color: "url(evil)" });
    Object.assign(raw.sections[0].notes[0], { screenshot: "data:..." });
    const state = parseAppState(raw)!;
    expect(state.sections[0].color).toBeUndefined();
    expect("screenshot" in state.sections[0].notes[0]).toBe(false);
  });

  test("repairs missing and duplicate ids", () => {
    const state = parseAppState({
      sections: [
        { id: "s", title: "A", notes: [{ id: "n", text: "1" }, { id: "n", text: "2" }, { text: "3" }] },
        { id: "s", title: "B", notes: [] },
      ],
    })!;
    const noteIds = state.sections[0].notes.map((n) => n.id);
    expect(new Set(noteIds).size).toBe(3);
    expect(noteIds[0]).toBe("n");
    expect(state.sections[0].id).not.toBe(state.sections[1].id);
  });

  test("points the capture target at a visible section", () => {
    const state = parseAppState({
      sections: [
        { id: "t", title: "Trash", notes: [] },
        { id: "a", title: "Real", notes: [] },
      ],
      activeSectionId: "t",
    })!;
    expect(state.activeSectionId).toBe("a");
    expect(parseAppState({ sections: [], activeSectionId: "gone" })!.activeSectionId).toBe("");
  });

  test("rescues notes stranded in the Trash without a deleted mark", () => {
    const state = parseAppState({
      sections: [
        { id: "a", title: "Real", notes: [] },
        {
          id: "t",
          title: " trash ",
          notes: [
            { id: "gone", text: "deleted", deletedAt: 9 },
            { id: "lost", text: "never deleted" },
          ],
        },
      ],
      activeSectionId: "a",
    })!;
    expect(state.sections[0].notes.map((n) => n.id)).toEqual(["lost"]);
    expect(state.sections[1].notes.map((n) => n.id)).toEqual(["gone"]);
  });
});

describe("hidden sections", () => {
  test("are recognized by title, case- and space-insensitively", () => {
    const sec = (title: string) => ({ id: "x", title, collapsed: false, notes: [] });
    expect(isHidden(sec("Archive"))).toBe(true);
    expect(isHidden(sec("  TRASH "))).toBe(true);
    expect(isHidden(sec("Trash can"))).toBe(false);
    expect(isReservedTitle("archive ")).toBe(true);
    expect(isReservedTitle("Ideas")).toBe(false);
  });
});
