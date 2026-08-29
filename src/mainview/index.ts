// Oxide — floating, keyboard-first scratchpad for scattered AI work.
// Runs both as a plain website and inside the Electron window.

import {
  DEFAULT_WINDOW,
  MIN_WINDOW,
  mergeSettings,
  type AppState,
  type Note,
  type OxideSettings,
  type Section,
} from "../shared/types";
import type { CapturePayload, DisplayInfo, SaveSettingsResult } from "../shared/ipc";
import { setSoundsEnabled, sounds } from "./sounds";
import { LOGO_DARK, LOGO_LIGHT } from "./logo";

// ---------------------------------------------------------------------------
// Platform adapter: Electron preload API (window.oxide) on desktop,
// localStorage in the browser
// ---------------------------------------------------------------------------

const isDesktop = !!window.oxide;
const LS_KEY = "oxide-state-v1";
const SETTINGS_LS_KEY = "oxide-settings-v1";

interface PlatformBridge {
  load(): Promise<string | null>;
  save(json: string): void;
  copy(text: string): Promise<boolean>;
  hide(): void;
  quit(): void;
  setPin(value: boolean): void;
  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<SaveSettingsResult | null>;
  setWindowSize(width: number, height: number): void;
  pillShrink(width: number, height: number): void;
  pillRestore(): void;
  menuGrow(width: number, height: number): void;
  menuRestore(): void;
  openExternal(url: string): void;
  openDataDir(): void;
  windowDragStart(): void;
  windowDragEnd(): void;
  windowResizeStart(): void;
  windowResizeEnd(): void;
  debug(text: string): void;
  exportNotes(json: string): Promise<boolean>;
  importNotes(): Promise<string | null>;
  listDisplays(): Promise<DisplayInfo[]>;
}

let bridge: PlatformBridge = {
  async load() {
    return localStorage.getItem(LS_KEY);
  },
  save(json) {
    localStorage.setItem(LS_KEY, json);
  },
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  },
  hide() {},
  quit() {},
  setPin() {},
  async loadSettings() {
    return localStorage.getItem(SETTINGS_LS_KEY);
  },
  async saveSettings(json) {
    localStorage.setItem(SETTINGS_LS_KEY, json);
    return { togglePanelOk: true, captureClipboardOk: true, snapWindowOk: true };
  },
  setWindowSize() {},
  pillShrink() {},
  pillRestore() {},
  menuGrow() {},
  menuRestore() {},
  openExternal(url) {
    window.open(url, "_blank", "noopener");
  },
  openDataDir() {},
  windowDragStart() {},
  windowDragEnd() {},
  windowResizeStart() {},
  windowResizeEnd() {},
  debug(text) {
    console.log("[oxide]", text);
  },
  async exportNotes(json) {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oxide-notes-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  },
  async importNotes() {
    return new Promise<string | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        resolve(file ? await file.text() : null);
      });
      input.click();
    });
  },
  async listDisplays() {
    return [];
  },
};

function initDesktopBridge() {
  const oxide = window.oxide!;
  bridge = {
    load: () => oxide.loadState(),
    save: (json) => {
      oxide.saveState(json).catch((err: unknown) => {
        console.error("saveState failed", err);
      });
    },
    copy: (text) => oxide.copyText(text),
    hide: () => oxide.hideWindow(),
    quit: () => oxide.quitApp(),
    setPin: (value) => oxide.setAlwaysOnTop(value),
    loadSettings: () => oxide.loadSettings(),
    saveSettings: (json) => oxide.saveSettings(json),
    setWindowSize: (width, height) => oxide.setWindowSize(width, height),
    pillShrink: (width, height) => oxide.pillShrink(width, height),
    pillRestore: () => oxide.pillRestore(),
    menuGrow: (width, height) => oxide.menuGrow(width, height),
    menuRestore: () => oxide.menuRestore(),
    openExternal: (url) => oxide.openExternal(url),
    openDataDir: () => oxide.openDataDir(),
    windowDragStart: () => oxide.windowDragStart(),
    windowDragEnd: () => oxide.windowDragEnd(),
    windowResizeStart: () => oxide.windowResizeStart(),
    windowResizeEnd: () => oxide.windowResizeEnd(),
    debug: (text) => oxide.debug(text),
    exportNotes: (json) => oxide.exportNotes(json),
    importNotes: () => oxide.importNotes(),
    listDisplays: () => oxide.listDisplays(),
  };
  oxide.onCapture(({ text }: CapturePayload) => {
    addNote(text, state.activeSectionId);
    sounds.capture();
    if (pillMode) {
      if (settings.expandOnCapture) expandFromPill();
      else flashPill();
    }
    toast("Captured");
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: AppState = { sections: [], activeSectionId: "" };

// UI state (not persisted)
const selected = new Set<string>();
let focusedId: string | null = null;
let editingId: string | null = null;
let renamingSectionId: string | null = null;
let query = "";
let pinned = true;
let view: "list" | "settings" | "info" = "list";
let pillMode = false;
let settings: OxideSettings = mergeSettings(null);
const SETTINGS_PAGE_SIZE = 3;
let archiveVisibleCount = SETTINGS_PAGE_SIZE;
let trashVisibleCount = SETTINGS_PAGE_SIZE;
// notes to animate on next render (consumed once)
const animNew = new Set<string>();
const animPop = new Set<string>();
// done-state just flipped: render the old state, then toggle a frame later so
// the checkbox fill / checkmark draw / strikethrough transitions actually run
const animCheck = new Set<string>();

const uid = () => crypto.randomUUID();

function resetSettingsPagination() {
  archiveVisibleCount = SETTINGS_PAGE_SIZE;
  trashVisibleCount = SETTINGS_PAGE_SIZE;
}

function navigateTo(next: "list" | "settings" | "info") {
  if (view === "settings" && next !== "settings") resetSettingsPagination();
  view = next;
  render();
  if (next === "settings") {
    void refreshSnapDisplays().then(() => {
      if (view === "settings") render();
    });
  }
}

function seedState(): AppState {
  const welcome: Section = {
    id: uid(),
    title: "Welcome",
    collapsed: false,
    notes: [
      {
        id: uid(),
        text: "**This is Oxide** — a floating scratchpad for AI-scattered work. Type below to stage prompts, check them off as you go.",
        done: false,
        createdAt: Date.now(),
      },
      {
        id: uid(),
        text: "**Keyboard first:** arrows to navigate, `Space` marks done, `Enter` edits, `Ctrl+C` copies, `Ctrl+Alt+C` copies selection as a numbered list.",
        done: false,
        createdAt: Date.now(),
      },
      {
        id: uid(),
        text: "Right-click a card for *Copy as List*, *Merge Notes*, *Move to…* and more.",
        done: false,
        createdAt: Date.now(),
      },
      {
        id: uid(),
        text: "On desktop: `Ctrl+Shift+C` captures your clipboard as a note from anywhere, `Ctrl+Shift+Space` toggles this panel.",
        done: false,
        createdAt: Date.now(),
      },
    ],
  };
  const prompts: Section = {
    id: uid(),
    title: "Prompt queue",
    collapsed: false,
    notes: [],
  };
  return { sections: [welcome, prompts], activeSectionId: prompts.id };
}

function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as AppState;
  if (!Array.isArray(s.sections)) return null;
  for (const sec of s.sections) {
    if (typeof sec.id !== "string" || !Array.isArray(sec.notes)) return null;
    sec.collapsed = !!sec.collapsed;
    for (const note of sec.notes) {
      delete (note as { screenshot?: string }).screenshot;
    }
  }
  // an old bug could land new notes in the hidden Trash section — anything
  // there without a deletedAt was never deleted, so pull it back out
  const rescueTarget = s.sections.find((sec) => !isHidden(sec));
  if (rescueTarget) {
    for (const sec of s.sections) {
      if (!isTrash(sec)) continue;
      const stranded = sec.notes.filter((n) => !n.deletedAt);
      if (stranded.length > 0) {
        sec.notes = sec.notes.filter((n) => n.deletedAt);
        rescueTarget.notes.push(...stranded);
      }
    }
  }
  const active = s.sections.find((sec) => sec.id === s.activeSectionId);
  if (!active || isHidden(active)) {
    s.activeSectionId = s.sections.find((sec) => !isHidden(sec))?.id ?? "";
  }
  return s;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    bridge.save(JSON.stringify(state));
  }, 350);
}

// ---------------------------------------------------------------------------
// State operations
// ---------------------------------------------------------------------------

function allNotes(): { note: Note; section: Section }[] {
  const out: { note: Note; section: Section }[] = [];
  for (const section of state.sections) {
    for (const note of section.notes) out.push({ note, section });
  }
  return out;
}

function findNote(id: string): { note: Note; section: Section } | null {
  for (const section of state.sections) {
    for (const note of section.notes) {
      if (note.id === id) return { note, section };
    }
  }
  return null;
}

