// Minimize to pill: the panel morphs into a small draggable capsule and, on
// desktop, the native window shrinks around it.

import { DEFAULT_WINDOW } from "../shared/types";
import { panelEl } from "./dom";
import { closeMenu } from "./menu";
import { remainingCount } from "./notes";
import { platform } from "./platform";
import { sounds } from "./sounds";
import { store } from "./store";
import { ui } from "./ui";

const PILL_W = 160;
const PILL_H = 44;
// the native window is the pill plus 8px on each side (see .panel.pill)
const PILL_WINDOW_MARGIN = 16;
// slightly longer than the 0.3s CSS morph
const SHRINK_WINDOW_AFTER_MS = 320;
const MORPH_CLEANUP_AFTER_MS = 340;
const FLASH_MS = 1600;

// size to restore when expanding from the pill (updated on minimize)
let prePillW = DEFAULT_WINDOW.width;
let prePillH = DEFAULT_WINDOW.height;
// bumped on every minimize/expand so timers from an interrupted morph bow out
let morphGeneration = 0;
let pillFlashTimer: ReturnType<typeof setTimeout> | null = null;

export function updatePillLabel(): void {
  const label = document.getElementById("pill-label");
  if (!label) return;
  const remaining = remainingCount(store.state);
  label.textContent = `oxidized - ${remaining} ${remaining === 1 ? "task" : "tasks"}`;
}

/** Pulse the pill so a capture is noticeable while the panel is collapsed. */
export function flashPill(): void {
  const panel = panelEl();
  if (!panel || !ui.pill) return;
  panel.classList.remove("pill-flash");
  void panel.offsetWidth; // restart the animation on rapid captures
  panel.classList.add("pill-flash");
  if (pillFlashTimer) clearTimeout(pillFlashTimer);
  pillFlashTimer = setTimeout(() => panel.classList.remove("pill-flash"), FLASH_MS);
}

export function minimizeToPill(): void {
  if (ui.pill) return;
  const panel = panelEl();
  if (!panel) return;
  ui.pill = true;
  const generation = ++morphGeneration;
  closeMenu();
  // the hidden panel must not keep receiving keystrokes
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  // mid-morph the panel has an in-between size — keep the last full one
  if (!panel.classList.contains("morphing")) {
    prePillW = panel.offsetWidth;
    prePillH = panel.offsetHeight;
  }
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
  // once the morph is done, shrink the actual window (desktop); main snapshots
  // the native frame first so expanding restores it exactly
  setTimeout(() => {
    if (generation !== morphGeneration) return;
    platform.pillShrink(PILL_W + PILL_WINDOW_MARGIN, PILL_H + PILL_WINDOW_MARGIN);
  }, SHRINK_WINDOW_AFTER_MS);
}

export function expandFromPill(): void {
  if (!ui.pill) return;
  const panel = panelEl();
  if (!panel) return;
  ui.pill = false;
  const generation = ++morphGeneration;
  // grow the window first so the panel has room to morph back — main restores
  // the exact native frame it snapshotted at minimize (sizes can't stack)
  platform.pillRestore();
  requestAnimationFrame(() => {
    if (generation !== morphGeneration) return;
    panel.classList.remove("pill", "pill-flash");
    panel.style.width = prePillW + "px";
    panel.style.height = prePillH + "px";
    sounds.pop();
    setTimeout(() => {
      if (generation !== morphGeneration) return;
      panel.style.width = "";
      panel.style.height = "";
      panel.classList.remove("morphing");
    }, MORPH_CLEANUP_AFTER_MS);
  });
}
