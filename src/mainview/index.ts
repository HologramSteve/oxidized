// Oxide — floating, keyboard-first scratchpad for scattered AI work.
// Runs both as a plain website and inside an Electrobun webview.

import {
  DEFAULT_SETTINGS,
  type AppState,
  type Note,
  type OxideRPC,
  type OxideSettings,
  type Section,
} from "../shared/types";
import { setSoundsEnabled, sounds } from "./sounds";

// ---------------------------------------------------------------------------
// Platform adapter: Electrobun RPC on desktop, localStorage in the browser
// ---------------------------------------------------------------------------

const isDesktop = location.protocol === "views:";
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
  saveSettings(
    json: string
  ): Promise<{ togglePanelOk: boolean; captureClipboardOk: boolean } | null>;
  setWindowSize(width: number, height: number): void;
  pillShrink(width: number, height: number): void;
  pillRestore(): void;
  menuGrow(width: number, height: number): void;
  menuRestore(): void;
  openExternal(url: string): void;
  openDataDir(): void;
  debug(text: string): void;
}

// CSS px → physical device px, using this window's actual per-monitor scale
const phys = (n: number) => Math.round(n * (window.devicePixelRatio || 1));

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
    return { togglePanelOk: true, captureClipboardOk: true };
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
  debug(text) {
    console.log("[oxide]", text);
  },
};

