// Row widgets for the Settings pages. Each builds a .set-row with
// a label on the left and one control on the right; controls update their
// own look on interaction and report the new value through a callback.

import { acceleratorFromKeyPress, displayAccelerator } from "../accelerator";
import { h } from "../dom";
import { showMenu } from "../menu";
import { sounds } from "../sounds";

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

/** A .set-row with its title and subtitle; the caller appends the control. */
function labeledRow(title: string, sub: string): HTMLElement {
  const row = h("div", "set-row");
  const label = h("div", "set-label", title);
  label.appendChild(h("small", undefined, sub));
  row.appendChild(label);
  return row;
}

export function actionRow(title: string, sub: string, label: string, onClick: () => void): HTMLElement {
  const row = labeledRow(title, sub);
  const btn = h("button", "mini-btn", label);
  btn.addEventListener("click", onClick);
  row.appendChild(btn);
  return row;
}

export function toggleRow(
  title: string,
  sub: string,
  value: boolean,
  onChange: (value: boolean) => void
): HTMLElement {
  const row = labeledRow(title, sub);
  const sw = h("button", "switch" + (value ? " on" : ""));
  sw.addEventListener("click", () => {
    onChange(sw.classList.toggle("on"));
    sounds.pop();
  });
  row.appendChild(sw);
  return row;
}

export function segmentedRow<T extends string>(
  title: string,
  sub: string,
  options: Option<T>[],
  current: T,
  onChange: (value: T) => void
): HTMLElement {
  const row = labeledRow(title, sub);
  const seg = h("div", "seg");
  for (const opt of options) {
    const btn = h("button", "seg-btn" + (opt.value === current ? " on" : ""), opt.label);
    btn.addEventListener("click", () => {
      if (btn.classList.contains("on")) return;
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      onChange(opt.value);
      sounds.pop();
    });
    seg.appendChild(btn);
  }
  row.appendChild(seg);
  return row;
}

export function selectRow<T extends string>(
  title: string,
  sub: string,
  options: Option<T>[],
  current: T,
  onChange: (value: T) => void
): HTMLElement {
  const row = labeledRow(title, sub);

  // not a native <select>: its popup is clipped at the frameless window edge
  // and the overflowing part can't be clicked. The custom menu stays inside
  // the current window (and scrolls if it's taller).
  let cur = current;
  const field = h("button", "select-field");
  const setLabel = () => {
    field.textContent = options.find((o) => o.value === cur)?.label ?? cur;
    field.appendChild(h("span", "select-caret", "▾"));
  };
  setLabel();
  field.addEventListener("click", (e) => {
    // the document-level click handler closes menus — don't kill this one
    e.stopPropagation();
    const r = field.getBoundingClientRect();
    showMenu(
      r.left,
      r.bottom + 4,
      options.map((o) => ({
        label: o.label,
        checked: o.value === cur,
        action: () => {
          if (o.value === cur) return;
          cur = o.value;
          setLabel();
          onChange(o.value);
          sounds.pop();
        },
      }))
    );
  });
  row.appendChild(field);
  return row;
}

export function numberRow(
  title: string,
  sub: string,
  value: number,
  opts: { min: number; max: number; step: number; suffix: string },
  onChange: (value: number) => void
): HTMLElement {
  const row = labeledRow(title, sub);
  let cur = value;

  const field = h("div", "num-field");
  const input = h("input");
  input.type = "number";
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(value);
  input.addEventListener("change", () => {
    let next = Math.round(Number(input.value));
    // an emptied or unparsable field snaps back to the last good value
    if (input.value.trim() === "" || !Number.isFinite(next)) next = cur;
    next = Math.max(opts.min, Math.min(opts.max, next));
    input.value = String(next);
    if (next === cur) return;
    cur = next;
    onChange(next);
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
  });
  field.appendChild(input);
  field.appendChild(h("span", "num-suffix", opts.suffix));
  row.appendChild(field);
  return row;
}

// Only one recorder listens for keys at a time. The active one is stopped
// when another starts and when its page goes away (see stopShortcutRecording).
let stopRecording: (() => void) | null = null;

/** Abort an in-progress shortcut recording, if any. */
export function stopShortcutRecording(): void {
  stopRecording?.();
}

export function shortcutRow(
  title: string,
  sub: string,
  current: string,
  onChange: (accelerator: string) => void
): HTMLElement {
  const row = labeledRow(title, sub);

  let cur = current;
  const field = h("button", "shortcut-field", displayAccelerator(cur));
  field.title = "Click, then press a key combo. Backspace clears it, Esc cancels.";
  field.addEventListener("click", () => {
    if (field.classList.contains("recording")) return;
    stopShortcutRecording();
    field.classList.add("recording");
    field.textContent = "Press keys…";

    const finish = () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      field.classList.remove("recording");
      field.textContent = displayAccelerator(cur);
      if (stopRecording === finish) stopRecording = null;
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        finish();
        return;
      }
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      const clear = bare && (e.key === "Backspace" || e.key === "Delete");
      // otherwise keeps waiting until a usable combo arrives (a modifier plus a key)
      const accelerator = clear ? "" : acceleratorFromKeyPress(e);
      if (accelerator === null) return;
      if (accelerator === cur) {
        finish();
        return;
      }
      cur = accelerator;
      finish();
      onChange(accelerator);
      sounds.pop();
    };
    // clicking elsewhere abandons the recording instead of leaving it armed
    // (not on blur: activating the window fires a transient one)
    const onPointerDown = (e: PointerEvent) => {
      if (!field.contains(e.target as Node)) finish();
    };
    stopRecording = finish;
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
  });
  row.appendChild(field);
  return row;
}
