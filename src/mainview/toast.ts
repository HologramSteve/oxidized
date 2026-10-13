// Transient status message at the bottom of the panel.

import { h } from "./dom";

const TOAST_MS = 1600;

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string): void {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = h("div", "toast");
    document.body.appendChild(el);
  }
  const shown = el;
  shown.textContent = message;
  // restart animation
  shown.classList.remove("show");
  void shown.offsetWidth;
  shown.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => shown.classList.remove("show"), TOAST_MS);
}
