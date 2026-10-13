// Small DOM helpers shared by every view.

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Inert JS markers for grab-anywhere window dragging (see grab.ts). The names
// are a leftover from the Electrobun port; CSS -webkit-app-region is NOT used.
/** Chrome that always drags the window (topbar, pill face). */
export const DRAG_CLASS = "electrobun-webkit-app-region-drag";
/** Interactive widgets inside draggable chrome. */
export const NO_DRAG_CLASS = "electrobun-webkit-app-region-no-drag";

/** The mount point from index.html. */
export const appRoot = document.getElementById("app")!;

export function panelEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".panel");
}

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function allowMotion(): boolean {
  return !motionQuery.matches;
}

/** Grow a textarea to fit its content. */
export function fitTextarea(ta: HTMLTextAreaElement, maxHeight = Infinity): void {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
}

/** True when keystrokes on this element are text input, not app shortcuts. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}
