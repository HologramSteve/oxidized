// Keyboard navigation and shortcuts inside the panel.

import {
  archiveNotes,
  copyNotes,
  deleteNotes,
  duplicateNotes,
  mergeNotes,
  moveNotesBy,
  navigateTo,
  openSettings,
  startEditing,
  toggleDone,
  toggleImportant,
  undo,
} from "./actions";
import { isTextField } from "./dom";
import { closeMenu, isMenuOpen } from "./menu";
import { invalidate } from "./render";
import {
  clearSelection,
  focusFirstVisible,
  moveFocus,
  selectAllVisible,
  targetIds,
} from "./selection";
import { ui } from "./ui";

function focusField(id: string): void {
  document.getElementById(id)?.focus();
}

function onKeyDown(e: KeyboardEvent): void {
  // autofill and some IMEs dispatch keydown events without a key
  if (ui.pill || !e.key) return;

  const inField = isTextField(e.target);
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && e.key === ",") {
    e.preventDefault();
    openSettings();
    return;
  }

  if (mod && !e.shiftKey && key === "z") {
    if (inField) return; // text fields keep their own undo
    e.preventDefault();
    undo();
    return;
  }

  // Esc dismisses an open menu before it does anything else
  if (e.key === "Escape" && isMenuOpen()) {
    closeMenu();
    return;
  }

  if (ui.view !== "list") {
    if (e.key === "Escape") navigateTo("list");
    return;
  }

  // global-ish shortcuts that work anywhere in the panel
  if (mod && key === "f") {
    e.preventDefault();
    focusField("search");
    return;
  }

  if (inField) return;

  if (e.key === "/") {
    e.preventDefault();
    focusField("search");
    return;
  }

  if (e.key === "Escape") {
    clearSelection();
    invalidate();
    return;
  }

  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    moveNotesBy(e.key === "ArrowUp" ? -1 : 1);
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!ui.focusedId) focusFirstVisible();
    else moveFocus(1, e.shiftKey);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    moveFocus(-1, e.shiftKey);
    return;
  }

  const ids = targetIds();
  if (ids.length === 0) {
    // typing with nothing selected: jump to composer
    if (e.key.length === 1 && !mod && !e.altKey) focusField("composer-input");
    return;
  }

  if (e.key === " ") {
    e.preventDefault();
    toggleDone(ids);
  } else if (e.key === "Enter") {
    e.preventDefault();
    startEditing(ids[0]);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteNotes(ids);
  } else if (mod && e.altKey && key === "c") {
    e.preventDefault();
    void copyNotes(ids, "numbered");
  } else if (mod && key === "c") {
    e.preventDefault();
    void copyNotes(ids, "plain");
  } else if (mod && key === "a") {
    e.preventDefault();
    selectAllVisible();
  } else if (mod && key === "m") {
    e.preventDefault();
    mergeNotes(ids);
  } else if (mod && key === "d") {
    e.preventDefault();
    duplicateNotes(ids);
  } else if (mod && key === "i") {
    e.preventDefault();
    toggleImportant(ids);
  } else if (mod && key === "e") {
    e.preventDefault();
    archiveNotes(ids);
  }
}

export function initKeyboard(): void {
  document.addEventListener("keydown", onKeyDown);
}
