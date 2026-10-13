// Settings → Data: Archive and Trash (both hidden from the main list and
// managed here), where the notes are stored, and backups.

import type { Note } from "../../../shared/types";
import { deleteNotes, exportNotesFile, importNotesFile, restoreNotes } from "../../actions";
import { h } from "../../dom";
import { archivedNotes, trashedNotes } from "../../notes";
import { isDesktop, platform } from "../../platform";
import { invalidate } from "../../render";
import { env, store } from "../../store";
import { SETTINGS_PAGE_SIZE, ui } from "../../ui";
import { actionRow } from "../controls";

const FOLDER_ICON =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h4l2 2h5A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 8h16"/></svg>';

export function dataRows(): HTMLElement[] {
  return [...archiveRows(), ...trashRows(), ...storageRows()];
}

// ---------------------------------------------------------------------------
// Archive + Trash
// ---------------------------------------------------------------------------

/** Group heading with an optional count + clear-all button on the right. */
function binHeader(title: string, count: number, clearLabel: string, onClear: () => void): HTMLElement {
  const head = h("div", "set-group set-group-row");
  head.appendChild(h("span", undefined, count > 0 ? `${title} · ${count}` : title));
  if (count > 0) {
    const btn = h("button", "mini-btn danger", clearLabel);
    btn.addEventListener("click", onClear);
    head.appendChild(btn);
  }
  return head;
}

interface NoteBin {
  title: string;
  notes: Note[];
  emptyText: string;
  clearLabel: string;
  /** Clear-all and per-note delete. */
  remove(ids: string[]): void;
  deleteLabel: string;
  visibleCount: number;
  showMore(count: number): void;
}

function binRows(bin: NoteBin): HTMLElement[] {
  const { notes } = bin;
  const rows: HTMLElement[] = [
    binHeader(bin.title, notes.length, bin.clearLabel, () => {
      bin.remove(notes.map((note) => note.id));
      invalidate("settings");
    }),
  ];
  if (notes.length === 0) {
    rows.push(h("div", "set-note", bin.emptyText));
    return rows;
  }

  for (const note of notes.slice(0, bin.visibleCount)) {
    const row = h("div", "set-row");
    row.appendChild(h("div", "set-label ellipsis", note.text.replace(/\n+/g, " ")));

    const restore = h("button", "mini-btn", "Restore");
    restore.addEventListener("click", () => restoreNotes([note.id]));
    row.appendChild(restore);

    const del = h("button", "mini-btn danger", bin.deleteLabel);
    del.addEventListener("click", () => {
      bin.remove([note.id]);
      invalidate("settings");
    });
    row.appendChild(del);
    rows.push(row);
  }

  const remaining = notes.length - bin.visibleCount;
  if (remaining > 0) {
    const moreWrap = h("div", "load-more-wrap");
    const more = h(
      "button",
      "mini-btn load-more",
      `Load more · ${Math.min(SETTINGS_PAGE_SIZE, remaining)}`
    );
    more.title = `${remaining} more ${remaining === 1 ? "item" : "items"}`;
    more.addEventListener("click", () => {
      bin.showMore(Math.min(bin.visibleCount + SETTINGS_PAGE_SIZE, notes.length));
      invalidate("settings");
    });
    moreWrap.appendChild(more);
    rows.push(moreWrap);
  }
  return rows;
}

function archiveRows(): HTMLElement[] {
  return binRows({
    title: "Archive",
    notes: archivedNotes(store.state),
    emptyText: "Empty. Right-click a note → Archive to stash it here.",
    clearLabel: "Clear archive",
    // "clear" archives → trash, so nothing is lost by accident
    remove: (ids) => deleteNotes(ids, { animate: false }),
    deleteLabel: "Delete",
    visibleCount: ui.archiveVisibleCount,
    showMore: (count) => (ui.archiveVisibleCount = count),
  });
}

function trashRows(): HTMLElement[] {
  return binRows({
    title: "Trash",
    notes: trashedNotes(store.state),
    emptyText: "Empty. Deleted notes end up here so you can restore them.",
    clearLabel: "Empty trash",
    remove: (ids) => deleteNotes(ids, { animate: false, purge: true }),
    deleteLabel: "Delete forever",
    visibleCount: ui.trashVisibleCount,
    showMore: (count) => (ui.trashVisibleCount = count),
  });
}

// ---------------------------------------------------------------------------
// Storage + backups
// ---------------------------------------------------------------------------

function storageRows(): HTMLElement[] {
  const card = h("div", "storage-card");
  const icon = h("div", "storage-icon");
  icon.innerHTML = FOLDER_ICON;
  card.appendChild(icon);

  const body = h("div", "storage-body");
  const titleRow = h("div", "storage-title-row");
  titleRow.appendChild(h("div", "storage-title", isDesktop ? "Local data folder" : "Browser storage"));
  titleRow.appendChild(h("span", "storage-badge", "LOCAL ONLY"));
  body.appendChild(titleRow);
  body.appendChild(
    h(
      "div",
      "storage-sub",
      isDesktop ? "Notes and settings stay on this device" : "Notes and settings stay in this browser"
    )
  );
  body.appendChild(h("code", "storage-path", env.dataLocation));
  card.appendChild(body);

  if (isDesktop) {
    const open = h("button", "mini-btn", "Open folder");
    open.classList.add("storage-action");
    open.addEventListener("click", () => platform.openDataDir());
    card.appendChild(open);
  }

  return [
    h("div", "set-group", "Storage"),
    card,
    actionRow("Export notes", "Download a JSON backup of every section", "Export", () => {
      void exportNotesFile();
    }),
    actionRow("Import notes", "Replace everything with a JSON backup", "Import", () => {
      void importNotesFile();
    }),
    h("div", "set-note", "No accounts, sync, or telemetry."),
  ];
}
