// The three context menus: note, section, and the app ("⋯") menu.

import type { Section } from "../shared/types";
import { displayAccelerator } from "./accelerator";
import {
  addSection,
  archiveNotes,
  canUndo,
  clearCompleted,
  copyNotes,
  deleteNotes,
  deleteSection,
  duplicateNotes,
  mergeNotes,
  moveNotes,
  openSettings,
  setCaptureTarget,
  setSectionColor,
  startEditing,
  startRename,
  toggleAllCollapsed,
  toggleDone,
  toggleExpanded,
  toggleHideCompleted,
  toggleImportant,
  toggleSectionCollapsed,
  undo,
} from "./actions";
import { showMenu, type MenuItem } from "./menu";
import * as notes from "./notes";
import { isDesktop, platform } from "./platform";
import { invalidate } from "./render";
import { targetIds } from "./selection";
import { flushState, store } from "./store";
import { ui } from "./ui";

export function showNoteMenu(x: number, y: number): void {
  const ids = targetIds();
  if (ids.length === 0) return;
  const multi = ids.length > 1;
  const entries = notes.findEntries(store.state, ids);
  const first = notes.findEntry(store.state, ids[0]);
  const items: MenuItem[] = [
    { label: multi ? `Copy ${ids.length} notes` : "Copy", kbd: "Ctrl C", action: () => void copyNotes(ids, "plain") },
    { label: "Copy as List", kbd: "Ctrl Alt C", action: () => void copyNotes(ids, "numbered") },
    { label: "Copy as Markdown", action: () => void copyNotes(ids, "markdown") },
    { sep: true },
    {
      label: entries.every((entry) => entry.note.done) ? "Mark as Not Done" : "Mark as Done",
      kbd: "Space",
      action: () => toggleDone(ids),
    },
    {
      label: entries.every((entry) => entry.note.important) ? "Remove Important" : "Mark as Important",
      kbd: "Ctrl I",
      action: () => toggleImportant(ids),
    },
    {
      label: ui.expanded.has(ids[0]) ? "Collapse" : "Expand",
      action: () => toggleExpanded(ids),
    },
    { label: "Edit", kbd: "Enter", disabled: multi, action: () => startEditing(ids[0]) },
    { label: multi ? `Duplicate ${ids.length} notes` : "Duplicate", kbd: "Ctrl D", action: () => duplicateNotes(ids) },
    { label: "Merge Notes", disabled: !multi, action: () => mergeNotes(ids) },
    { label: multi ? `Archive ${ids.length} notes` : "Archive", kbd: "Ctrl E", action: () => archiveNotes(ids) },
    { sep: true },
    {
      label: "Move to…",
      children: notes.visibleSections(store.state).map<MenuItem>((section) => ({
        label: section.title,
        disabled: !multi && first?.section.id === section.id,
        action: () => moveNotes(ids, section.id),
      })),
    },
    { sep: true },
    { label: multi ? `Delete ${ids.length} notes` : "Delete", kbd: "Del", danger: true, action: () => deleteNotes(ids) },
  ];
  showMenu(x, y, items);
}

// light pastel palette — used as a soft chip behind the section title, so it
// stays readable (dark text on pastel) in both light and dark themes
const SECTION_COLORS: { name: string; value: string }[] = [
  { name: "Default", value: "" },
  { name: "Blush", value: "#ffb3ba" },
  { name: "Peach", value: "#ffd6a5" },
  { name: "Lemon", value: "#fdffb6" },
  { name: "Mint", value: "#caffbf" },
  { name: "Sky", value: "#9bf6ff" },
  { name: "Periwinkle", value: "#a0c4ff" },
  { name: "Lavender", value: "#bdb2ff" },
  { name: "Rose", value: "#ffc6ff" },
];

export function showSectionMenu(x: number, y: number, section: Section): void {
  const { state } = store;
  const items: MenuItem[] = [
    {
      label: "Set as capture target",
      disabled: state.activeSectionId === section.id,
      action: () => setCaptureTarget(section.id),
    },
    { label: "Rename", action: () => startRename(section) },
    {
      label: section.collapsed ? "Expand" : "Collapse",
      action: () => {
        toggleSectionCollapsed(section);
        invalidate();
      },
    },
    {
      label: "Color",
      children: SECTION_COLORS.map<MenuItem>((color) => ({
        label: color.name,
        swatch: color.value || undefined,
        checked: (section.color ?? "") === color.value,
        action: () => setSectionColor(section, color.value),
      })),
    },
    { sep: true },
    {
      label: "Delete section (keep notes)",
      disabled: state.sections.length < 2 && section.notes.length > 0,
      action: () => deleteSection(section.id, false),
    },
    {
      label: "Delete section and notes",
      danger: true,
      action: () => deleteSection(section.id, true),
    },
  ];
  showMenu(x, y, items);
}

export function showAppMenu(x: number, y: number): void {
  const { settings, state } = store;
  const sections = notes.visibleSections(state);
  const allCollapsed = sections.length > 0 && sections.every((section) => section.collapsed);
  const items: MenuItem[] = [
    { label: "New section", action: () => addSection() },
    {
      label: allCollapsed ? "Expand all" : "Collapse all",
      disabled: sections.length === 0,
      action: () => toggleAllCollapsed(),
    },
    { sep: true },
    { label: "Hide completed", checked: settings.hideCompleted, action: () => toggleHideCompleted() },
    {
      label: "Clear completed",
      danger: true,
      disabled: notes.completedIds(state).length === 0,
      action: () => clearCompleted(),
    },
    { label: "Undo", kbd: "Ctrl+Z", disabled: !canUndo(), action: () => undo() },
    { sep: true },
    { label: "Archive & Trash…", action: () => openSettings("data") },
    { label: "Settings…", kbd: "Ctrl+,", action: () => openSettings() },
  ];
  if (isDesktop) {
    const toggleKeys = settings.shortcuts.togglePanel;
    items.push(
      { sep: true },
      {
        label: "Hide panel",
        kbd: toggleKeys ? displayAccelerator(toggleKeys).replace(/\+/g, " ") : undefined,
        action: () => {
          void flushState();
          platform.hide();
        },
      },
      {
        label: "Quit Oxide",
        danger: true,
        // make sure the last edit is on its way to disk before the app goes
        action: () => void flushState().finally(() => platform.quit()),
      }
    );
  }
  showMenu(x, y, items);
}
