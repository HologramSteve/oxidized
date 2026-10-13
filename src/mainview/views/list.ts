// The main view: search bar, sections of note cards, composer.
//
// The chrome (top bar, composer) is built once. The list itself is rebuilt
// from state on every render — cheap at this size, and it keeps the DOM a
// pure function of the model. Events are delegated to the list container, so
// rebuilding never leaves stale handlers behind, and an in-progress edit
// survives a rebuild because its draft lives in ui state.

import { isHidden } from "../../shared/state";
import type { Note, Section } from "../../shared/types";
import {
  addNote,
  cancelEdit,
  cancelRename,
  commitEdit,
  commitRename,
  dropNotesNextTo,
  moveNotes,
  startEditing,
  startRename,
  toggleDone,
  toggleSectionCollapsed,
} from "../actions";
import { allowMotion, DRAG_CLASS, fitTextarea, h, NO_DRAG_CLASS } from "../dom";
import { highlightMatches, mdToHtml } from "../markdown";
import { closeMenu, isMenuOpen } from "../menu";
import { showAppMenu, showNoteMenu, showSectionMenu } from "../menus";
import { findEntry, findSection, matchesFilter } from "../notes";
import { minimizeToPill } from "../pill";
import { isDesktop, platform } from "../platform";
import { invalidate } from "../render";
import {
  clearSelection,
  clickSelect,
  currentVisibleNotes,
  focusFirstVisible,
  hasSelection,
  selectOnly,
} from "../selection";
import { sounds } from "../sounds";
import { store } from "../store";
import { searchQuery, ui } from "../ui";

const SEARCH_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
// stroke-dash checkmark, drawn in when the card gains .done
const CHECKMARK =
  '<svg class="checkmark" viewBox="0 0 12 10"><polyline points="1.5 6 4.5 9 10.5 1"></polyline></svg>';

const COMPOSER_MAX_HEIGHT = 120;
// A dblclick fires two clicks first, which would collapse+reopen the section
// right as the rename input appears. Delay the collapse just long enough to
// swallow it when a dblclick follows.
const COLLAPSE_CLICK_DELAY_MS = 230;

let listEl: HTMLElement;
// true while the list's children are being swapped: blur events fired by
// removing a focused field are not the user leaving it
let rendering = false;

export interface ListView {
  /** Top bar, list, composer — in panel order. */
  nodes: HTMLElement[];
}

export function createListView(): ListView {
  listEl = h("div", "list");
  listEl.id = "list";
  bindListEvents();
  bindBackgroundClick();
  return { nodes: [buildTopbar(), listEl, buildComposer()] };
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function buildTopbar(): HTMLElement {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add(DRAG_CLASS);

  const searchwrap = h("div", `searchwrap ${NO_DRAG_CLASS}`);
  searchwrap.innerHTML = SEARCH_ICON;
  const search = h("input");
  search.type = "text";
  search.placeholder = "Search";
  search.value = ui.query;
  search.id = "search";
  search.addEventListener("input", () => {
    ui.query = search.value;
    invalidate();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      ui.query = "";
      search.value = "";
      invalidate();
      search.blur();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      search.blur();
      focusFirstVisible();
    }
    e.stopPropagation();
  });
  searchwrap.appendChild(search);
  topbar.appendChild(searchwrap);

  const menuBtn = h("button", `iconbtn ${NO_DRAG_CLASS}`, "⋯");
  menuBtn.title = "Menu";
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // second click toggles the menu closed instead of re-popping it
    if (isMenuOpen()) {
      closeMenu();
      return;
    }
    const r = menuBtn.getBoundingClientRect();
    showAppMenu(r.left, r.bottom + 4);
  });
  topbar.appendChild(menuBtn);

  // minimize to pill — top right
  const minBtn = h("button", `iconbtn ${NO_DRAG_CLASS}`, "–");
  minBtn.title = "Minimize to pill";
  minBtn.addEventListener("click", () => minimizeToPill());
  topbar.appendChild(minBtn);

  return topbar;
}

