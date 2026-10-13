// Boot: load settings and notes, build the panel, wire up input.
//
// Module map —
//   platform.ts   desktop (window.oxide) vs. browser (localStorage)
//   store.ts      persisted state + settings, saving        ui.ts  transient UI state
//   notes.ts      pure operations on the notes state        actions.ts  user commands
//   render.ts     render scheduler                          shell.ts    panel + view switching
//   views/        list, settings, info, shared row widgets

import type { CapturePayload } from "../shared/ipc";
import { mergeSettings } from "../shared/settings";
import { parseStateJson } from "../shared/state";
import type { AppState } from "../shared/types";
import { addNote, refreshDisplays } from "./actions";
import { initGrabAnywhere } from "./grab";
import { initKeyboard } from "./keyboard";
import { initMenuDismissal } from "./menu";
import { seedState } from "./notes";
import { expandFromPill, flashPill } from "./pill";
import { isDesktop, platform } from "./platform";
import { mountShell } from "./shell";
import { setSoundsEnabled, sounds } from "./sounds";
import { env, flushState, persist, store } from "./store";
import { initTheme } from "./theme";
import { toast } from "./toast";
import { ui } from "./ui";

async function loadSettings(): Promise<void> {
  try {
    store.settings = mergeSettings(await platform.loadSettings());
  } catch (err) {
    console.error("[oxide] failed to load settings", err);
  }
  setSoundsEnabled(store.settings.sounds);
}

/** The saved notes, or null on a first run (or when they can't be read). */
async function loadState(): Promise<AppState | null> {
  try {
    const raw = await platform.loadState();
    if (!raw) return null;
    const state = parseStateJson(raw);
    // about to be replaced by the first-run notes: keep what was there
    if (!state) platform.stashUnreadableState(raw);
    return state;
  } catch (err) {
    console.error("[oxide] failed to load state", err);
    return null;
  }
}

function onCapture({ text }: CapturePayload): void {
  if (!addNote(text)) return;
  sounds.capture();
  if (ui.pill) {
    if (store.settings.expandOnCapture) expandFromPill();
    else flashPill();
  }
  toast("Captured");
}

/** Save pending edits whenever the panel might be about to go away. */
function flushOnExit(): void {
  const flush = () => void flushState();
  window.addEventListener("blur", flush);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
}

export async function boot(version: string): Promise<void> {
  env.version = version;
  if (!isDesktop) document.body.classList.add("web-mode");

  await loadSettings();
  initTheme();
  initMenuDismissal();
  initKeyboard();
  initGrabAnywhere();
  void refreshDisplays();
  platform.dataLocation().then(
    (location) => {
      if (location) env.dataLocation = location;
    },
    (err: unknown) => console.error("[oxide] failed to read app info", err)
  );

  const loaded = await loadState();
  store.state = loaded ?? seedState();
  if (!loaded) persist();

  mountShell();
  // only now: a capture needs the real notes to land in
  platform.onCapture(onCapture);
  flushOnExit();
}
