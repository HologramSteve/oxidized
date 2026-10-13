// Transient UI state (never persisted): what is selected, focused, being
// edited, which view is showing. Views read it; actions change it and then
// invalidate() so the views re-render.

import type { DisplayInfo } from "../shared/ipc";

export type View = "list" | "settings";

/** The pages of Settings, in tab order. */
export type SettingsTab = "general" | "shortcuts" | "data" | "about";

/** How many archived / trashed notes Settings shows before "Load more". */
export const SETTINGS_PAGE_SIZE = 3;

/** An in-progress text edit. The draft survives list re-renders. */
export interface EditSession {
  id: string;
  draft: string;
}

export const ui = {
  view: "list" as View,
  settingsTab: "general" as SettingsTab,
  /** Raw search box content; use searchQuery() for matching. */
  query: "",
  selected: new Set<string>(),
  focusedId: null as string | null,
  /** Note being edited in place. */
  editing: null as EditSession | null,
  /** Section whose title is being renamed. */
  renaming: null as EditSession | null,
  /** Notes shown in full instead of clamped to four lines. */
  expanded: new Set<string>(),
  /** Minimized to the pill. */
  pill: false,
  archiveVisibleCount: SETTINGS_PAGE_SIZE,
  trashVisibleCount: SETTINGS_PAGE_SIZE,
  /** Connected displays, for the snap-display picker (desktop). */
  displays: [] as DisplayInfo[],
  // One-shot animations, consumed by the next list render:
  /** cards that should play their entrance */
  animEnter: new Set<string>(),
  /** cards whose check should pop */
  animPop: new Set<string>(),
  // done-state just flipped: render the old state, then toggle a frame later
  // so the checkbox fill / checkmark draw / strikethrough transitions run
  animCheck: new Set<string>(),
};

/** The active search text, normalized. Empty means "no search". */
export function searchQuery(): string {
  return ui.query.trim();
}

export function resetSettingsPagination(): void {
  ui.archiveVisibleCount = SETTINGS_PAGE_SIZE;
  ui.trashVisibleCount = SETTINGS_PAGE_SIZE;
}