function buildComposer(): HTMLElement {
  const composer = h("div", "composer");
  const inner = h("div", "composer-inner");
  inner.appendChild(h("div", "check check-ghost"));
  const ta = h("textarea");
  ta.rows = 1;
  ta.placeholder = "Add a note or prompt";
  ta.id = "composer-input";
  ta.addEventListener("input", () => fitTextarea(ta, COMPOSER_MAX_HEIGHT));
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (addNote(ta.value)) {
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
  return composer;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Rebuild the note list from state (search and composer are left alone). */
export function renderList(): void {
  const { state, settings } = store;
  const query = searchQuery();
  clearDropPreview();
  const previousRects = captureCardRects();
  const fieldSelection = activeFieldSelection();

  const content = document.createDocumentFragment();
  let anyVisible = false;
  let editingShown = false;
  let renamingShown = false;

  for (const section of state.sections) {
    if (isHidden(section)) continue; // archive + trash are managed from Settings
    const shown = section.notes.filter((note) => matchesFilter(note, query, settings.hideCompleted));
    if (query && shown.length === 0) continue;
    content.appendChild(buildSection(section, shown, query));
    if (shown.length > 0) anyVisible = true;
    if (ui.editing && shown.some((note) => note.id === ui.editing?.id)) editingShown = true;
    if (ui.renaming?.id === section.id) renamingShown = true;
  }

  if (!anyVisible) {
    content.appendChild(
      h(
        "div",
        "empty-hint",
        query
          ? "No notes match your search."
          : "Nothing here yet.\nType below to add your first note or prompt."
      )
    );
  }

  // one atomic swap: no empty intermediate state, so the scroll position holds
  rendering = true;
  try {
    listEl.replaceChildren(content);
  } finally {
    rendering = false;
  }

  // the one-shot animation flags were for this render only
  ui.animEnter.clear();
  ui.animPop.clear();
  ui.animCheck.clear();
  // an edit whose note is no longer listed can't be finished — drop it
  if (ui.editing && !editingShown) ui.editing = null;
  if (ui.renaming && !renamingShown) ui.renaming = null;

  focusEditField(fieldSelection);
  playCardMoves(previousRects);
}

function buildSection(section: Section, shown: Note[], query: string): HTMLElement {
  const sectionEl = h("div", "section" + (section.collapsed && !query ? " collapsed" : ""));
  sectionEl.dataset.sectionId = section.id;
  if (section.color) {
    // the category color washes over the whole section (cards, count, caret)
    sectionEl.classList.add("tinted-section");
    sectionEl.style.setProperty("--sec-tint", section.color);
  }

  const header = h("div", "section-header");
  header.appendChild(h("span", "section-caret", "›"));
  const renaming = ui.renaming?.id === section.id ? ui.renaming : null;
  if (renaming) {
    const input = h("input", "section-title-input");
    input.value = renaming.draft;
    input.addEventListener("input", () => {
      renaming.draft = input.value;
    });
    input.addEventListener("blur", () => {
      if (rendering || !input.isConnected) return;
      commitRename(renaming);
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") commitRename(renaming);
      if (e.key === "Escape") cancelRename(renaming);
    });
    header.appendChild(input);
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
    const open = section.notes.filter((note) => !note.done).length;
    header.appendChild(h("span", "section-count", String(open)));
  }
  sectionEl.appendChild(header);

  // cards (wrapped for animated collapse)
  const cardsWrap = h("div", "cards-wrap");
  const cards = h("div", "cards");
  for (const note of shown) cards.appendChild(buildCard(note));
  cardsWrap.appendChild(cards);
  sectionEl.appendChild(cardsWrap);
  return sectionEl;
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

function buildCard(note: Note): HTMLElement {
  const card = h("div", "card");
  card.dataset.id = note.id;
  // when the done state just flipped, mount the card in its previous state
  // and flip a frame later so the check/strikethrough transitions play
  const justToggled = ui.animCheck.has(note.id);
  if (justToggled ? !note.done : note.done) card.classList.add("done");
  if (justToggled) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => card.classList.toggle("done", note.done))
    );
  }
  if (note.important) card.classList.add("important");
  if (ui.selected.has(note.id)) card.classList.add("selected");
  if (ui.focusedId === note.id) card.classList.add("focused");
  if (ui.expanded.has(note.id)) card.classList.add("expanded");
  card.tabIndex = -1;
  if (ui.animEnter.has(note.id)) card.classList.add("anim-in");

  const check = h("div", "check");
  check.innerHTML = CHECKMARK;
  check.title = "Mark as done (Space)";
  card.appendChild(check);
  if (ui.animPop.has(note.id)) {
    check.classList.add("anim-pop");
    card.classList.add("anim-settle");
  }

  const editing = ui.editing?.id === note.id ? ui.editing : null;
  if (editing) {
    const ta = h("textarea", "card-edit");
    ta.value = editing.draft;
    ta.addEventListener("input", () => {
      editing.draft = ta.value;
      fitTextarea(ta);
    });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitEdit(editing);
      if (e.key === "Escape") cancelEdit(editing);
    });
    ta.addEventListener("blur", () => {
      if (rendering || !ta.isConnected) return;
      commitEdit(editing);
    });
    card.appendChild(ta);
    return card;
  }

  const body = h("div", "card-body");
  const textEl = h("div", "card-text");
  textEl.innerHTML = mdToHtml(note.text);
  highlightMatches(textEl, searchQuery());
  body.appendChild(textEl);
  card.appendChild(body);

  // creation time — a small chip that only shows while hovering the card
  const time = h("div", "card-time", timeAgo(note.createdAt));
  time.title = new Date(note.createdAt).toLocaleString();
  card.appendChild(time);

  card.draggable = true;
  return card;
}