function findNotes(ids: string[]): { note: Note; section: Section }[] {
  const want = new Set(ids);
  if (want.size === 0) return [];
  const out: { note: Note; section: Section }[] = [];
  for (const section of state.sections) {
    for (const note of section.notes) {
      if (want.has(note.id)) out.push({ note, section });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Undo (delete / archive). Soft-moves are reversible; purges are not.
// ---------------------------------------------------------------------------
interface UndoPlacement {
  note: Note;
  sectionId: string;
  index: number;
}

const UNDO_LIMIT = 20;
const undoStack: UndoPlacement[][] = [];

function snapshotPlacements(ids: string[]): UndoPlacement[] {
  const want = new Set(ids);
  const out: UndoPlacement[] = [];
  for (const section of state.sections) {
    section.notes.forEach((note, index) => {
      if (want.has(note.id)) out.push({ note: { ...note }, sectionId: section.id, index });
    });
  }
  return out;
}

function pushUndo(ids: string[]) {
  const snap = snapshotPlacements(ids);
  if (snap.length === 0) return;
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undoLast() {
  const snap = undoStack.pop();
  if (!snap) {
    toast("Nothing to undo");
    return;
  }
  const want = new Set(snap.map((p) => p.note.id));
  for (const section of state.sections) {
    section.notes = section.notes.filter((n) => !want.has(n.id));
  }
  for (const item of snap) {
    const note: Note = { ...item.note };
    delete note.deletedAt;
    const dest =
      state.sections.find((s) => s.id === item.sectionId) ??
      state.sections.find((s) => !isHidden(s));
    if (!dest) continue;
    const idx = Math.max(0, Math.min(item.index, dest.notes.length));
    dest.notes.splice(idx, 0, note);
    animNew.add(note.id);
  }
  persist();
  if (view === "list") renderListOnly();
  else render();
  sounds.pop();
  toast("Undone");
}

function matchesQuery(note: Note): boolean {
  if (settings.hideCompleted && note.done) return false;
  if (!query) return true;
  return note.text.toLowerCase().includes(query.toLowerCase());
}

/** Notes currently visible (search-filtered, sections expanded), in display order. */
function visibleNotes(): Note[] {
  const out: Note[] = [];
  for (const section of state.sections) {
    if (isHidden(section)) continue;
    if (section.collapsed && !query) continue;
    for (const note of section.notes) {
      if (matchesQuery(note)) out.push(note);
    }
  }
  return out;
}

function addNote(text: string, sectionId?: string): Note {
  const trimmed = text.trim();
  // never capture into Trash/Archive — if the target is hidden or gone,
  // fall back to the first visible section
  const target = state.sections.find((s) => s.id === sectionId);
  const section =
    target && !isHidden(target) ? target : state.sections.find((s) => !isHidden(s));
  if (!section) {
    const created: Section = { id: uid(), title: "Notes", collapsed: false, notes: [] };
    state.sections.push(created);
    state.activeSectionId = created.id;
    return addNote(text, created.id);
  }
  const note: Note = { id: uid(), text: trimmed, done: false, createdAt: Date.now() };
  section.notes.push(note);
  animNew.add(note.id);
  persist();
  renderListOnly();
  return note;
}

function targetIds(): string[] {
  if (selected.size > 0) return [...selected];
  return focusedId ? [focusedId] : [];
}

function toggleDone(ids: string[]) {
  const entries = findNotes(ids);
  if (entries.length === 0) return;
  const markDone = entries.some((e) => !e.note.done);
  for (const e of entries) {
    if (e.note.done !== markDone) {
      e.note.done = markDone;
      animCheck.add(e.note.id);
    }
  }
  if (markDone) sounds.check();
  else sounds.uncheck();
  persist();
  renderListOnly();
}

function deleteNotes(
  ids: string[],
  opts: { animate?: boolean; sound?: boolean; purge?: boolean } = {}
) {
  const { animate = true, sound = true, purge = false } = opts;

  const doRemove = () => {
    const want = new Set(ids);
    if (!purge) pushUndo(ids);
    if (purge) {
      for (const section of state.sections) {
        section.notes = section.notes.filter((n) => !want.has(n.id));
      }
    } else {
      // soft delete: move into the hidden Trash section
      const trash = trashSection();
      const moving: Note[] = [];
      for (const section of state.sections) {
        if (section === trash) continue;
        const stay: Note[] = [];
        for (const n of section.notes) {
          if (want.has(n.id)) moving.push(n);
          else stay.push(n);
        }
        section.notes = stay;
      }
      for (const n of moving) n.deletedAt = Date.now();
      trash.notes.push(...moving);
    }
    for (const id of ids) selected.delete(id);
    if (focusedId && want.has(focusedId)) focusedId = null;
    if (sound) sounds.remove();
    persist();
    renderListOnly();
  };

  if (animate && allowMotion()) {
    const els = ids
      .map((id) => document.querySelector(`.card[data-id="${CSS.escape(id)}"]`))
      .filter(Boolean) as HTMLElement[];
    if (els.length > 0) {
      for (const el of els) el.classList.add("anim-out");
      setTimeout(doRemove, 150);
      return;
    }
  }
  doRemove();
}

function toggleImportant(ids: string[]) {
  const entries = findNotes(ids);
  if (entries.length === 0) return;
  const markImportant = entries.some((e) => !e.note.important);
  for (const e of entries) {
    if (markImportant) e.note.important = true;
    else delete e.note.important;
    animPop.add(e.note.id);
  }
  sounds.pop();
  persist();
  renderListOnly();
  toast(markImportant ? "Marked important" : "Importance removed");
}

function duplicateNotes(ids: string[]) {
  const want = new Set(ids);
  const copies: Note[] = [];
  for (const section of state.sections) {
    for (let i = section.notes.length - 1; i >= 0; i--) {
      const n = section.notes[i];
      if (!want.has(n.id)) continue;
      const copy: Note = { ...n, id: uid(), createdAt: Date.now() };
      section.notes.splice(i + 1, 0, copy);
      copies.push(copy);
      animNew.add(copy.id);
    }
  }
  if (copies.length === 0) return;
  selected.clear();
  for (const c of copies) selected.add(c.id);
  focusedId = copies[0].id;
  sounds.pop();
  persist();
  renderListOnly();
  toast(copies.length > 1 ? `Duplicated ${copies.length} notes` : "Duplicated");
}

function mergeNotes(ids: string[]) {
  if (ids.length < 2) return;
  // keep display order
  const want = new Set(ids);
  const ordered = allNotes().filter((e) => want.has(e.note.id));
  const first = ordered[0];
  if (!first) return;
  first.note.text = ordered.map((e) => e.note.text).join("\n\n");
  first.note.done = false;
  // purge: their text lives on inside the merged note, no need to trash them
  deleteNotes(ordered.slice(1).map((e) => e.note.id), { animate: false, sound: false, purge: true });
  selected.clear();
  selected.add(first.note.id);
  focusedId = first.note.id;
  animPop.add(first.note.id);
  sounds.pop();
  persist();
  renderListOnly();
  toast("Merged");
}

/** Shift the selected notes one slot up or down, hopping section edges. */
function moveNotesBy(delta: -1 | 1) {
  const ids = targetIds();
  if (ids.length === 0) return;
  const want = new Set(ids);
  const sections = state.sections.filter((s) => !isHidden(s));
  let moved = false;

  if (delta === -1) {
    for (let si = 0; si < sections.length; si++) {
      const notes = sections[si].notes;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!want.has(n.id)) continue;
        if (i > 0 && !want.has(notes[i - 1].id)) {
          notes.splice(i, 1);
          notes.splice(i - 1, 0, n);
          moved = true;
        } else if (i === 0 && si > 0) {
          notes.splice(i, 1);
          sections[si - 1].notes.push(n);
          i--; // the list shifted under us
          moved = true;
        }
      }
    }
  } else {
    for (let si = sections.length - 1; si >= 0; si--) {
      const notes = sections[si].notes;
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        if (!want.has(n.id)) continue;
        if (i < notes.length - 1 && !want.has(notes[i + 1].id)) {
          notes.splice(i, 1);
          notes.splice(i + 1, 0, n);
          moved = true;
        } else if (i === notes.length - 1 && si < sections.length - 1) {
          notes.splice(i, 1);
          sections[si + 1].notes.unshift(n);
          moved = true;
        }
      }
    }
  }

  if (!moved) return;
  persist();
  renderListOnly();
  scrollFocusedIntoView();
}

function moveNotes(ids: string[], sectionId: string) {
  const dest = state.sections.find((s) => s.id === sectionId);
  if (!dest) return;
  const want = new Set(ids);
  const moving: Note[] = [];
  for (const section of state.sections) {
    const stay: Note[] = [];
    for (const n of section.notes) {
      if (want.has(n.id)) moving.push(n);
      else stay.push(n);
    }
    section.notes = stay;
  }
  dest.notes.push(...moving);
  persist();
  renderListOnly(); // list-only rebuild so card moves can animate
}

// The archive is a hidden section — it never shows in the main list and is
// managed from the Settings page instead.
function isArchive(section: Section): boolean {
  return section.title.trim().toLowerCase() === "archive";
}

// The trash is another hidden section: deleted notes land here instead of
// being destroyed, and can be restored / purged from Settings.
function isTrash(section: Section): boolean {
  return section.title.trim().toLowerCase() === "trash";
}

function isHidden(section: Section): boolean {
  return isArchive(section) || isTrash(section);
}

function trashSection(): Section {
  let trash = state.sections.find(isTrash);
  if (!trash) {
    trash = { id: uid(), title: "Trash", collapsed: true, notes: [] };
    state.sections.push(trash);
  }
  return trash;
}

function archiveNotes(ids: string[]) {
  let arch = state.sections.find(isArchive);
  if (!arch) {
    arch = { id: uid(), title: "Archive", collapsed: true, notes: [] };
    state.sections.push(arch);
  }
  pushUndo(ids);
  moveNotes(ids, arch.id);
  const want = new Set(ids);
  for (const id of ids) selected.delete(id);
  if (focusedId && want.has(focusedId)) focusedId = null;
  sounds.pop();
  toast("Archived");
}

function noteAsPlainText(note: Note): string {
  return note.text;
}

async function copyNotes(ids: string[], format: "plain" | "numbered" | "markdown") {
  const want = new Set(ids);
  const ordered = allNotes().filter((e) => want.has(e.note.id));
  if (ordered.length === 0) return;
  let text: string;
  if (format === "numbered") {
    text = ordered
      .map((e, i) => `${i + 1}. ${noteAsPlainText(e.note).replace(/\n+/g, " ")}`)
      .join("\n");
  } else if (format === "markdown") {
    // markdown bullet list, one item per note
    text = ordered
      .map((e) => `- ${noteAsPlainText(e.note).replace(/\n+/g, " ")}`)
      .join("\n");
  } else {
    text = ordered.map((e) => noteAsPlainText(e.note)).join("\n\n");
  }
  const ok = await bridge.copy(text);
  if (ok) sounds.copy();
  // copying as a list usually means "handed off" — optionally tick them off
  let completed = false;
  if (ok && format !== "plain" && settings.autoCompleteOnCopy !== false) {
    const undone = ordered.filter((e) => !e.note.done);
    if (undone.length > 0) {
      for (const e of undone) {
        e.note.done = true;
        animCheck.add(e.note.id);
      }
      completed = true;
      persist();
      renderListOnly();
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

function addSection(title: string): Section {
  const section: Section = { id: uid(), title: title || "New section", collapsed: false, notes: [] };
  state.sections.push(section);
  state.activeSectionId = section.id;
  persist();
  render();
  renamingSectionId = section.id;
  render();
  return section;
}

function deleteSection(sectionId: string, withNotes: boolean) {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return;
  const [removed] = state.sections.splice(idx, 1);
  if (removed.notes.length > 0) {
    if (withNotes) {
      // soft delete: the section's notes survive in the trash
      const trash = trashSection();
      for (const n of removed.notes) n.deletedAt = Date.now();
      trash.notes.push(...removed.notes);
    } else {
      const fallback = state.sections.find((s) => !isHidden(s)) ?? addSection("Notes");
      fallback.notes.push(...removed.notes);
    }
  }
  if (state.activeSectionId === sectionId) {
    state.activeSectionId = state.sections.find((s) => !isHidden(s))?.id ?? "";
  }
  persist();
  render();
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer (safe: escapes HTML first)
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mdToHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" rel="noopener">$1</a>'
  );
  html = html.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" rel="noopener">$2</a>'
  );
  html = html.replaceAll("\n", "<br>");
  return highlightHtml(html, query);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap search matches in text nodes only, so markdown tags stay intact. */
function highlightHtml(html: string, q: string): string {
  const needle = q.trim();
  if (!needle) return html;
  const re = new RegExp(escapeRegExp(escapeHtml(needle)), "gi");
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(re, '<mark class="hl">$&</mark>')))
    .join("");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const app = document.getElementById("app")!;
const expandedIds = new Set<string>();
let dragIds: string[] = [];
let dropPreview: HTMLElement | null = null;
let dropPreviewKey = "";

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function clearDropPreview() {
  dropPreview?.remove();
  dropPreview = null;
  dropPreviewKey = "";
  document
    .querySelectorAll<HTMLElement>(".drag-over-top, .drag-over-bottom, .drag-target")
    .forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom", "drag-target"));
}

function showDropPreview(cards: HTMLElement, target: HTMLElement | null, before = false) {
  if (dragIds.length === 0) return;
  const position = target?.dataset.id ?? "end";
  const key = `${position}:${before ? "before" : "after"}`;
  if (dropPreview && dropPreview.parentElement === cards && dropPreviewKey === key) return;

  clearDropPreview();
  const preview = h("div", "drop-preview");
  const marker = h("div", "drop-preview-marker");
  marker.textContent = "↓";
  preview.appendChild(marker);
  const first = dragIds[0] ? findNote(dragIds[0]) : null;
  const label =
    dragIds.length > 1
      ? `Drop ${dragIds.length} notes here`
      : first
        ? first.note.text.replace(/\s+/g, " ").trim().slice(0, 100)
        : "Drop note here";
  preview.appendChild(h("div", "drop-preview-text", label || "Drop note here"));

  if (target) {
    if (before) cards.insertBefore(preview, target);
    else if (target.nextSibling) cards.insertBefore(preview, target.nextSibling);
    else cards.appendChild(preview);
  } else {
    cards.appendChild(preview);
  }
  dropPreview = preview;
  dropPreviewKey = key;
}

function render() {
  app.textContent = "";
  const panel = h("div", "panel");
  if (pillMode) panel.classList.add("pill");

  if (view === "settings") renderSettingsView(panel);
  else if (view === "info") renderInfoView(panel);
  else renderMainView(panel);

  // pill face — shown only when minimized. The whole pill is a drag handle;
  // a click (without movement) expands it back.
  const pillFace = h("div", "pill-face" + (isDesktop ? " electrobun-webkit-app-region-drag" : ""));
  pillFace.appendChild(h("div", "pill-grip"));
  const pillLabel = h("button", "pill-label");
  pillLabel.id = "pill-label";
  pillLabel.title = "Click to expand · drag to move";
  // window-move keeps the cursor over the label, so a drag still ends in a
  // click — only expand when the mouse didn't actually travel
  let pillDownAt: { x: number; y: number } | null = null;
  pillFace.addEventListener("mousedown", (e) => {
    pillDownAt = { x: e.screenX, y: e.screenY };
  });
  pillFace.addEventListener("click", (e) => {
    if (!pillDownAt) return;
    const moved =
      Math.abs(e.screenX - pillDownAt.x) + Math.abs(e.screenY - pillDownAt.y) > 4;
    pillDownAt = null;
    if (!moved) expandFromPill();
  });
  pillFace.appendChild(pillLabel);
  panel.appendChild(pillFace);

  attachResizeGrip(panel);

  app.appendChild(panel);

  if (view === "list") renderListOnly();
  updatePillLabel();
}

function renderMainView(panel: HTMLElement) {
  // ---- top bar
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add("electrobun-webkit-app-region-drag");

  const searchwrap = h("div", "searchwrap electrobun-webkit-app-region-no-drag");
  searchwrap.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
  const searchInput = h("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search";
  searchInput.value = query;
  searchInput.id = "search";
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    renderListOnly();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      query = "";
      searchInput.value = "";
      renderListOnly();
      searchInput.blur();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      searchInput.blur();
      focusFirstVisible();
    }
    e.stopPropagation();
  });
  searchwrap.appendChild(searchInput);
  topbar.appendChild(searchwrap);

  const menuBtn = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "⋯");
  menuBtn.title = "Menu";
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // second click toggles the menu closed instead of re-popping it
    if (openMenu) {
      closeMenu();
      return;
    }
    const r = menuBtn.getBoundingClientRect();
    showAppMenu(r.left, r.bottom + 4);
  });
  topbar.appendChild(menuBtn);

  // minimize to pill — top right
  const minBtn = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "–");
  minBtn.title = "Minimize to pill";
  minBtn.addEventListener("click", () => {
    minimizeToPill();
  });
  topbar.appendChild(minBtn);

  panel.appendChild(topbar);

  // ---- list
  const list = h("div", "list");
  list.id = "list";
  panel.appendChild(list);

  // ---- composer
  const composer = h("div", "composer");
  const inner = h("div", "composer-inner");
  inner.appendChild(h("div", "check check-ghost"));
  const ta = h("textarea");
  ta.rows = 1;
  ta.placeholder = "Add a note or prompt";
  ta.id = "composer-input";
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  });
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = ta.value.trim();
      if (text) {
        addNote(text, state.activeSectionId);
        sounds.pop();
        ta.value = "";
        ta.style.height = "auto";
        ta.focus();
      }
    }
    if (e.key === "Escape") ta.blur();
  });
  inner.appendChild(ta);
  composer.appendChild(inner);
  panel.appendChild(composer);
}

