// The panel shell: one persistent .panel holding the current view, the pill
// face and the resize grip. It is the single renderer registered with the
// scheduler — every invalidate() ends up in render() below.

import { appRoot, DRAG_CLASS, h } from "./dom";
import { expandFromPill, updatePillLabel } from "./pill";
import { isDesktop } from "./platform";
import { invalidate, flushRender, setRenderer, type Scope } from "./render";
import { attachResizeGrip } from "./resize";
import { ui, type View } from "./ui";
import { stopShortcutRecording } from "./views/controls";
import { createListView, renderList } from "./views/list";
import { createSettingsView, type SettingsView } from "./views/settings";

// the list view keeps its DOM for the whole session, so the search box and a
// half-typed note survive a trip to Settings
let listNodes: HTMLElement[] | null = null;
let settingsView: SettingsView | null = null;
let mounted: { view: View; nodes: HTMLElement[] } | null = null;
let pillFace: HTMLElement;

/**
 * Pill face — shown only when minimized. The whole pill is a drag handle;
 * a click (without movement) expands it back.
 */
function buildPillFace(): HTMLElement {
  const face = h("div", "pill-face" + (isDesktop ? ` ${DRAG_CLASS}` : ""));
  face.appendChild(h("div", "pill-grip"));
  const label = h("button", "pill-label");
  label.id = "pill-label";
  label.title = "Click to expand · drag to move";
  // window-move keeps the cursor over the label, so a drag still ends in a
  // click — only expand when the mouse didn't actually travel
  let downAt: { x: number; y: number } | null = null;
  face.addEventListener("mousedown", (e) => {
    downAt = { x: e.screenX, y: e.screenY };
  });
  face.addEventListener("click", (e) => {
    if (!downAt) return;
    const moved = Math.abs(e.screenX - downAt.x) + Math.abs(e.screenY - downAt.y) > 4;
    downAt = null;
    if (!moved) expandFromPill();
  });
  face.appendChild(label);
  return face;
}

function nodesFor(view: View): HTMLElement[] {
  if (view === "list") return (listNodes ??= createListView().nodes);
  return (settingsView = createSettingsView()).nodes;
}

/** Swap the view's nodes into the panel. Returns true when the view changed. */
function showView(view: View): boolean {
  if (mounted?.view === view) return false;
  stopShortcutRecording();
  for (const node of mounted?.nodes ?? []) node.remove();
  const nodes = nodesFor(view);
  pillFace.before(...nodes);
  mounted = { view, nodes };
  return true;
}

function render(dirty: ReadonlySet<Scope>): void {
  const changed = showView(ui.view);
  if (ui.view === "list") {
    if (changed || dirty.has("list")) renderList();
  } else if (ui.view === "settings" && !changed && dirty.has("settings")) {
    // a freshly built page is already current
    stopShortcutRecording();
    settingsView?.refresh();
  }
  updatePillLabel();
}

/** Build the panel and draw the first frame. */
export function mountShell(): void {
  const panel = h("div", "panel");
  pillFace = buildPillFace();
  panel.appendChild(pillFace);
  attachResizeGrip(panel);
  appRoot.replaceChildren(panel);

  setRenderer(render);
  invalidate();
  flushRender();
}