// ---------------------------------------------------------------------------
// Edit-field focus across rebuilds
// ---------------------------------------------------------------------------

type EditField = HTMLTextAreaElement | HTMLInputElement;
interface FieldSelection {
  start: number;
  end: number;
}

/** Caret/selection of the focused edit field, so a rebuild can restore it. */
function activeFieldSelection(): FieldSelection | null {
  const el = document.activeElement;
  const isEditField =
    (el instanceof HTMLTextAreaElement && el.classList.contains("card-edit")) ||
    (el instanceof HTMLInputElement && el.classList.contains("section-title-input"));
  if (!isEditField) return null;
  const field = el as EditField;
  const end = field.value.length;
  return { start: field.selectionStart ?? end, end: field.selectionEnd ?? end };
}

function focusEditField(previous: FieldSelection | null): void {
  const field = listEl.querySelector<EditField>(".card-edit, .section-title-input");
  if (!field) return;
  // a field that just opened may scroll into view; one that was merely
  // rebuilt must not yank the list around
  field.focus({ preventScroll: previous !== null });
  if (field instanceof HTMLTextAreaElement) {
    const end = field.value.length;
    field.setSelectionRange(previous?.start ?? end, previous?.end ?? end);
    fitTextarea(field);
  } else if (previous) {
    field.setSelectionRange(previous.start, previous.end);
  }
}

// ---------------------------------------------------------------------------
// FLIP move animations
// ---------------------------------------------------------------------------

/** Positions of every visible card, for FLIP move animations. */
function captureCardRects(): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  listEl.querySelectorAll<HTMLElement>(".card[data-id]").forEach((el) => {
    if (el.classList.contains("anim-out")) return;
    rects.set(el.dataset.id!, el.getBoundingClientRect());
  });
  return rects;
}

