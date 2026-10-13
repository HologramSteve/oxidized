// Grab-anywhere window dragging (desktop).
//
// The main process moves the window (it tracks the cursor and glides with
// momentum on release); here we only decide whether a mousedown starts a
// drag. Bare surfaces (panel padding, gaps between cards, empty list space)
// are grab handles — while cards, headers, inputs and scrollbars keep
// working normally. DRAG_CLASS marks chrome that is always draggable
// (topbar, pill face), NO_DRAG_CLASS marks interactive widgets inside it.

import { DRAG_CLASS, NO_DRAG_CLASS } from "./dom";
import { isDesktop, platform } from "./platform";

// (.pill-face is NOT here — it carries the drag class statically)
const GRAB_SURFACES =
  ".panel, .list, .section, .cards, .cards-wrap, .composer, .settings, .empty-hint";

function startsDrag(e: MouseEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target?.closest || target.closest(".resize-grip")) return false;
  if (target.matches(GRAB_SURFACES)) {
    // clicks on a scrollbar land on the element itself but outside its
    // client box — those must scroll, not move the window
    return e.offsetX <= target.clientWidth && e.offsetY <= target.clientHeight;
  }
  // statically draggable surface (topbar, pill face)
  return !!target.closest("." + DRAG_CLASS) && !target.closest("." + NO_DRAG_CLASS);
}

export function initGrabAnywhere(): void {
  if (!isDesktop) return;
  let dragging = false;

  const end = () => {
    if (!dragging) return;
    dragging = false;
    platform.windowDragEnd();
  };

  window.addEventListener(
    "mousedown",
    (e) => {
      if (dragging || e.button !== 0 || !startsDrag(e)) return;
      dragging = true;
      // the main process samples the window position and glides on release
      platform.windowDragStart();
    },
    true // capture: runs before any widget handlers
  );
  window.addEventListener("mouseup", end);
  // Safety net: if the mouseup was swallowed (released over another window,
  // a system dialog, …) the window would stay glued to the cursor. The next
  // mouse move with no button held ends the drag.
  window.addEventListener(
    "mousemove",
    (e) => {
      if (dragging && (e.buttons & 1) === 0) end();
    },
    true
  );
}
