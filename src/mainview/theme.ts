// Appearance: resolves the theme setting to data-theme on <html>.
// (index.html applies it once before first paint to avoid a flash.)

import type { ThemePreference } from "../shared/types";
import { saveSettings, store } from "./store";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(): void {
  const { theme } = store.settings;
  const dark = theme === "dark" || (theme === "system" && darkQuery.matches);
  const resolved = dark ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function setTheme(preference: ThemePreference): void {
  store.settings.theme = preference;
  applyTheme();
  void saveSettings();
}

/** Follow the system theme while the setting is "system". Call once at boot. */
export function initTheme(): void {
  darkQuery.addEventListener("change", () => {
    if (store.settings.theme === "system") applyTheme();
  });
  applyTheme();
}