/** Slide cards from their old position to the new one (drag, move, delete-shift). */
function playCardMoves(previous: Map<string, DOMRect>): void {
  if (previous.size === 0 || !allowMotion()) return;
  listEl.querySelectorAll<HTMLElement>(".card[data-id]").forEach((el) => {
    if (el.classList.contains("anim-in")) return; // brand new, has its own entrance
    const old = previous.get(el.dataset.id!);
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

// ---------------------------------------------------------------------------
// Events (delegated to the list container)
// ---------------------------------------------------------------------------

function cardAt(target: EventTarget | null): { el: HTMLElement; id: string } | null {
  const el = (target as HTMLElement | null)?.closest?.<HTMLElement>(".card");
  const id = el?.dataset.id;
  return el && id ? { el, id } : null;
}

function headerAt(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.<HTMLElement>(".section-header") ?? null;
}

/** The section a list element belongs to. */
function sectionAt(target: EventTarget | null): { el: HTMLElement; section: Section } | null {
  const el = (target as HTMLElement | null)?.closest?.<HTMLElement>(".section");
  const section = el?.dataset.sectionId ? findSection(store.state, el.dataset.sectionId) : undefined;
  return el && section ? { el, section } : null;
}

/** A card with an open editor behaves like a plain text field, not like a card. */
function isEditing(id: string): boolean {
  return ui.editing?.id === id;
}

const collapseTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingCollapse(sectionId: string): void {
  const timer = collapseTimers.get(sectionId);
  if (timer === undefined) return;
  clearTimeout(timer);
  collapseTimers.delete(sectionId);
}

/** Toggle in place (no rebuild) so the grid collapse animates. */
function toggleCollapseInPlace(sectionId: string): void {
  const section = findSection(store.state, sectionId);
  if (!section) return;
  toggleSectionCollapsed(section);
  listEl
    .querySelector<HTMLElement>(`.section[data-section-id="${CSS.escape(sectionId)}"]`)
    ?.classList.toggle("collapsed", section.collapsed && !searchQuery());
}

function bindListEvents(): void {
  listEl.addEventListener("click", (e) => {
    const header = headerAt(e.target);
    if (header) {
      const hit = sectionAt(header);
      if (!hit || ui.renaming?.id === hit.section.id) return;
      const sectionId = hit.section.id;
      if (collapseTimers.has(sectionId)) return; // second click of a dblclick
      collapseTimers.set(
        sectionId,
        setTimeout(() => {
          collapseTimers.delete(sectionId);
          toggleCollapseInPlace(sectionId);
        }, COLLAPSE_CLICK_DELAY_MS)
      );
      return;
    }

    const card = cardAt(e.target);
    if (!card || isEditing(card.id)) return;
    const target = e.target as HTMLElement;
    if (target.closest(".check")) {
      e.stopPropagation();
      toggleDone([card.id]);
      return;
    }
    const link = target.closest("a");
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute("href");
      if (href) platform.openExternal(href);
      return;
    }
    clickSelect(card.id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
  });

  listEl.addEventListener("dblclick", (e) => {
    const header = headerAt(e.target);
    if (header) {
      e.stopPropagation();
      const hit = sectionAt(header);
      if (!hit || ui.renaming?.id === hit.section.id) return;
      cancelPendingCollapse(hit.section.id);
      // rename only when the double click lands on the title itself;
      // on the caret / rule / count it just collapses once, no rename
      if ((e.target as HTMLElement).closest(".section-title")) startRename(hit.section);
      else toggleCollapseInPlace(hit.section.id);
      return;
    }
    const card = cardAt(e.target);
    if (card && !isEditing(card.id)) startEditing(card.id);
  });

  listEl.addEventListener("contextmenu", (e) => {
    const header = headerAt(e.target);
    if (header) {
      const hit = sectionAt(header);
      if (!hit) return;
      e.preventDefault();
      // don't bubble to the document handler, which would close the menu we
      // are about to open
      e.stopPropagation();
      showSectionMenu(e.clientX, e.clientY, hit.section);
      return;
    }
    const card = cardAt(e.target);
    if (!card || isEditing(card.id)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!ui.selected.has(card.id)) {
      selectOnly(card.id);
      invalidate();
    }
    showNoteMenu(e.clientX, e.clientY);
  });

  bindDragAndDrop();
}

/**
 * Clicking bare space (list gaps, panel padding) releases the selection —
 * but grab-anywhere window drags also end in a click, so only when the mouse
 * didn't actually travel.
 */
function bindBackgroundClick(): void {
  let downAt: { x: number; y: number } | null = null;
  window.addEventListener(
    "mousedown",
    (e) => {
      downAt = { x: e.screenX, y: e.screenY };
    },
    true
  );
  document.addEventListener("click", (e) => {
    if (!hasSelection()) return;
    const target = e.target as HTMLElement | null;
    if (!target?.matches?.(".panel, .list, .section, .cards, .cards-wrap")) return;
    if (downAt && Math.abs(e.screenX - downAt.x) + Math.abs(e.screenY - downAt.y) > 4) return;
    clearSelection();
    invalidate();
  });
}

// ---------------------------------------------------------------------------
// Drag & drop reordering
// ---------------------------------------------------------------------------

let dragIds: string[] = [];
let dropPreview: HTMLElement | null = null;
let dropPreviewKey = "";

function clearDropPreview(): void {
  dropPreview?.remove();
  dropPreview = null;
  dropPreviewKey = "";
  listEl
    .querySelectorAll<HTMLElement>(".drag-over-top, .drag-over-bottom, .drag-target")
    .forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom", "drag-target"));
}

/** Placeholder showing where the dragged notes will land. */
function showDropPreview(cards: HTMLElement, target: HTMLElement | null, before = false): void {
  if (dragIds.length === 0) return;
  const key = `${target?.dataset.id ?? "end"}:${before ? "before" : "after"}`;
  if (dropPreview && dropPreview.parentElement === cards && dropPreviewKey === key) return;

  clearDropPreview();
  const preview = h("div", "drop-preview");
  preview.appendChild(h("div", "drop-preview-marker", "↓"));
  const first = findEntry(store.state, dragIds[0]);
  const label =
    dragIds.length > 1
      ? `Drop ${dragIds.length} notes here`
      : first
        ? first.note.text.replace(/\s+/g, " ").trim().slice(0, 100)
        : "Drop note here";
  preview.appendChild(h("div", "drop-preview-text", label || "Drop note here"));

  if (target && before) cards.insertBefore(preview, target);
  else if (target) cards.insertBefore(preview, target.nextSibling);
  else cards.appendChild(preview);
  dropPreview = preview;
  dropPreviewKey = key;
}

function isUpperHalf(el: HTMLElement, clientY: number): boolean {
  const rect = el.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2;
}

function endDrag(): void {
  dragIds = [];
  clearDropPreview();
}

function bindDragAndDrop(): void {
  listEl.addEventListener("dragstart", (e) => {
    const card = cardAt(e.target);
    const entry = card ? findEntry(store.state, card.id) : null;
    if (!card || !entry || isEditing(card.id)) return;
    // dragging a selected card takes the whole (visible) selection along
    const visible = new Set(currentVisibleNotes().map((note) => note.id));
    dragIds = ui.selected.has(card.id)
      ? [...ui.selected].filter((id) => visible.has(id))
      : [card.id];
    card.el.classList.add("dragging");
    e.dataTransfer?.setData("text/plain", entry.note.text);
    // listen on the card itself: after a drop the list is rebuilt, and a
    // dragend on the detached card no longer bubbles up to the list
    card.el.addEventListener(
      "dragend",
      () => {
        card.el.classList.remove("dragging");
        endDrag();
      },
      { once: true }
    );
  });

  listEl.addEventListener("dragover", (e) => {
    if (dragIds.length === 0) return;
    const card = cardAt(e.target);
    if (card) {
      if (dragIds.includes(card.id)) return;
      const cards = card.el.closest<HTMLElement>(".cards");
      if (!cards) return;
      e.preventDefault();
      const before = isUpperHalf(card.el, e.clientY);
      showDropPreview(cards, card.el, before);
      card.el.classList.toggle("drag-over-top", before);
      card.el.classList.toggle("drag-over-bottom", !before);
      return;
    }
    // allow dropping notes onto a section header
    const header = headerAt(e.target);
    if (header) {
      e.preventDefault();
      clearDropPreview();
      header.classList.add("drag-target");
      return;
    }
    // the gaps / space below the last card append to that section
    const wrap = (e.target as HTMLElement).closest?.<HTMLElement>(".cards-wrap");
    const cards = wrap?.querySelector<HTMLElement>(".cards");
    if (cards) {
      e.preventDefault();
      showDropPreview(cards, null);
    }
  });

  listEl.addEventListener("dragleave", (e) => {
    const card = cardAt(e.target);
    if (card) {
      card.el.classList.remove("drag-over-top", "drag-over-bottom");
      return;
    }
    const header = headerAt(e.target);
    if (header && !(e.relatedTarget instanceof Node && header.contains(e.relatedTarget))) {
      header.classList.remove("drag-target");
    }
  });

  listEl.addEventListener("drop", (e) => {
    if (dragIds.length === 0) return;
    e.preventDefault();
    const ids = dragIds;
    const card = cardAt(e.target);
    const before = card ? isUpperHalf(card.el, e.clientY) : false;
    const section = sectionAt(e.target)?.section;
    endDrag();
    if (card) dropNotesNextTo(ids, card.id, before);
    else if (section) moveNotes(ids, section.id);
  });
}
