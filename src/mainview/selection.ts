// Selection and keyboard focus over the visible notes.

import type { Note } from "../shared/types";
import * as notes from "./notes";
import { afterRender, invalidate } from "./render";
import { store } from "./store";
import { searchQuery, ui } from "./ui";

/** Notes the list currently shows, in display order. */
export function currentVisibleNotes(): Note[] {
  return notes.visibleNotes(store.state, searchQuery(), store.settings.hideCompleted);
}

/**
 * What a command acts on: the selection, else the focused note. Notes that
 * are no longer on screen (filtered out, collapsed, deleted) never count —
 * a command must not touch something the user can't see.
 */
export function targetIds(): string[] {
  const visible = new Set(currentVisibleNotes().map((note) => note.id));
  const picked = [...ui.selected].filter((id) => visible.has(id));
  if (picked.length > 0) return picked;
  return ui.focusedId && visible.has(ui.focusedId) ? [ui.focusedId] : [];
}

export function hasSelection(): boolean {
  return ui.selected.size > 0 || ui.focusedId !== null;
}

export function clearSelection(): void {
  ui.selected.clear();
  ui.focusedId = null;
}

export function selectOnly(id: string): void {
  ui.selected.clear();
  ui.selected.add(id);
  ui.focusedId = id;
}

/** Drop notes that left the list from the selection. */
export function deselect(ids: Iterable<string>): void {
  for (const id of ids) {
    ui.selected.delete(id);
    if (ui.focusedId === id) ui.focusedId = null;
  }
}

/** Mouse selection: plain click, Ctrl/Cmd-click (toggle), Shift-click (range). */
export function clickSelect(id: string, mods: { toggle: boolean; range: boolean }): void {
  if (mods.toggle) {
    if (ui.selected.has(id)) ui.selected.delete(id);
    else ui.selected.add(id);
    ui.focusedId = id;
  } else if (mods.range && ui.focusedId) {
    const visible = currentVisibleNotes().map((note) => note.id);
    const a = visible.indexOf(ui.focusedId);
    const b = visible.indexOf(id);
    if (a !== -1 && b !== -1) {
      ui.selected.clear();
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ui.selected.add(visible[i]);
    }
  } else if (ui.selected.size === 1 && ui.selected.has(id)) {
    // clicking the only selected note again releases the selection
    clearSelection();
  } else {
    selectOnly(id);
  }
  invalidate();
}

export function selectAllVisible(): void {
  ui.selected.clear();
  for (const note of currentVisibleNotes()) ui.selected.add(note.id);
  invalidate();
}

export function scrollFocusedIntoView(): void {
  if (!ui.focusedId) return;
  document
    .querySelector(`.card[data-id="${CSS.escape(ui.focusedId)}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

export function focusFirstVisible(): void {
  const visible = currentVisibleNotes();
  if (visible.length === 0) return;
  selectOnly(visible[0].id);
  invalidate();
  afterRender(scrollFocusedIntoView);
}

export function moveFocus(delta: number, extendSelection: boolean): void {
  const visible = currentVisibleNotes().map((note) => note.id);
  if (visible.length === 0) return;
  const current = ui.focusedId ? visible.indexOf(ui.focusedId) : -1;
  const next = visible[Math.max(0, Math.min(visible.length - 1, current + delta))];
  if (extendSelection && ui.focusedId) {
    ui.selected.add(ui.focusedId);
    ui.selected.add(next);
  } else {
    ui.selected.clear();
    ui.selected.add(next);
  }
  ui.focusedId = next;
  invalidate();
  afterRender(scrollFocusedIntoView);
}
