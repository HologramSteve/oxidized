// Context menu / dropdown component. One menu is open at a time; it always
// stays inside the current window — the native frame never grows for a menu.

import { h } from "./dom";

export interface MenuItem {
  label?: string;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  // small colored circle before the label (color picker entries)
  swatch?: string;
  sep?: boolean;
  // group: an inline header followed by its items
  children?: MenuItem[];
  action?: () => void;
}

const CLOSE_ANIMATION_MS = 140;
const EDGE_MARGIN = 8;

let openMenu: HTMLElement | null = null;
// when the current menu was opened (guards against transient blur)
let menuShownAt = 0;

export function isMenuOpen(): boolean {
  return openMenu !== null;
}

export function closeMenu(): void {
  const menu = openMenu;
  if (!menu) return;
  openMenu = null;
  menu.classList.add("closing");
  setTimeout(() => menu.remove(), CLOSE_ANIMATION_MS);
}

function menuItemEl(item: MenuItem): HTMLElement {
  const el = h(
    "div",
    "ctxmenu-item" + (item.danger ? " danger" : "") + (item.disabled ? " disabled" : "")
  );
  const label = h("span", "ctxmenu-label");
  if (item.checked) label.appendChild(document.createTextNode("✓ "));
  if (item.swatch) {
    const swatch = h("span", "ctxmenu-swatch");
    swatch.style.background = item.swatch;
    label.appendChild(swatch);
  }
  label.appendChild(document.createTextNode(item.label ?? ""));
  el.appendChild(label);
  if (item.kbd) el.appendChild(h("span", "ctxmenu-kbd", item.kbd));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMenu();
    item.action?.();
  });
  return el;
}

export function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const menu = h("div", "ctxmenu");
  for (const item of items) {
    if (item.sep) {
      menu.appendChild(h("div", "ctxmenu-sep"));
    } else if (item.children) {
      menu.appendChild(h("div", "ctxmenu-sub", item.label ?? ""));
      for (const child of item.children) menu.appendChild(menuItemEl(child));
    } else {
      menu.appendChild(menuItemEl(item));
    }
  }
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - EDGE_MARGIN;
  const maxTop = window.innerHeight - rect.height - EDGE_MARGIN;
  menu.style.left = Math.max(EDGE_MARGIN, Math.min(x, maxLeft)) + "px";
  menu.style.top = Math.max(EDGE_MARGIN, Math.min(y, maxTop)) + "px";
  openMenu = menu;
  menuShownAt = Date.now();
}

/** Wire up the ways a menu gets dismissed. Call once at boot. */
export function initMenuDismissal(): void {
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
}
