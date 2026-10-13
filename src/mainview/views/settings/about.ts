// Settings → About: what this is, which version, where to find more.

import { h } from "../../dom";
import { LOGO_DARK, LOGO_LIGHT } from "../../logo";
import { platform } from "../../platform";
import { env } from "../../store";
import { actionRow } from "../controls";

const GITHUB_URL = "https://github.com/HologramSteve/oxidized";
const X_URL = "https://x.com/deepseekailover";

export function aboutRows(): HTMLElement[] {
  const hero = h("div", "info-hero");
  const mark = h("div", "info-mark");
  for (const [src, cls] of [
    [LOGO_LIGHT, "logo-light"],
    [LOGO_DARK, "logo-dark"],
  ] as const) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "oxidized logo";
    img.className = cls;
    img.draggable = false;
    mark.appendChild(img);
  }
  hero.appendChild(mark);
  hero.appendChild(h("div", "info-logo", "oxidized"));
  hero.appendChild(h("div", "info-version", `v${env.version} · open source`));
  hero.appendChild(
    h(
      "div",
      "info-desc",
      "A floating, keyboard-first scratchpad for scattered AI work. Double-tap to capture text from anywhere, stage prompts, copy batches as lists."
    )
  );

  const linkRow = (title: string, sub: string, url: string) =>
    actionRow(title, sub, "Open", () => platform.openExternal(url));

  return [
    hero,
    h("div", "set-group", "Links"),
    linkRow("GitHub", "Source code, issues and releases", GITHUB_URL),
    linkRow("X / Twitter", "Follow the developer", X_URL),
    h(
      "div",
      "set-note",
      "Built with Bun + Electron. Inspired by Copper by shadcn. Everything stays on your machine."
    ),
  ];
}