/** Positions of every visible card, for FLIP move animations. */
function captureCardRects(): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  document.querySelectorAll<HTMLElement>(".card[data-id]").forEach((el) => {
    if (el.classList.contains("anim-out")) return;
    rects.set(el.dataset.id!, el.getBoundingClientRect());
  });
  return rects;
}

/** Slide cards from their old position to the new one (drag, move, delete-shift). */
function playCardMoves(prev: Map<string, DOMRect>) {
  if (prev.size === 0 || !allowMotion()) return;
  document.querySelectorAll<HTMLElement>(".card[data-id]").forEach((el) => {
    if (el.classList.contains("anim-in")) return; // brand new, has its own entrance
    const old = prev.get(el.dataset.id!);
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    // glide past the target a touch and settle back, instead of a hard stop
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${-dx * 0.06}px, ${-dy * 0.06}px)`, offset: 0.7 },
        { transform: "none" },
      ],
      { duration: 400, easing: "cubic-bezier(0.3, 0.75, 0.35, 1)" }
    );
  });
}

/** Re-render just the note list (keeps search/composer focus intact). */
function renderListOnly() {
  const list = document.getElementById("list");
  if (!list) return;
  clearDropPreview();
  const prevRects = captureCardRects();
  list.textContent = "";

  let anyVisible = false;

  for (const section of state.sections) {
    if (isHidden(section)) continue; // archive + trash are managed from Settings
    const notes = section.notes.filter(matchesQuery);
    if (query && notes.length === 0) continue;

    const secEl = h("div", "section" + (section.collapsed && !query ? " collapsed" : ""));
    if (section.color) {
      // the category color washes over the whole section (cards, count, caret)
      secEl.classList.add("tinted-section");
      secEl.style.setProperty("--sec-tint", section.color);
    }

    // header
    const header = h("div", "section-header");
    header.appendChild(h("span", "section-caret", "›"));
    if (renamingSectionId === section.id) {
      const input = h("input", "section-title-input");
      input.value = section.title;
      const commit = () => {
        // Enter commits and triggers a rebuild, which fires blur — guard so
        // the second call is a no-op instead of a second render
        if (renamingSectionId !== section.id) return;
        section.title = input.value.trim() || section.title;
        renamingSectionId = null;
        persist();
        renderListOnly();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          renamingSectionId = null;
          renderListOnly();
        }
      });
      header.appendChild(input);
      setTimeout(() => input.focus(), 0);
    } else {
      const title = h("span", "section-title", section.title);
      if (section.color) {
        title.classList.add("tinted");
        title.style.background = section.color;
      }
      header.appendChild(title);
    }
    const rule = h("div", "section-rule");
    if (section.color) rule.style.background = section.color + "66"; // soft tint
    header.appendChild(rule);
    if (section.notes.length > 0) {
      header.appendChild(
        h("span", "section-count", String(section.notes.filter((n) => !n.done).length))
      );
    }
    // A dblclick fires two clicks first, which used to collapse+reopen the
    // section right as the rename input appeared. Delay the collapse just
    // long enough to swallow it when a dblclick follows.
    const toggleCollapse = () => {
      // toggle in place (no rebuild) so the grid collapse animates
      section.collapsed = !section.collapsed;
      secEl.classList.toggle("collapsed", section.collapsed && !query);
      persist();
    };
    let clickTimer: number | null = null;
    header.addEventListener("click", () => {
      if (renamingSectionId === section.id) return;
      if (clickTimer !== null) return; // second click of a dblclick
      clickTimer = window.setTimeout(() => {
        clickTimer = null;
        toggleCollapse();
      }, 230);
    });
    header.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      // rename only when the double click lands on the title itself;
      // on the caret / rule / count it just collapses once, no rename
      if ((e.target as HTMLElement).closest(".section-title")) {
        renamingSectionId = section.id;
        renderListOnly();
      } else {
        toggleCollapse();
      }
    });
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSectionMenu(e.clientX, e.clientY, section);
    });
    // allow dropping notes onto a section header
    header.addEventListener("dragover", (e) => {
      e.preventDefault();
      clearDropPreview();
      header.classList.add("drag-target");
    });
    header.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget || !header.contains(e.relatedTarget as Node)) {
        header.classList.remove("drag-target");
      }
    });
    header.addEventListener("drop", (e) => {
      e.preventDefault();
      clearDropPreview();
      if (dragIds.length) moveNotes(dragIds, section.id);
    });
    secEl.appendChild(header);

    // cards (wrapped for animated collapse)
    const cardsWrap = h("div", "cards-wrap");
    const cards = h("div", "cards");
    for (const note of notes) {
      cards.appendChild(renderCard(note, section));
      anyVisible = true;
    }
    // dropping in the gaps / below the last card appends to this section
    // (card drops stopPropagation, so this only fires on empty space)
    cardsWrap.addEventListener("dragover", (e) => {
      if ((e.target as HTMLElement).closest(".card")) return;
      e.preventDefault();
      showDropPreview(cards, null);
    });
    cardsWrap.addEventListener("drop", (e) => {
      e.preventDefault();
      clearDropPreview();
      if (dragIds.length) moveNotes(dragIds, section.id);
    });
    cardsWrap.appendChild(cards);
    secEl.appendChild(cardsWrap);
    list.appendChild(secEl);
  }

  if (!anyVisible) {
    const hint = h(
      "div",
      "empty-hint",
      query
        ? "No notes match your search."
        : "Nothing here yet.\nType below to add your first note or prompt."
    );
    list.appendChild(hint);
  }

  playCardMoves(prevRects);
  updatePillLabel();
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const d = Math.floor(hrs / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function renderCard(note: Note, section: Section): HTMLElement {
  const card = h("div", "card");
  card.dataset.id = note.id;
  // when the done state just flipped, mount the card in its previous state
  // and flip a frame later so the check/strikethrough transitions play
  const justToggled = animCheck.has(note.id);
  if (justToggled) animCheck.delete(note.id);
  if (justToggled ? !note.done : note.done) card.classList.add("done");
  if (justToggled) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => card.classList.toggle("done", note.done))
    );
  }
  if (note.important) card.classList.add("important");
  if (selected.has(note.id)) card.classList.add("selected");
  if (focusedId === note.id) card.classList.add("focused");
  if (expandedIds.has(note.id)) card.classList.add("expanded");
  card.tabIndex = -1;

  // one-shot animations, consumed on first render after the event
  if (animNew.has(note.id)) {
    card.classList.add("anim-in");
    animNew.delete(note.id);
  }

  const check = h("div", "check");
  // stroke-dash checkmark, drawn in when the card gains .done
  check.innerHTML =
    '<svg class="checkmark" viewBox="0 0 12 10"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg>';
  check.title = "Mark as done (Space)";
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDone([note.id]);
  });
  card.appendChild(check);

  if (animPop.has(note.id)) {
    check.classList.add("anim-pop");
    card.classList.add("anim-settle");
    animPop.delete(note.id);
  }

  if (editingId === note.id) {
    const ta = h("textarea", "card-edit");
    ta.value = note.text;
    const commit = () => {
      const v = ta.value.trim();
      if (v) note.text = v;
      editingId = null;
      persist();
      renderListOnly();
    };
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
      if (e.key === "Escape") {
        editingId = null;
        renderListOnly();
      }
    });
    ta.addEventListener("blur", commit);
    card.appendChild(ta);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }, 0);
    return card;
  }

  const body = h("div", "card-body");
  const textEl = h("div", "card-text");
  textEl.innerHTML = mdToHtml(note.text);
  textEl.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const href = a.getAttribute("href");
    if (href) bridge.openExternal(href);
  });
  body.appendChild(textEl);
  card.appendChild(body);

  // creation time — a small chip that only shows while hovering the card
  const time = h("div", "card-time", timeAgo(note.createdAt));
  time.title = new Date(note.createdAt).toLocaleString();
  card.appendChild(time);

  // selection
  card.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (selected.has(note.id)) selected.delete(note.id);
      else selected.add(note.id);
      focusedId = note.id;
    } else if (e.shiftKey && focusedId) {
      const vis = visibleNotes().map((n) => n.id);
      const a = vis.indexOf(focusedId);
      const b = vis.indexOf(note.id);
      if (a !== -1 && b !== -1) {
        selected.clear();
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(vis[i]);
      }
    } else if (selected.size === 1 && selected.has(note.id)) {
      // clicking the only selected note again releases the selection
      selected.clear();
      focusedId = null;
    } else {
      selected.clear();
      selected.add(note.id);
      focusedId = note.id;
    }
    renderListOnly();
  });

  card.addEventListener("dblclick", () => {
    editingId = note.id;
    renderListOnly();
  });

  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    // don't bubble to the document handler, which would close the menu we
    // are about to open
    e.stopPropagation();
    if (!selected.has(note.id)) {
      selected.clear();
      selected.add(note.id);
      focusedId = note.id;
      renderListOnly();
    }
    showNoteMenu(e.clientX, e.clientY);
  });

  // drag & drop reordering
  card.draggable = true;
  card.addEventListener("dragstart", (e) => {
    dragIds = selected.has(note.id) ? [...selected] : [note.id];
    card.classList.add("dragging");
    e.dataTransfer?.setData("text/plain", note.text);
  });
  card.addEventListener("dragend", () => {
    dragIds = [];
    card.classList.remove("dragging");
    clearDropPreview();
  });
  card.addEventListener("dragover", (e) => {
    if (dragIds.length === 0 || dragIds.includes(note.id)) return;
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const cards = card.closest<HTMLElement>(".cards");
    if (!cards) return;
    showDropPreview(cards, card, before);
    card.classList.toggle("drag-over-top", before);
    card.classList.toggle("drag-over-bottom", !before);
  });
  card.addEventListener("dragleave", () => {
    card.classList.remove("drag-over-top", "drag-over-bottom");
  });
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    clearDropPreview();
    if (dragIds.length === 0 || dragIds.includes(note.id)) return;

    // pull dragged notes out
    const dragging = new Set(dragIds);
    const moving: Note[] = [];
    for (const s of state.sections) {
      const stay: Note[] = [];
      for (const n of s.notes) {
        if (dragging.has(n.id)) moving.push(n);
        else stay.push(n);
      }
      s.notes = stay;
    }
    // insert at target position
    const idx = section.notes.findIndex((n) => n.id === note.id);
    section.notes.splice(before ? idx : idx + 1, 0, ...moving);
    persist();
    renderListOnly();
  });

  return card;
}

// ---------------------------------------------------------------------------
// Minimize to pill
// ---------------------------------------------------------------------------

const PILL_W = 160;
const PILL_H = 44;

// size to restore when expanding from the pill (updated on minimize)
let prePillW = DEFAULT_WINDOW.width;
let prePillH = DEFAULT_WINDOW.height;

function panelEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".panel");
}

function updatePillLabel() {
  const label = document.getElementById("pill-label");
  if (!label) return;
  const remaining = allNotes().filter(
    (e) => !e.note.done && !isHidden(e.section)
  ).length;
  label.textContent = `oxidized - ${remaining} ${remaining === 1 ? "task" : "tasks"}`;
}

/** Pulse the pill so a capture is noticeable while the panel is collapsed. */
let pillFlashTimer: ReturnType<typeof setTimeout> | null = null;
function flashPill() {
  const panel = panelEl();
  if (!panel || !pillMode) return;
  panel.classList.remove("pill-flash");
  void panel.offsetWidth; // restart the animation on rapid captures
  panel.classList.add("pill-flash");
  if (pillFlashTimer) clearTimeout(pillFlashTimer);
  pillFlashTimer = setTimeout(() => panel.classList.remove("pill-flash"), 1600);
}

function minimizeToPill() {
  if (pillMode) return;
  const panel = panelEl();
  if (!panel) return;
  pillMode = true;
  closeMenu();
  prePillW = panel.offsetWidth;
  prePillH = panel.offsetHeight;
  panel.classList.add("morphing");
  // pin current size in px so the width/height transition can interpolate
  panel.style.width = prePillW + "px";
  panel.style.height = prePillH + "px";
  void panel.offsetWidth; // force reflow
  panel.classList.add("pill");
  panel.style.width = PILL_W + "px";
  panel.style.height = PILL_H + "px";
  updatePillLabel();
  sounds.pop();
  // once the morph is done, shrink the actual window (desktop); bun snapshots
  // the native frame first so expanding restores it exactly
  setTimeout(() => {
    if (pillMode) bridge.pillShrink(PILL_W + 16, PILL_H + 16);
  }, 320);
}

function expandFromPill() {
  if (!pillMode) return;
  const panel = panelEl();
  if (!panel) return;
  pillMode = false;
  // grow the window first so the panel has room to morph back — bun restores
  // the exact native frame it snapshotted at minimize (sizes can't stack)
  bridge.pillRestore();
  requestAnimationFrame(() => {
    panel.classList.remove("pill");
    panel.style.width = prePillW + "px";
    panel.style.height = prePillH + "px";
    sounds.pop();
    setTimeout(() => {
      panel.style.width = "";
      panel.style.height = "";
      panel.classList.remove("morphing");
    }, 340);
  });
}

// ---------------------------------------------------------------------------
// Resize grip (frameless windows have no native resize edges)
// ---------------------------------------------------------------------------

function attachResizeGrip(panel: HTMLElement) {
  const grip = h(
    "div",
    "resize-grip" + (isDesktop ? " electrobun-webkit-app-region-no-drag" : "")
  );
  grip.title = "Drag to resize";

  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);

    if (isDesktop) {
      // main tracks the cursor in DIP and setBounds; renderer screenX is
      // unreliable on a transparent layered HWND, and grab-anywhere would
      // otherwise steal the gesture.
      bridge.windowResizeStart();
      const up = () => {
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        grip.removeEventListener("lostpointercapture", up);
        bridge.windowResizeEnd();
        settings.window = {
          width: Math.round(window.innerWidth),
          height: Math.round(window.innerHeight),
        };
        void saveSettingsNow();
      };
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
      grip.addEventListener("lostpointercapture", up);
      return;
    }

    const startX = e.screenX;
    const startY = e.screenY;
    const startW = app.clientWidth;
    const startH = app.clientHeight;
    let raf = 0;

    const move = (ev: PointerEvent) => {
      const w = Math.max(MIN_WINDOW.width, Math.round(startW + (ev.screenX - startX)));
      const hh = Math.max(MIN_WINDOW.height, Math.round(startH + (ev.screenY - startY)));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        app.style.width = w + "px";
        app.style.height = hh + "px";
      });
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });

  panel.appendChild(grip);
}

// ---------------------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------------------

let snapDisplays: DisplayInfo[] = [];

async function refreshSnapDisplays() {
  if (!isDesktop) {
    snapDisplays = [];
    return;
  }
  try {
    snapDisplays = await bridge.listDisplays();
  } catch (err) {
    console.error("listDisplays failed", err);
    snapDisplays = [];
  }
}

function formatDisplayLabel(d: DisplayInfo, index: number): string {
  const name = d.label || `Display ${index + 1}`;
  const tags: string[] = [];
  if (d.primary) tags.push("primary");
  if (d.internal) tags.push("built-in");
  return tags.length ? `${name} · ${tags.join(" · ")}` : name;
}

function snapDisplayValue(sel: OxideSettings["snapDisplay"]): string {
  return typeof sel === "number" ? String(sel) : sel || "primary";
}

function parseSnapDisplayChoice(v: string): OxideSettings["snapDisplay"] {
  if (v === "primary" || v === "current") return v;
  const id = Number(v);
  return Number.isInteger(id) ? id : "primary";
}

function snapDisplayOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [
    { value: "primary", label: "Primary display" },
    { value: "current", label: "Current display" },
  ];
  const seen = new Set<string>(["primary", "current"]);
  for (let i = 0; i < snapDisplays.length; i++) {
    const d = snapDisplays[i];
    const value = String(d.id);
    seen.add(value);
    opts.push({ value, label: formatDisplayLabel(d, i) });
  }
  const sel = settings.snapDisplay;
  if (typeof sel === "number" && !seen.has(String(sel))) {
    opts.push({ value: String(sel), label: "Disconnected display" });
  }
  return opts;
}

function renderSettingsView(panel: HTMLElement) {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add("electrobun-webkit-app-region-drag");
  const back = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "‹");
  back.title = "Back (Esc)";
  back.addEventListener("click", () => {
    navigateTo("list");
  });
  topbar.appendChild(back);
  topbar.appendChild(h("div", "settings-title", "Settings"));
  panel.appendChild(topbar);

  const wrap = h("div", "settings");

  wrap.appendChild(h("div", "set-group", "General"));
  wrap.appendChild(
    segmentedRow(
      "Appearance",
      "Follow the system or force a look",
      [
        { value: "system", label: "Auto" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
      settings.theme,
      (v) => setTheme(v as OxideSettings["theme"])
    )
  );
  wrap.appendChild(
    toggleRow("Sounds", "Little pops and blips on actions", settings.sounds, (v) => {
      settings.sounds = v;
      void saveSettingsNow();
    })
  );
  wrap.appendChild(
    toggleRow(
      "Hide completed",
      "Keep done notes out of the main list",
      settings.hideCompleted === true,
      (v) => {
        settings.hideCompleted = v;
        void saveSettingsNow();
      }
    )
  );
  wrap.appendChild(
    toggleRow(
      "Complete on copy",
      "Mark notes as done after copying them as a list",
      settings.autoCompleteOnCopy !== false,
      (v) => {
        settings.autoCompleteOnCopy = v;
        void saveSettingsNow();
      }
    )
  );
  const targetSections = state.sections.filter((s) => !isHidden(s));
  if (targetSections.length > 0) {
    const active = targetSections.find((s) => s.id === state.activeSectionId);
    wrap.appendChild(
      selectRow(
        "Default section",
        "Where captures and new notes land",
        targetSections.map((s) => ({ value: s.id, label: s.title })),
        (active ?? targetSections[0]).id,
        (v) => {
          state.activeSectionId = v;
          persist();
          const sec = state.sections.find((s) => s.id === v);
          if (sec) toast(`New notes go to ${sec.title}`);
        }
      )
    );
  }
  if (isDesktop) {
    wrap.appendChild(
      toggleRow(
        "Expand on capture",
        "Pop the window out of the pill when a note is captured",
        settings.expandOnCapture === true,
        (v) => {
          settings.expandOnCapture = v;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      toggleRow(
        "Keep on top",
        "Float above other windows",
        settings.alwaysOnTop !== false,
        (v) => {
          settings.alwaysOnTop = v;
          pinned = v;
          bridge.setPin(v);
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      toggleRow(
        "Launch at login",
        "Start Oxide when you sign in to this computer",
        settings.launchAtLogin === true,
        (v) => {
          settings.launchAtLogin = v;
          void saveSettingsNow();
        }
      )
    );
  }

  wrap.appendChild(h("div", "set-group", "Global shortcuts"));
  if (isDesktop) {
    wrap.appendChild(
      shortcutRow(
        "Toggle panel",
        "Show / hide Oxide from anywhere",
        settings.shortcuts.togglePanel,
        (acc) => {
          settings.shortcuts.togglePanel = acc;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      shortcutRow(
        "Capture clipboard",
        "Add clipboard text as a note",
        settings.shortcuts.captureClipboard,
        (acc) => {
          settings.shortcuts.captureClipboard = acc;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      toggleRow(
        "Double-tap capture",
        "Tap the capture key twice to grab the current selection",
        settings.shortcuts.doubleShiftCapture,
        (v) => {
          settings.shortcuts.doubleShiftCapture = v;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      segmentedRow(
        "Capture key",
        "Which key to double-tap",
        [
          { value: "shift", label: "Shift" },
          { value: "ctrl", label: "Ctrl" },
          { value: "alt", label: "Alt" },
        ],
        settings.shortcuts.doubleTapKey || "shift",
        (v) => {
          settings.shortcuts.doubleTapKey = v as OxideSettings["shortcuts"]["doubleTapKey"];
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      numberRow(
        "Double-press window",
        "Max time between the two taps",
        settings.shortcuts.doubleShiftWindowMs || 400,
        { min: 150, max: 10_000, step: 50, suffix: "ms" },
        (v) => {
          settings.shortcuts.doubleShiftWindowMs = v;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      toggleRow(
        "Skip duplicate captures",
        "Ignore identical text captured within 30 seconds",
        settings.dedupeCaptures !== false,
        (v) => {
          settings.dedupeCaptures = v;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      shortcutRow(
        "Snap to position",
        "Send the panel to its home spot from anywhere",
        settings.shortcuts.snapWindow,
        (acc) => {
          settings.shortcuts.snapWindow = acc;
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      selectRow(
        "Snap position",
        "Where the snap shortcut sends the panel",
        [
          { value: "left", label: "Left edge" },
          { value: "right", label: "Right edge" },
          { value: "top-left", label: "Top left" },
          { value: "top-right", label: "Top right" },
          { value: "bottom-left", label: "Bottom left" },
          { value: "bottom-right", label: "Bottom right" },
        ],
        settings.snapPosition || "left",
        (v) => {
          settings.snapPosition = v as OxideSettings["snapPosition"];
          void saveSettingsNow();
        }
      )
    );
    wrap.appendChild(
      selectRow(
        "Snap display",
        "Which monitor the snap shortcut uses",
        snapDisplayOptions(),
        snapDisplayValue(settings.snapDisplay),
        (v) => {
          settings.snapDisplay = parseSnapDisplayChoice(v);
          void saveSettingsNow();
        }
      )
    );
  } else {
    wrap.appendChild(
      h("div", "set-note", "Global shortcuts are available in the desktop app.")
    );
  }

  // group heading with an optional count + clear-all button on the right
  const groupHeader = (title: string, count: number, clearLabel: string, onClear: () => void) => {
    const head = h("div", "set-group set-group-row");
    head.appendChild(h("span", undefined, count > 0 ? `${title} · ${count}` : title));
    if (count > 0) {
      const btn = h("button", "mini-btn danger", clearLabel);
      btn.addEventListener("click", onClear);
      head.appendChild(btn);
    }
    return head;
  };

  const appendNoteRows = (
    notes: Note[],
    visibleCount: number,
    onLoadMore: () => void,
    renderRow: (note: Note) => HTMLElement
  ) => {
    for (const note of notes.slice(0, visibleCount)) wrap.appendChild(renderRow(note));
    if (visibleCount < notes.length) {
      const moreWrap = h("div", "load-more-wrap");
      const remaining = notes.length - visibleCount;
      const more = h(
        "button",
        "mini-btn load-more",
        `Load more · ${Math.min(SETTINGS_PAGE_SIZE, remaining)}`
      );
      more.title = `${remaining} more ${remaining === 1 ? "item" : "items"}`;
      more.addEventListener("click", () => {
        onLoadMore();
        render();
      });
      moreWrap.appendChild(more);
      wrap.appendChild(moreWrap);
    }
  };

  // --- archive (hidden from the main list, managed here)
  const archived = state.sections.filter(isArchive).flatMap((s) => s.notes);
  wrap.appendChild(
    groupHeader("Archive", archived.length, "Clear archive", () => {
      // "clear" archives → trash, so nothing is lost by accident
      deleteNotes(archived.map((n) => n.id), { animate: false });
      render();
    })
  );
  if (archived.length === 0) {
    wrap.appendChild(
      h("div", "set-note", "Empty. Right-click a note → Archive to stash it here.")
    );
  } else {
    appendNoteRows(archived, archiveVisibleCount, () => {
      archiveVisibleCount = Math.min(archiveVisibleCount + SETTINGS_PAGE_SIZE, archived.length);
    }, (note) => {
      const row = h("div", "set-row");
      row.appendChild(h("div", "set-label ellipsis", note.text.replace(/\n+/g, " ")));

      const restore = h("button", "mini-btn", "Restore");
      restore.addEventListener("click", () => {
        const target =
          state.sections.find((s) => !isHidden(s)) ??
          (() => {
            const created: Section = { id: uid(), title: "Notes", collapsed: false, notes: [] };
            state.sections.unshift(created);
            return created;
          })();
        moveNotes([note.id], target.id);
        sounds.pop();
        render();
      });
      row.appendChild(restore);

      const del = h("button", "mini-btn danger", "Delete");
      del.addEventListener("click", () => {
        deleteNotes([note.id], { animate: false });
        render();
      });
      row.appendChild(del);

      return row;
    });
  }

  // --- trash (deleted notes land here instead of being destroyed)
  const trashed = state.sections.filter(isTrash).flatMap((s) => s.notes);
  wrap.appendChild(
    groupHeader("Trash", trashed.length, "Empty trash", () => {
      deleteNotes(trashed.map((n) => n.id), { animate: false, purge: true });
      render();
    })
  );
  if (trashed.length === 0) {
    wrap.appendChild(
      h("div", "set-note", "Empty. Deleted notes end up here so you can restore them.")
    );
  } else {
    appendNoteRows(trashed, trashVisibleCount, () => {
      trashVisibleCount = Math.min(trashVisibleCount + SETTINGS_PAGE_SIZE, trashed.length);
    }, (note) => {
      const row = h("div", "set-row");
      row.appendChild(h("div", "set-label ellipsis", note.text.replace(/\n+/g, " ")));

      const restore = h("button", "mini-btn", "Restore");
      restore.addEventListener("click", () => {
        const target =
          state.sections.find((s) => !isHidden(s)) ??
          (() => {
            const created: Section = { id: uid(), title: "Notes", collapsed: false, notes: [] };
            state.sections.unshift(created);
            return created;
          })();
        delete note.deletedAt;
        moveNotes([note.id], target.id);
        sounds.pop();
        render();
      });
      row.appendChild(restore);

      const del = h("button", "mini-btn danger", "Delete forever");
      del.addEventListener("click", () => {
        deleteNotes([note.id], { animate: false, purge: true });
        render();
      });
      row.appendChild(del);

      return row;
    });
  }

  wrap.appendChild(h("div", "set-group", "Storage"));
  const storageCard = h("div", "storage-card");
  const storageIcon = h("div", "storage-icon");
  storageIcon.innerHTML =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h4l2 2h5A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 8h16"/></svg>';
  storageCard.appendChild(storageIcon);

  const storageBody = h("div", "storage-body");
  const storageTitle = h("div", "storage-title-row");
  storageTitle.appendChild(h("div", "storage-title", isDesktop ? "Local data folder" : "Browser storage"));
  storageTitle.appendChild(h("span", "storage-badge", "LOCAL ONLY"));
  storageBody.appendChild(storageTitle);
  storageBody.appendChild(
    h(
      "div",
      "storage-sub",
      isDesktop ? "Notes and settings stay on this device" : "Notes and settings stay in this browser"
    )
  );
  storageBody.appendChild(
    h("code", "storage-path", isDesktop ? "%LOCALAPPDATA%\\oxidized" : "localStorage")
  );
  storageCard.appendChild(storageBody);

  if (isDesktop) {
    const open = h("button", "mini-btn", "Open folder");
    open.classList.add("storage-action");
    open.addEventListener("click", () => bridge.openDataDir());
    storageCard.appendChild(open);
  }
  wrap.appendChild(storageCard);
  wrap.appendChild(
    actionRow("Export notes", "Download a JSON backup of every section", "Export", () => {
      void exportNotesFile();
    })
  );
  wrap.appendChild(
    actionRow("Import notes", "Replace everything with a JSON backup", "Import", () => {
      void importNotesFile();
    })
  );
  wrap.appendChild(h("div", "set-note", "No accounts, sync, or telemetry."));

  wrap.appendChild(h("div", "set-group", "About"));
  const aboutRow = h("div", "set-row");
  const aboutLabel = h("div", "set-label", "About Oxide");
  aboutLabel.appendChild(h("small", undefined, `Version ${APP_VERSION} · links & credits`));
  aboutRow.appendChild(aboutLabel);
  const aboutOpen = h("button", "mini-btn", "Open");
  aboutOpen.addEventListener("click", () => {
    navigateTo("info");
  });
  aboutRow.appendChild(aboutOpen);
  wrap.appendChild(aboutRow);

  panel.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Info / about page
// ---------------------------------------------------------------------------

const APP_VERSION = "1.1.0";
const GITHUB_URL = "https://github.com/HologramSteve/oxidized";
const X_URL = "https://x.com/deepseekailover";


function renderInfoView(panel: HTMLElement) {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add("electrobun-webkit-app-region-drag");
  const back = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "‹");
  back.title = "Back (Esc)";
  back.addEventListener("click", () => {
    navigateTo("settings"); // About lives inside Settings now
  });
  topbar.appendChild(back);
  topbar.appendChild(h("div", "settings-title", "About"));
  panel.appendChild(topbar);

  const wrap = h("div", "settings");

  const hero = h("div", "info-hero");
  const mark = h("div", "info-mark");
  for (const [src, cls] of [
    [LOGO_LIGHT, "logo-light"],
    [LOGO_DARK, "logo-dark"],
  ] as const) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "oxidized logo";
    img.className = cls;
    img.draggable = false;
    mark.appendChild(img);
  }
  hero.appendChild(mark);
  hero.appendChild(h("div", "info-logo", "oxidized"));
  hero.appendChild(h("div", "info-version", `v${APP_VERSION} · open source`));
  hero.appendChild(
    h(
      "div",
      "info-desc",
      "A floating, keyboard-first scratchpad for scattered AI work. Double-tap to capture text from anywhere, stage prompts, copy batches as lists."
    )
  );
  wrap.appendChild(hero);

  const linkRow = (title: string, sub: string, url: string) => {
    const row = h("div", "set-row");
    const label = h("div", "set-label", title);
    label.appendChild(h("small", undefined, sub));
    row.appendChild(label);
    const open = h("button", "mini-btn", "Open");
    open.addEventListener("click", () => bridge.openExternal(url));
    row.appendChild(open);
    return row;
  };

  wrap.appendChild(h("div", "set-group", "Links"));
  wrap.appendChild(linkRow("GitHub", "Source code, issues and releases", GITHUB_URL));
  wrap.appendChild(linkRow("X / Twitter", "Follow the developer", X_URL));
  if (isDesktop) {
    const row = h("div", "set-row");
    const label = h("div", "set-label", "Data folder");
    label.appendChild(h("small", undefined, "Where your notes live, locally"));
    row.appendChild(label);
    const open = h("button", "mini-btn", "Open");
    open.addEventListener("click", () => bridge.openDataDir());
    row.appendChild(open);
    wrap.appendChild(row);
  }

  wrap.appendChild(h("div", "set-group", "Credits"));
  wrap.appendChild(
    h(
      "div",
      "set-note",
      "Built with Bun + Electron. Inspired by Copper by shadcn. Everything stays on your machine."
    )
  );

  panel.appendChild(wrap);
}

function actionRow(title: string, sub: string, label: string, onClick: () => void): HTMLElement {
  const row = h("div", "set-row");
  const lab = h("div", "set-label", title);
  lab.appendChild(h("small", undefined, sub));
  row.appendChild(lab);
  const btn = h("button", "mini-btn", label);
  btn.addEventListener("click", onClick);
  row.appendChild(btn);
  return row;
}

function exportPayload(): string {
  return JSON.stringify(
    { version: 1, exportedAt: Date.now(), state },
    null,
    2
  );
}

async function exportNotesFile() {
  try {
    const ok = await bridge.exportNotes(exportPayload());
    toast(ok ? "Notes exported" : "Export cancelled");
  } catch (err) {
    console.error("export failed", err);
    toast("Couldn't export notes");
  }
}

function parseImportedState(raw: string): AppState | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const obj = data as { state?: unknown; sections?: unknown };
    return normalizeState(obj.state ?? obj);
  } catch {
    return null;
  }
}

async function importNotesFile() {
  try {
    const raw = await bridge.importNotes();
    if (!raw) return;
    const next = parseImportedState(raw);
    if (!next) {
      toast("That file isn't an Oxide backup");
      return;
    }
    if (!confirm("Replace all notes with this backup? This cannot be undone.")) return;
    state = next;
    undoStack.length = 0;
    persist();
    render();
    toast("Notes imported");
  } catch (err) {
    console.error("import failed", err);
    toast("Couldn't import notes");
  }
}

function toggleRow(
  title: string,
  sub: string,
  value: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  const sw = h("button", "switch" + (value ? " on" : ""));
  sw.addEventListener("click", () => {
    const on = sw.classList.toggle("on");
    onChange(on);
    sounds.pop();
  });
  row.appendChild(label);
  row.appendChild(sw);
  return row;
}

function segmentedRow(
  title: string,
  sub: string,
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void
): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  row.appendChild(label);

  const seg = h("div", "seg");
  for (const opt of options) {
    const btn = h("button", "seg-btn" + (opt.value === current ? " on" : ""), opt.label);
    btn.addEventListener("click", () => {
      if (btn.classList.contains("on")) return;
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      onChange(opt.value);
      sounds.pop();
    });
    seg.appendChild(btn);
  }
  row.appendChild(seg);
  return row;
}

function selectRow(
  title: string,
  sub: string,
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void
): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  row.appendChild(label);

  // not a native <select>: its popup is clipped at the frameless window edge
  // and the overflowing part can't be clicked. The custom menu stays inside
  // the current window (and scrolls if it's taller).
  let cur = current;
  const field = h("button", "select-field");
  const setLabel = () => {
    field.textContent = options.find((o) => o.value === cur)?.label ?? cur;
    field.appendChild(h("span", "select-caret", "▾"));
  };
  setLabel();
  field.addEventListener("click", (e) => {
    // the document-level click handler closes menus — don't kill this one
    e.stopPropagation();
    const r = field.getBoundingClientRect();
    showMenu(
      r.left,
      r.bottom + 4,
      options.map((o) => ({
        label: o.label,
        checked: o.value === cur,
        action: () => {
          if (o.value === cur) return;
          cur = o.value;
          setLabel();
          onChange(o.value);
          sounds.pop();
        },
      }))
    );
  });
  row.appendChild(field);
  return row;
}

function numberRow(
  title: string,
  sub: string,
  value: number,
  opts: { min: number; max: number; step: number; suffix: string },
  onChange: (value: number) => void
): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  row.appendChild(label);

  const field = h("div", "num-field");
  const input = h("input");
  input.type = "number";
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(value);
  const commit = () => {
    let v = Math.round(Number(input.value));
    if (!Number.isFinite(v)) v = value;
    v = Math.max(opts.min, Math.min(opts.max, v));
    input.value = String(v);
    onChange(v);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
  });
  field.appendChild(input);
  field.appendChild(h("span", "num-suffix", opts.suffix));
  row.appendChild(field);
  return row;
}

function displayAccel(acc: string): string {
  return acc ? acc.replace("CommandOrControl", "Ctrl") : "None";
}

function shortcutRow(
  title: string,
  sub: string,
  current: string,
  onChange: (acc: string) => void
): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  row.appendChild(label);

  let cur = current;
  const field = h("button", "shortcut-field", displayAccel(cur));
  field.title = "Click, then press a key combo. Esc cancels.";
  field.addEventListener("click", () => {
    if (field.classList.contains("recording")) return;
    field.classList.add("recording");
    field.textContent = "Press keys…";

    const cleanup = () => {
      field.classList.remove("recording");
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        cleanup();
        field.textContent = displayAccel(cur);
        return;
      }
      // wait until a non-modifier key arrives
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const mods: string[] = [];
      if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (mods.length === 0) return; // global shortcuts need a modifier
      let key = e.key === " " ? "Space" : e.key;
      if (key.length === 1) key = key.toUpperCase();
      const acc = [...mods, key].join("+");
      cleanup();
      cur = acc;
      field.textContent = displayAccel(acc);
      onChange(acc);
      sounds.pop();
    };
    document.addEventListener("keydown", onKey, true);
  });
  row.appendChild(field);
  return row;
}

async function saveSettingsNow() {
  setSoundsEnabled(settings.sounds);
  try {
    const res = await bridge.saveSettings(JSON.stringify(settings));
    if (res && (!res.togglePanelOk || !res.captureClipboardOk || !res.snapWindowOk)) {
      toast("A shortcut failed to register");
    }
  } catch (err) {
    console.error("saveSettings failed", err);
    toast("Couldn't save settings");
  }
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

let openMenu: HTMLElement | null = null;
// when the current menu was opened (guards against transient blur)
let menuShownAt = 0;

function closeMenu() {
  const menu = openMenu;
  if (!menu) return;
  openMenu = null;
  menu.classList.add("closing");
  setTimeout(() => menu.remove(), 140);
}

document.addEventListener("click", () => closeMenu());
// clicking bare space (list gaps, panel padding) releases the selection —
// but grab-anywhere window drags also end in a click, so only when the
// mouse didn't actually travel
let bgDownAt: { x: number; y: number } | null = null;
window.addEventListener(
  "mousedown",
  (e) => {
    bgDownAt = { x: e.screenX, y: e.screenY };
  },
  true
);
document.addEventListener("click", (e) => {
  if (selected.size === 0 && !focusedId) return;
  const t = e.target as HTMLElement;
  if (!t?.matches?.(".panel, .list, .section, .cards, .cards-wrap")) return;
  if (
    bgDownAt &&
    Math.abs(e.screenX - bgDownAt.x) + Math.abs(e.screenY - bgDownAt.y) > 4
  )
    return;
  selected.clear();
  focusedId = null;
  renderListOnly();
});
document.addEventListener("contextmenu", (e) => {
  // close a stale menu when right-clicking empty space
  if (openMenu && !(e.target as HTMLElement).closest(".ctxmenu")) closeMenu();
});
window.addEventListener("blur", () => {
  // clicking Oxide while another app has focus fires a transient blur right
  // as the menu opens (activation churn) — don't let it kill the fresh menu
  if (Date.now() - menuShownAt < 300) return;
  closeMenu();
});

interface MenuItem {
  label?: string;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  // small colored circle before the label (color picker entries)
  swatch?: string;
  sep?: boolean;
  // group: inline header + items on web, a real submenu in the native menu
  children?: MenuItem[];
  action?: () => void;
}

function showMenu(x: number, y: number, items: MenuItem[]) {
  closeMenu();
  const menu = h("div", "ctxmenu");
  const appendItem = (item: MenuItem) => {
    const el = h(
      "div",
      "ctxmenu-item" + (item.danger ? " danger" : "") + (item.disabled ? " disabled" : "")
    );
    const lab = h("span", "ctxmenu-label");
    if (item.checked) lab.appendChild(document.createTextNode("✓ "));
    if (item.swatch) {
      const sw = h("span", "ctxmenu-swatch");
      sw.style.background = item.swatch;
      lab.appendChild(sw);
    }
    lab.appendChild(document.createTextNode(item.label ?? ""));
    el.appendChild(lab);
    if (item.kbd) el.appendChild(h("span", "ctxmenu-kbd", item.kbd));
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      item.action?.();
    });
    menu.appendChild(el);
  };
  for (const item of items) {
    if (item.sep) {
      menu.appendChild(h("div", "ctxmenu-sep"));
      continue;
    }
    if (item.children) {
      menu.appendChild(h("div", "ctxmenu-sub", item.label ?? ""));
      for (const child of item.children) appendItem(child);
      continue;
    }
    appendItem(item);
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  // stay inside the current window — never grow the native frame for a menu
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
  openMenu = menu;
  menuShownAt = Date.now();
}

function showNoteMenu(x: number, y: number) {
  const ids = targetIds();
  const multi = ids.length > 1;
  const first = ids[0] ? findNote(ids[0]) : null;
  const items: MenuItem[] = [
    { label: multi ? `Copy ${ids.length} notes` : "Copy", kbd: "Ctrl C", action: () => copyNotes(ids, "plain") },
    { label: "Copy as List", kbd: "Ctrl Alt C", action: () => copyNotes(ids, "numbered") },
    { label: "Copy as Markdown", action: () => copyNotes(ids, "markdown") },
    { sep: true },
    {
      label: first && ids.every((id) => findNote(id)?.note.done) ? "Mark as Not Done" : "Mark as Done",
      kbd: "Space",
      action: () => toggleDone(ids),
    },
    {
      label:
        first && ids.every((id) => findNote(id)?.note.important)
          ? "Remove Important"
          : "Mark as Important",
      kbd: "Ctrl I",
      action: () => toggleImportant(ids),
    },
    {
      label: expandedIds.has(ids[0]) ? "Collapse" : "Expand",
      action: () => {
        for (const id of ids) {
          if (expandedIds.has(id)) expandedIds.delete(id);
          else expandedIds.add(id);
        }
        renderListOnly();
      },
    },
    {
      label: "Edit",
      kbd: "Enter",
      disabled: multi,
      action: () => {
        editingId = ids[0];
        renderListOnly();
      },
    },
    { label: multi ? `Duplicate ${ids.length} notes` : "Duplicate", kbd: "Ctrl D", action: () => duplicateNotes(ids) },
    { label: "Merge Notes", disabled: !multi, action: () => mergeNotes(ids) },
    { label: multi ? `Archive ${ids.length} notes` : "Archive", kbd: "Ctrl E", action: () => archiveNotes(ids) },
    { sep: true },
    {
      label: "Move to…",
      children: state.sections
        .filter((s) => !isHidden(s))
        .map<MenuItem>((s) => ({
          label: s.title,
          disabled: !multi && first?.section.id === s.id,
          action: () => moveNotes(ids, s.id),
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

function showSectionMenu(x: number, y: number, section: Section) {
  const items: MenuItem[] = [
    {
      label: "Set as capture target",
      disabled: state.activeSectionId === section.id,
      action: () => {
        state.activeSectionId = section.id;
        persist();
        toast(`New notes go to ${section.title}`);
      },
    },
    {
      label: "Rename",
      action: () => {
        renamingSectionId = section.id;
        renderListOnly();
      },
    },
    {
      label: section.collapsed ? "Expand" : "Collapse",
      action: () => {
        section.collapsed = !section.collapsed;
        persist();
        renderListOnly();
      },
    },
    {
      label: "Color",
      children: SECTION_COLORS.map<MenuItem>((c) => ({
        label: c.name,
        swatch: c.value || undefined,
        checked: (section.color ?? "") === c.value,
        action: () => {
          if (c.value) section.color = c.value;
          else delete section.color;
          persist();
          renderListOnly();
        },
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

function showAppMenu(x: number, y: number) {
  const items: MenuItem[] = [
    { label: "New section", action: () => addSection("New section") },
    {
      label: "Collapse all",
      action: () => {
        const collapse = state.sections.some((s) => !s.collapsed);
        for (const s of state.sections) s.collapsed = collapse;
        persist();
        renderListOnly();
      },
    },
    {
      label: "Undo",
      kbd: "Ctrl+Z",
      disabled: undoStack.length === 0,
      action: () => undoLast(),
    },
    {
      label: "Hide completed",
      checked: settings.hideCompleted === true,
      action: () => {
        settings.hideCompleted = !settings.hideCompleted;
        void saveSettingsNow();
        renderListOnly();
      },
    },
    {
      label: "Clear completed",
      danger: true,
      action: () => {
        const doneIds = allNotes()
          .filter((e) => e.note.done)
          .map((e) => e.note.id);
        if (doneIds.length) deleteNotes(doneIds);
      },
    },
    { sep: true },
    {
      label: "Appearance",
      children: [
        {
          label: "Auto",
          checked: settings.theme === "system",
          action: () => setTheme("system"),
        },
        {
          label: "Light",
          checked: settings.theme === "light",
          action: () => setTheme("light"),
        },
        {
          label: "Dark",
          checked: settings.theme === "dark",
          action: () => setTheme("dark"),
        },
      ],
    },
    {
      label: "Settings…",
      kbd: "Ctrl+,",
      action: () => {
        navigateTo("settings");
      },
    },
  ];
  if (isDesktop) {
    items.push(
      { sep: true },
      {
        label: "Always on top",
        checked: pinned,
        action: () => {
          pinned = !pinned;
          settings.alwaysOnTop = pinned;
          bridge.setPin(pinned);
          void saveSettingsNow();
        },
      },
      { label: "Hide panel", kbd: "Ctrl Shift Space", action: () => bridge.hide() },
      { sep: true },
      { label: "Quit Oxide", danger: true, action: () => bridge.quit() }
    );
  }
  showMenu(x, y, items);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(message: string) {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = h("div", "toast");
    document.body.appendChild(el);
  }
  el.textContent = message;
  // restart animation
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el!.classList.remove("show"), 1600);
}

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

function focusFirstVisible() {
  const vis = visibleNotes();
  if (vis.length === 0) return;
  focusedId = vis[0].id;
  selected.clear();
  selected.add(focusedId);
  renderListOnly();
  scrollFocusedIntoView();
}

function scrollFocusedIntoView() {
  if (!focusedId) return;
  document
    .querySelector(`.card[data-id="${focusedId}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function moveFocus(delta: number, extendSelection: boolean) {
  const vis = visibleNotes().map((n) => n.id);
  if (vis.length === 0) return;
  let idx = focusedId ? vis.indexOf(focusedId) : -1;
  idx = Math.max(0, Math.min(vis.length - 1, idx + delta));
  const next = vis[idx];
  if (extendSelection && focusedId) {
    selected.add(focusedId);
    selected.add(next);
  } else {
    selected.clear();
    selected.add(next);
  }
  focusedId = next;
  renderListOnly();
  scrollFocusedIntoView();
}

document.addEventListener("keydown", (e) => {
  if (pillMode) return;

  const target = e.target as HTMLElement;
  const inField =
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

  if ((e.ctrlKey || e.metaKey) && e.key === ",") {
    e.preventDefault();
    navigateTo("settings");
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    if (inField) return;
    e.preventDefault();
    undoLast();
    return;
  }

  if (view !== "list") {
    if (e.key === "Escape") {
      // About sits one level under Settings — Esc walks back up
      navigateTo(view === "info" ? "settings" : "list");
    }
    return;
  }

  // global-ish shortcuts that work anywhere in the panel
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    (document.getElementById("search") as HTMLInputElement | null)?.focus();
    return;
  }

  if (inField) return;

  if (e.key === "/" ) {
    e.preventDefault();
    (document.getElementById("search") as HTMLInputElement | null)?.focus();
    return;
  }

  if (e.key === "Escape") {
    if (openMenu) return closeMenu();
    selected.clear();
    focusedId = null;
    renderListOnly();
    return;
  }

  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    moveNotesBy(e.key === "ArrowUp" ? -1 : 1);
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!focusedId) focusFirstVisible();
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
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      (document.getElementById("composer-input") as HTMLTextAreaElement | null)?.focus();
    }
    return;
  }

  if (e.key === " ") {
    e.preventDefault();
    toggleDone(ids);
  } else if (e.key === "Enter") {
    e.preventDefault();
    editingId = ids[0];
    renderListOnly();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteNotes(ids);
  } else if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copyNotes(ids, "numbered");
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    e.preventDefault();
    copyNotes(ids, "plain");
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    selected.clear();
    for (const n of visibleNotes()) selected.add(n.id);
    renderListOnly();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
    e.preventDefault();
    mergeNotes(ids);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
    e.preventDefault();
    duplicateNotes(ids);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
    e.preventDefault();
    toggleImportant(ids);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
    e.preventDefault();
    archiveNotes(ids);
  }
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function allowMotion() {
  return !motionQuery.matches;
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function setTheme(pref: OxideSettings["theme"]) {
  settings.theme = pref;
  applyTheme();
  void saveSettingsNow();
}

function applyTheme() {
  const dark = settings.theme === "dark" || (settings.theme === "system" && darkQuery.matches);
  const resolved = dark ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

darkQuery.addEventListener("change", () => {
  if (settings.theme === "system") applyTheme();
});
applyTheme();

// ---------------------------------------------------------------------------
// Grab-anywhere window dragging (desktop)
// ---------------------------------------------------------------------------
// The main process moves the window (it tracks the cursor and glides with
// momentum on release); here we only decide whether a mousedown starts a
// drag. Bare surfaces (panel padding, gaps between cards, empty list space)
// are grab handles — while cards, headers, inputs and scrollbars keep
// working normally. The drag-handle classes below stay as inert JS markers:
// .electrobun-webkit-app-region-drag marks chrome that is always draggable
// (topbar, pill face), -no-drag marks interactive widgets inside it.

// (.pill-face is NOT here — it carries the drag class statically)
const GRAB_SURFACES =
  ".panel, .list, .section, .cards, .cards-wrap, .composer, .settings, .empty-hint";

function initGrabAnywhere() {
  if (!isDesktop) return;
  let dragging = false;
  const DRAG_CLASS = "electrobun-webkit-app-region-drag";

  window.addEventListener(
    "mousedown",
    (e) => {
      if (dragging || e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t?.closest?.(".resize-grip")) return;
      if (t?.matches?.(GRAB_SURFACES)) {
        // clicks on a scrollbar land on the element itself but outside its
        // client box — those must scroll, not move the window
        if (e.offsetX > t.clientWidth || e.offsetY > t.clientHeight) return;
        dragging = true;
      } else if (
        t?.closest?.("." + DRAG_CLASS) &&
        !t?.closest?.(".electrobun-webkit-app-region-no-drag")
      ) {
        // statically draggable surface (topbar, pill face)
        dragging = true;
      }
      // the main process samples the window position and glides on release
      if (dragging) bridge.windowDragStart();
    },
    true // capture: runs before any widget handlers
  );
  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      bridge.windowDragEnd(); // main ignores this when no drag was running
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  if (isDesktop) {
    try {
      initDesktopBridge();
    } catch (err) {
      console.error("desktop bridge failed, falling back to localStorage", err);
    }
  } else {
    document.body.classList.add("web-mode");
  }

  // settings
  try {
    const rawSettings = await bridge.loadSettings();
    if (rawSettings) settings = mergeSettings(JSON.parse(rawSettings));
  } catch (err) {
    console.error("failed to load settings", err);
  }
  setSoundsEnabled(settings.sounds);
  pinned = settings.alwaysOnTop !== false;
  applyTheme();
  initGrabAnywhere();
  void refreshSnapDisplays();

  let loaded: AppState | null = null;
  try {
    const raw = await bridge.load();
    if (raw) loaded = normalizeState(JSON.parse(raw));
  } catch (err) {
    console.error("failed to load state", err);
  }
  state = loaded ?? seedState();
  if (!loaded) persist();
  render();
}

boot();
