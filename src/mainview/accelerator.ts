// Turns a key press into an Electron accelerator string for the global
// shortcut recorder. Pure (takes the few KeyboardEvent fields it needs), so
// it is covered by tests/accelerator.test.ts.

export interface KeyPress {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

// KeyboardEvent.key → Electron accelerator key, where the names differ
const NAMED_KEYS: Record<string, string> = {
  " ": "Space",
  "+": "Plus",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/** True for a bare modifier press — the recorder keeps waiting for a real key. */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

function acceleratorKey(press: KeyPress): string | null {
  // digits by physical key, so Shift+1 records "1" rather than "!"
  const digit = /^Digit(\d)$/.exec(press.code);
  if (digit) return digit[1];
  if (/^F\d{1,2}$/.test(press.key)) return press.key;
  const named = NAMED_KEYS[press.key];
  if (named) return named;
  // letters and punctuation by the character the layout produces
  if (press.key.length === 1) return press.key.toUpperCase();
  return null; // dead keys, media keys, IME composition, …
}

/**
 * The accelerator for a key press, or null when it can't be one: global
 * shortcuts need at least one modifier and a key Electron can name.
 */
export function acceleratorFromKeyPress(press: KeyPress): string | null {
  if (isModifierKey(press.key)) return null;
  const mods: string[] = [];
  if (press.ctrlKey || press.metaKey) mods.push("CommandOrControl");
  if (press.altKey) mods.push("Alt");
  if (press.shiftKey) mods.push("Shift");
  if (mods.length === 0) return null;
  const key = acceleratorKey(press);
  return key ? [...mods, key].join("+") : null;
}

/** Human-readable form for the settings UI. */
export function displayAccelerator(accelerator: string): string {
  return accelerator ? accelerator.replace("CommandOrControl", "Ctrl") : "None";
}
