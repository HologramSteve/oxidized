// Resize grip (frameless windows have no native resize edges).

import { MIN_WINDOW } from "../shared/types";
import { appRoot, h, NO_DRAG_CLASS } from "./dom";
import { isDesktop, platform } from "./platform";

export function attachResizeGrip(panel: HTMLElement): void {
  const grip = h("div", "resize-grip" + (isDesktop ? ` ${NO_DRAG_CLASS}` : ""));
  grip.title = "Drag to resize";

  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    if (isDesktop) resizeWindow(grip);
    else resizeInPage(grip, e);
  });

  panel.appendChild(grip);
}

/**
 * Desktop: main tracks the cursor in DIP and resizes the window (and saves
 * the new frame); renderer screenX is unreliable on a transparent layered
 * HWND, and grab-anywhere would otherwise steal the gesture.
 */
function resizeWindow(grip: HTMLElement): void {
  const ENDINGS = ["pointerup", "pointercancel", "lostpointercapture"] as const;
  const end = () => {
    for (const type of ENDINGS) grip.removeEventListener(type, end);
    platform.windowResizeEnd();
  };
  for (const type of ENDINGS) grip.addEventListener(type, end);
  platform.windowResizeStart();
}

/** Browser: the "window" is the #app box in the page. */
function resizeInPage(grip: HTMLElement, start: PointerEvent): void {
  const startW = appRoot.clientWidth;
  const startH = appRoot.clientHeight;
  let width = startW;
  let height = startH;
  let raf = 0;

  const move = (e: PointerEvent) => {
    width = Math.max(MIN_WINDOW.width, Math.round(startW + (e.screenX - start.screenX)));
    height = Math.max(MIN_WINDOW.height, Math.round(startH + (e.screenY - start.screenY)));
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      appRoot.style.width = width + "px";
      appRoot.style.height = height + "px";
    });
  };
  const end = () => {
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", end);
    grip.removeEventListener("pointercancel", end);
  };
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}
