// Settings: a top bar, a row of tabs, and one short page per tab.
//
// To add a page: add its id to SettingsTab (ui.ts), write a function that
// returns its rows, and list it in TABS below.

import { navigateTo } from "../../actions";
import { DRAG_CLASS, h, NO_DRAG_CLASS } from "../../dom";
import { isDesktop } from "../../platform";
import { invalidate } from "../../render";
import { ui, type SettingsTab } from "../../ui";
import { aboutRows } from "./about";
import { dataRows } from "./data";
import { generalRows } from "./general";
import { shortcutRows } from "./shortcuts";

interface TabSpec {
  id: SettingsTab;
  label: string;
  rows(): HTMLElement[];
}

const TABS: TabSpec[] = [
  { id: "general", label: "General", rows: generalRows },
  // global shortcuts need the desktop app
  ...(isDesktop ? [{ id: "shortcuts" as const, label: "Shortcuts", rows: shortcutRows }] : []),
  { id: "data", label: "Data", rows: dataRows },
  { id: "about", label: "About", rows: aboutRows },
];

export interface SettingsView {
  /** Top bar, tabs and scrolling body — in panel order. */
  nodes: HTMLElement[];
  /** Rebuild the current page from state, keeping its scroll position. */
  refresh(): void;
}

function buildTopbar(): HTMLElement {
  const topbar = h("div", "topbar");
  if (isDesktop) topbar.classList.add(DRAG_CLASS);
  const back = h("button", `iconbtn ${NO_DRAG_CLASS}`, "‹");
  back.title = "Back (Esc)";
  back.addEventListener("click", () => navigateTo("list"));
  topbar.appendChild(back);
  topbar.appendChild(h("div", "settings-title", "Settings"));
  return topbar;
}

export function createSettingsView(): SettingsView {
  const body = h("div", "settings");
  const tabBar = h("div", "settings-tabs");
  const seg = h("div", "seg");
  const buttons = new Map<SettingsTab, HTMLElement>();
  for (const tab of TABS) {
    const btn = h("button", "seg-btn", tab.label);
    btn.addEventListener("click", () => {
      if (ui.settingsTab === tab.id) return;
      ui.settingsTab = tab.id;
      invalidate("settings");
    });
    buttons.set(tab.id, btn);
    seg.appendChild(btn);
  }
  tabBar.appendChild(seg);

  let shown: SettingsTab | null = null;
  const refresh = () => {
    const tab = TABS.find((candidate) => candidate.id === ui.settingsTab) ?? TABS[0];
    ui.settingsTab = tab.id;
    for (const [id, btn] of buttons) btn.classList.toggle("on", id === tab.id);
    // a rebuilt page stays where it was; a different page starts at the top
    const scrollTop = shown === tab.id ? body.scrollTop : 0;
    body.replaceChildren(...tab.rows());
    body.scrollTop = scrollTop;
    shown = tab.id;
  };
  refresh();
  return { nodes: [buildTopbar(), tabBar, body], refresh };
}
