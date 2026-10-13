// Settings → General: how the panel looks and behaves.

import { setCaptureTarget } from "../../actions";
import { h } from "../../dom";
import { visibleSections } from "../../notes";
import { isDesktop } from "../../platform";
import { store, updateSettings as update } from "../../store";
import { setTheme } from "../../theme";
import { segmentedRow, selectRow, toggleRow } from "../controls";

export function generalRows(): HTMLElement[] {
  const { settings, state } = store;
  const rows: HTMLElement[] = [
    segmentedRow(
      "Appearance",
      "Follow the system or force a look",
      [
        { value: "system", label: "Auto" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
      settings.theme,
      (theme) => setTheme(theme)
    ),
    toggleRow("Sounds", "Little pops and blips on actions", settings.sounds, (v) =>
      update((s) => (s.sounds = v))
    ),
  ];

  if (isDesktop) {
    rows.push(
      toggleRow("Keep on top", "Float above other windows", settings.alwaysOnTop, (v) =>
        update((s) => (s.alwaysOnTop = v))
      ),
      toggleRow(
        "Launch at login",
        "Start Oxide when you sign in to this computer",
        settings.launchAtLogin,
        (v) => update((s) => (s.launchAtLogin = v))
      )
    );
  }

  rows.push(h("div", "set-group", "Notes"));
  const targets = visibleSections(state);
  if (targets.length > 0) {
    const active = targets.find((section) => section.id === state.activeSectionId) ?? targets[0];
    rows.push(
      selectRow(
        "Default section",
        "Where captures and new notes land",
        targets.map((section) => ({ value: section.id, label: section.title })),
        active.id,
        (sectionId) => setCaptureTarget(sectionId)
      )
    );
  }
  rows.push(
    toggleRow("Hide completed", "Keep done notes out of the main list", settings.hideCompleted, (v) =>
      update((s) => (s.hideCompleted = v))
    ),
    toggleRow(
      "Complete on copy",
      "Mark notes as done after copying them as a list",
      settings.autoCompleteOnCopy,
      (v) => update((s) => (s.autoCompleteOnCopy = v))
    )
  );

  if (!isDesktop) {
    rows.push(h("div", "set-note", "Global shortcuts are available in the desktop app."));
  }
  return rows;
}