async function initDesktopBridge() {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<OxideRPC>({
    handlers: {
      requests: {},
      messages: {
        capture: ({ text }: { text: string }) => {
          addNote(text, state.activeSectionId);
          sounds.capture();
          toast("Captured");
        },
      },
    },
  });
  const electroview = new Electroview({ rpc });
  bridge = {
    load: () => electroview.rpc!.request.loadState({}),
    save: (json) => {
      electroview.rpc!.request.saveState({ json }).catch((err: unknown) => {
        console.error("saveState failed", err);
      });
    },
    copy: (text) => electroview.rpc!.request.copyText({ text }),
    hide: () => electroview.rpc!.send.hideWindow({}),
    quit: () => electroview.rpc!.send.quitApp({}),
    setPin: (value) => electroview.rpc!.send.setAlwaysOnTop({ value }),
    loadSettings: () => electroview.rpc!.request.loadSettings({}),
    saveSettings: (json) => electroview.rpc!.request.saveSettings({ json }),
    setWindowSize: (width, height) =>
      electroview.rpc!.send.setWindowSize({ width: phys(width), height: phys(height) }),
    pillShrink: (width, height) =>
      electroview.rpc!.send.pillShrink({ width: phys(width), height: phys(height) }),
    pillRestore: () => electroview.rpc!.send.pillRestore({}),
    menuGrow: (width, height) =>
      electroview.rpc!.send.menuGrow({ width: phys(width), height: phys(height) }),
    menuRestore: () => electroview.rpc!.send.menuRestore({}),
    openExternal: (url) => electroview.rpc!.send.openExternal({ url }),
    openDataDir: () => electroview.rpc!.send.openDataDir({}),
    debug: (text) => electroview.rpc!.send.debugLog({ text }),
  };
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
let hideCompleted = false;
let view: "list" | "settings" | "info" = "list";
let pillMode = false;
let settings: OxideSettings = structuredClone(DEFAULT_SETTINGS);
// notes to animate on next render (consumed once)
const animNew = new Set<string>();
const animPop = new Set<string>();
// done-state just flipped: render the old state, then toggle a frame later so
// the checkbox fill / checkmark draw / strikethrough transitions actually run
const animCheck = new Set<string>();

const uid = () => crypto.randomUUID();

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
  }
  if (!s.sections.find((sec) => sec.id === s.activeSectionId)) {
    s.activeSectionId = s.sections[0]?.id ?? "";
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

function findNote(id: string) {
  return allNotes().find((n) => n.note.id === id) ?? null;
}

function matchesQuery(note: Note): boolean {
  if (hideCompleted && note.done) return false;
  if (!query) return true;
  return note.text.toLowerCase().includes(query.toLowerCase());
}

/** Notes currently visible (search-filtered, sections expanded), in display order. */
function visibleNotes(): Note[] {
  const out: Note[] = [];
  for (const section of state.sections) {
    if (isArchive(section)) continue;
    if (section.collapsed && !query) continue;
    for (const note of section.notes) {
      if (matchesQuery(note)) out.push(note);
    }
  }
  return out;
}

function addNote(text: string, sectionId?: string): Note {
  const trimmed = text.trim();
  const section =
    state.sections.find((s) => s.id === sectionId) ?? state.sections[0];
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
  const entries = ids.map(findNote).filter(Boolean) as { note: Note; section: Section }[];
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
  opts: { animate?: boolean; sound?: boolean } = {}
) {
  const { animate = true, sound = true } = opts;

  const doRemove = () => {
    for (const section of state.sections) {
      section.notes = section.notes.filter((n) => !ids.includes(n.id));
    }
    for (const id of ids) selected.delete(id);
    if (focusedId && ids.includes(focusedId)) focusedId = null;
    if (sound) sounds.remove();
    persist();
    renderListOnly();
  };

  if (animate) {
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

function mergeNotes(ids: string[]) {
  if (ids.length < 2) return;
  // keep display order
  const ordered = allNotes().filter((e) => ids.includes(e.note.id));
  const first = ordered[0];
  if (!first) return;
  first.note.text = ordered.map((e) => e.note.text).join("\n\n");
  first.note.done = false;
  deleteNotes(ordered.slice(1).map((e) => e.note.id), { animate: false, sound: false });
  selected.clear();
  selected.add(first.note.id);
  focusedId = first.note.id;
  animPop.add(first.note.id);
  sounds.pop();
  persist();
  renderListOnly();
  toast("Merged");
}

function moveNotes(ids: string[], sectionId: string) {
  const dest = state.sections.find((s) => s.id === sectionId);
  if (!dest) return;
  const moving: Note[] = [];
  for (const section of state.sections) {
    const stay: Note[] = [];
    for (const n of section.notes) {
      if (ids.includes(n.id)) moving.push(n);
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

function archiveNotes(ids: string[]) {
  let arch = state.sections.find(isArchive);
  if (!arch) {
    arch = { id: uid(), title: "Archive", collapsed: true, notes: [] };
    state.sections.push(arch);
  }
  moveNotes(ids, arch.id);
  for (const id of ids) selected.delete(id);
  if (focusedId && ids.includes(focusedId)) focusedId = null;
  sounds.pop();
  toast("Archived");
}

function noteAsPlainText(note: Note): string {
  return note.text;
}

async function copyNotes(ids: string[], format: "plain" | "numbered" | "markdown") {
  const ordered = allNotes().filter((e) => ids.includes(e.note.id));
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
  if (!withNotes && removed.notes.length > 0) {
    const fallback = state.sections[0] ?? addSection("Notes");
    fallback.notes.push(...removed.notes);
  }
  if (state.activeSectionId === sectionId) {
    state.activeSectionId = state.sections[0]?.id ?? "";
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
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  html = html.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
  );
  html = html.replaceAll("\n", "<br>");
  return html;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const app = document.getElementById("app")!;
const expandedIds = new Set<string>();
let dragIds: string[] = [];

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

function render() {
  app.textContent = "";
  const panel = h("div", "panel");
  if (pillMode) panel.classList.add("pill");
  // a menu action can re-render while the window is still grown for the menu —
  // keep the fresh panel pinned to its true size until the growth is restored
  if (menuGrown && menuBase && !pillMode) {
    panel.style.width = menuBase.w + "px";
    panel.style.height = menuBase.h + "px";
  }

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
  // TEMP diagnostics: buttons reported dead while another app holds focus
  menuBtn.addEventListener("pointerdown", () => bridge.debug("menuBtn pointerdown"));
  menuBtn.addEventListener("click", (e) => {
    bridge.debug(`menuBtn click (openMenu=${!!openMenu}, focus=${document.hasFocus()})`);
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
  minBtn.addEventListener("pointerdown", () => bridge.debug("minBtn pointerdown"));
  minBtn.addEventListener("click", () => {
    bridge.debug("minBtn click");
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
  if (prev.size === 0) return;
  document.querySelectorAll<HTMLElement>(".card[data-id]").forEach((el) => {
    if (el.classList.contains("anim-in")) return; // brand new, has its own entrance
    const old = prev.get(el.dataset.id!);
    if (!old) return;
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 280, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
    );
  });
}

/** Re-render just the note list (keeps search/composer focus intact). */
function renderListOnly() {
  const list = document.getElementById("list");
  if (!list) return;
  const prevRects = captureCardRects();
  list.textContent = "";

  let anyVisible = false;

  for (const section of state.sections) {
    if (isArchive(section)) continue; // managed from Settings
    const notes = section.notes.filter(matchesQuery);
    if (query && notes.length === 0) continue;

    const secEl = h("div", "section" + (section.collapsed && !query ? " collapsed" : ""));

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
      header.appendChild(h("span", "section-title", section.title));
    }
    header.appendChild(h("div", "section-rule"));
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
    header.addEventListener("dragover", (e) => e.preventDefault());
    header.addEventListener("drop", (e) => {
      e.preventDefault();
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
    cardsWrap.addEventListener("dragover", (e) => e.preventDefault());
    cardsWrap.addEventListener("drop", (e) => {
      e.preventDefault();
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

  const textEl = h("div", "card-text");
  textEl.innerHTML = mdToHtml(note.text);
  card.appendChild(textEl);

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
    document
      .querySelectorAll(".drag-over-top, .drag-over-bottom")
      .forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom"));
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
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
    card.classList.remove("drag-over-top", "drag-over-bottom");
    if (dragIds.length === 0 || dragIds.includes(note.id)) return;

    // pull dragged notes out
    const moving: Note[] = [];
    for (const s of state.sections) {
      const stay: Note[] = [];
      for (const n of s.notes) {
        if (dragIds.includes(n.id)) moving.push(n);
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
const FULL_W = 380;
const FULL_H = 680;

// size to restore when expanding from the pill (updated on minimize)
let prePillW = FULL_W;
let prePillH = FULL_H;

function panelEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".panel");
}

function updatePillLabel() {
  const label = document.getElementById("pill-label");
  if (!label) return;
  const remaining = allNotes().filter((e) => !e.note.done).length;
  label.textContent = `oxidized - ${remaining} ${remaining === 1 ? "task" : "tasks"}`;
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
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    const startX = e.screenX;
    const startY = e.screenY;
    const startW = isDesktop ? window.innerWidth : app.clientWidth;
    const startH = isDesktop ? window.innerHeight : app.clientHeight;
    let raf = 0;

    const move = (ev: PointerEvent) => {
      const w = Math.max(280, Math.round(startW + (ev.screenX - startX)));
      const hh = Math.max(360, Math.round(startH + (ev.screenY - startY)));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (isDesktop) {
          bridge.setWindowSize(w, hh);
        } else {
          app.style.width = w + "px";
          app.style.height = hh + "px";
        }
      });
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      if (isDesktop) {
        // remember the chosen size across restarts
        settings.window = {
          width: Math.round(window.innerWidth),
          height: Math.round(window.innerHeight),
        };
        void saveSettingsNow();
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });

  panel.appendChild(grip);
}

// ---------------------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------------------

function renderSettingsView(panel: HTMLElement) {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add("electrobun-webkit-app-region-drag");
  const back = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "‹");
  back.title = "Back (Esc)";
  back.addEventListener("click", () => {
    view = "list";
    render();
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
      settings.theme || "system",
      (v) => {
        settings.theme = v as OxideSettings["theme"];
        applyTheme();
        void saveSettingsNow();
      }
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
      "Complete on copy",
      "Mark notes as done after copying them as a list",
      settings.autoCompleteOnCopy !== false,
      (v) => {
        settings.autoCompleteOnCopy = v;
        void saveSettingsNow();
      }
    )
  );
  if (isDesktop) {
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
  } else {
    wrap.appendChild(
      h("div", "set-note", "Global shortcuts are available in the desktop app.")
    );
  }

  // --- archive (hidden from the main list, managed here)
  wrap.appendChild(h("div", "set-group", "Archive"));
  const archived = state.sections.filter(isArchive).flatMap((s) => s.notes);
  if (archived.length === 0) {
    wrap.appendChild(
      h("div", "set-note", "Empty. Right-click a note → Archive to stash it here.")
    );
  } else {
    for (const note of archived) {
      const row = h("div", "set-row");
      row.appendChild(h("div", "set-label ellipsis", note.text.replace(/\n+/g, " ")));

      const restore = h("button", "mini-btn", "Restore");
      restore.addEventListener("click", () => {
        const target =
          state.sections.find((s) => !isArchive(s)) ??
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

      wrap.appendChild(row);
    }

    const clearRow = h("div", "set-row");
    clearRow.appendChild(h("div", "set-label", `${archived.length} archived`));
    const clearBtn = h("button", "mini-btn danger", "Clear archive");
    clearBtn.addEventListener("click", () => {
      deleteNotes(archived.map((n) => n.id), { animate: false });
      render();
    });
    clearRow.appendChild(clearBtn);
    wrap.appendChild(clearRow);
  }

  wrap.appendChild(h("div", "set-group", "Storage"));
  if (isDesktop) {
    const row = h("div", "set-row");
    const label = h("div", "set-label", "Data folder");
    label.appendChild(h("small", undefined, "Notes and settings live here, nowhere else"));
    row.appendChild(label);
    const open = h("button", "mini-btn", "Open folder");
    open.addEventListener("click", () => bridge.openDataDir());
    row.appendChild(open);
    wrap.appendChild(row);
  }
  wrap.appendChild(
    h(
      "div",
      "set-note",
      isDesktop
        ? "Everything is local: %LOCALAPPDATA%\\oxidized\\settings.json and \\blobs\\notes.json. No accounts, no sync, no telemetry."
        : "Web mode stores notes and settings in this browser's localStorage."
    )
  );

  panel.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Info / about page
// ---------------------------------------------------------------------------

const APP_VERSION = "0.1.0";
const GITHUB_URL = "https://github.com/HologramSteve/oxidized";
const X_URL = "https://x.com/wqffles";

// rust-orange rounded square with the app's check-circle motif
const LOGO_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="oxg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e07a3f"/>
      <stop offset="1" stop-color="#a34a22"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#oxg)"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" stroke-width="4" opacity="0.95"/>
  <polyline points="25.5 32.5 30 37 39 26.5" fill="none" stroke="#fff" stroke-width="4"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function renderInfoView(panel: HTMLElement) {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add("electrobun-webkit-app-region-drag");
  const back = h("button", "iconbtn electrobun-webkit-app-region-no-drag", "‹");
  back.title = "Back (Esc)";
  back.addEventListener("click", () => {
    view = "list";
    render();
  });
  topbar.appendChild(back);
  topbar.appendChild(h("div", "settings-title", "About"));
  panel.appendChild(topbar);

  const wrap = h("div", "settings");

  const hero = h("div", "info-hero");
  const mark = h("div", "info-mark");
  mark.innerHTML = LOGO_SVG;
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
      "Built with Bun + Electrobun. Inspired by Copper by shadcn. Everything stays on your machine."
    )
  );

  panel.appendChild(wrap);
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
    if (res && (!res.togglePanelOk || !res.captureClipboardOk)) {
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
// the window was temporarily grown so the menu could overflow the panel;
// menuBase remembers the pre-growth size, because window.innerWidth lies
// while the window is still grown for a previous menu
let menuGrown = false;
let menuBase: { w: number; h: number } | null = null;
// when the current menu was opened (guards against transient blur)
let menuShownAt = 0;

function restoreMenuGrowth() {
  // a newer menu may have opened during the 140ms close animation — it still
  // needs the grown window; its own close schedules the next restore
  if (!menuGrown || openMenu) return;
  menuGrown = false;
  menuBase = null;
  bridge.menuRestore();
  // unpin the panel (pinned in showMenu so it wouldn't stretch with the
  // larger window) — unless the pill morph owns the size now
  const panel = panelEl();
  if (panel && !pillMode) {
    panel.style.width = "";
    panel.style.height = "";
  }
}

function closeMenu() {
  const menu = openMenu;
  if (!menu) return;
  openMenu = null;
  // collapse animation, then remove; shrink the window back only after the
  // menu is gone so the closing animation isn't clipped
  menu.classList.add("closing");
  setTimeout(() => {
    menu.remove();
    restoreMenuGrowth();
  }, 140);
}

document.addEventListener("click", () => closeMenu());
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
    el.appendChild(h("span", undefined, (item.checked ? "✓ " : "") + (item.label ?? "")));
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

  if (isDesktop) {
    // don't clamp — let the menu spill past the panel and grow the (transparent)
    // native window just enough to show it. The panel is pinned to its current
    // size so it doesn't stretch along; closeMenu restores the exact frame.
    const left = Math.max(8, x);
    const top = Math.max(8, y);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    // measure against the pre-growth size — innerWidth lies while the window
    // is still grown for a previous menu (restore runs 140ms after close)
    const baseW = menuBase?.w ?? window.innerWidth;
    const baseH = menuBase?.h ?? window.innerHeight;
    const needW = Math.ceil(left + rect.width + 12);
    const needH = Math.ceil(top + rect.height + 12);
    if (needW > baseW || needH > baseH || menuGrown) {
      if (!menuGrown) {
        menuBase = { w: baseW, h: baseH };
        const panel = panelEl();
        if (panel) {
          panel.style.width = panel.offsetWidth + "px";
          panel.style.height = panel.offsetHeight + "px";
        }
        menuGrown = true;
      }
      bridge.menuGrow(Math.max(needW, baseW), Math.max(needH, baseH));
    }
  } else {
    // web: keep fully inside the viewport
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
  }
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
    { label: "Merge Notes", disabled: !multi, action: () => mergeNotes(ids) },
    { label: multi ? `Archive ${ids.length} notes` : "Archive", action: () => archiveNotes(ids) },
    { sep: true },
    {
      label: "Move to…",
      children: state.sections
        .filter((s) => !isArchive(s))
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
      label: "Hide completed",
      checked: hideCompleted,
      action: () => {
        hideCompleted = !hideCompleted;
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
      label: "Settings…",
      action: () => {
        view = "settings";
        render();
      },
    },
    {
      label: "About Oxide",
      action: () => {
        view = "info";
        render();
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
  if (view !== "list") {
    if (e.key === "Escape") {
      view = "list";
      render();
    }
    return;
  }

  const target = e.target as HTMLElement;
  const inField =
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

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
  }
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const pref = settings.theme || "system";
  const dark = pref === "dark" || (pref === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

darkQuery.addEventListener("change", () => {
  if ((settings.theme || "system") === "system") applyTheme();
});

// ---------------------------------------------------------------------------
// Grab-anywhere window dragging (desktop)
// ---------------------------------------------------------------------------
// Electrobun starts a native window move on mousedown over an element with the
// drag class. We tag bare surfaces (panel padding, gaps between cards, empty
// list space) with that class just-in-time, so anything that isn't interactive
// becomes a drag handle — while cards, headers, inputs and scrollbars keep
// working normally.

// (.pill-face is NOT here — it carries the drag class statically, and the
// just-in-time add/remove below would strip it)
const GRAB_SURFACES =
  ".panel, .list, .section, .cards, .cards-wrap, .composer, .settings, .empty-hint";

function initGrabAnywhere() {
  if (!isDesktop) return;
  const DRAG_CLASS = "electrobun-webkit-app-region-drag";
  let grabbed: HTMLElement | null = null;

  const release = () => {
    if (!grabbed) return;
    const el = grabbed;
    grabbed = null;
    // Electrobun's own mouseup handler needs to still see the class to end
    // the move — strip it a tick later
    setTimeout(() => el.classList.remove(DRAG_CLASS), 0);
  };

  window.addEventListener(
    "mousedown",
    (e) => {
      release(); // safety: never leave a stale drag class behind
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (!t?.matches?.(GRAB_SURFACES)) return;
      // clicks on a scrollbar land on the element itself but outside its
      // client box — those must scroll, not move the window
      if (e.offsetX > t.clientWidth || e.offsetY > t.clientHeight) return;
      t.classList.add(DRAG_CLASS);
      grabbed = t;
    },
    true // capture: runs before Electrobun's own mousedown listener
  );
  window.addEventListener("mouseup", release);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  if (isDesktop) {
    try {
      await initDesktopBridge();
    } catch (err) {
      console.error("desktop bridge failed, falling back to localStorage", err);
    }
  } else {
    document.body.classList.add("web-mode");
  }

  // settings
  try {
    const rawSettings = await bridge.loadSettings();
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(parsed.shortcuts ?? {}) },
      };
    }
  } catch (err) {
    console.error("failed to load settings", err);
  }
  setSoundsEnabled(settings.sounds);
  pinned = settings.alwaysOnTop !== false;
  applyTheme();
  initGrabAnywhere();

  // TEMP diagnostics: top-right buttons reported dead while another app's
  // text field holds focus — trace whether clicks reach the webview at all
  if (isDesktop) {
    window.addEventListener("focus", () => bridge.debug("window focus"));
    window.addEventListener("blur", () => bridge.debug("window blur"));
    window.addEventListener(
      "mousedown",
      (e) => {
        const t = e.target as HTMLElement;
        bridge.debug(
          `mousedown <${t.tagName?.toLowerCase()}> ${String(t.className).slice(0, 48)}`
        );
      },
      true
    );
  }

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
