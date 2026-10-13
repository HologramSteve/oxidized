// Pure helpers of the view (no DOM needed).

import { describe, expect, test } from "bun:test";
import {
  acceleratorFromKeyPress,
  displayAccelerator,
  type KeyPress,
} from "../src/mainview/accelerator";
import { mdToHtml } from "../src/mainview/markdown";

describe("mdToHtml", () => {
  test("escapes HTML before anything else", () => {
    expect(mdToHtml(`<img src=x onerror="alert(1)"> & co`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; co"
    );
  });

  test("renders inline formatting", () => {
    expect(mdToHtml("**bold** and `code`")).toBe("<strong>bold</strong> and <code>code</code>");
    expect(mdToHtml("an *em* and _em_")).toBe("an <em>em</em> and <em>em</em>");
    expect(mdToHtml("a\nb")).toBe("a<br>b");
  });

  test("leaves underscores and asterisks inside words alone", () => {
    expect(mdToHtml("snake_case_name 2*3*4")).toBe("snake_case_name 2*3*4");
  });

  test("links markdown links and bare URLs, http(s) only", () => {
    expect(mdToHtml("[site](https://a.dev/x)")).toBe(
      '<a href="https://a.dev/x" rel="noopener">site</a>'
    );
    expect(mdToHtml("see https://a.dev/x_y_z.")).toBe(
      'see <a href="https://a.dev/x_y_z." rel="noopener">https://a.dev/x_y_z.</a>'
    );
    expect(mdToHtml("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });

  test("a quote can't break out of the href attribute", () => {
    const html = mdToHtml('[x](https://a.dev/"onmouseover="1)');
    expect(html).not.toContain('"onmouseover');
    expect(html).toContain("&quot;onmouseover=&quot;1");
  });
});

describe("acceleratorFromKeyPress", () => {
  const press = (key: string, code: string, mods: Partial<KeyPress> = {}): KeyPress => ({
    key,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  test("needs a modifier and a real key", () => {
    expect(acceleratorFromKeyPress(press("a", "KeyA"))).toBeNull();
    expect(acceleratorFromKeyPress(press("Shift", "ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKeyPress(press("Dead", "Quote", { ctrlKey: true }))).toBeNull();
  });

  test("builds Electron accelerators", () => {
    expect(acceleratorFromKeyPress(press("m", "KeyM", { ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+M"
    );
    expect(acceleratorFromKeyPress(press("k", "KeyK", { metaKey: true }))).toBe("CommandOrControl+K");
    expect(acceleratorFromKeyPress(press(" ", "Space", { ctrlKey: true, altKey: true }))).toBe(
      "CommandOrControl+Alt+Space"
    );
    expect(acceleratorFromKeyPress(press("F5", "F5", { altKey: true }))).toBe("Alt+F5");
  });

  test("uses names Electron understands for special keys", () => {
    expect(acceleratorFromKeyPress(press("ArrowUp", "ArrowUp", { ctrlKey: true }))).toBe(
      "CommandOrControl+Up"
    );
    expect(acceleratorFromKeyPress(press("+", "Equal", { ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+Plus"
    );
  });

  test("records digits by key, not by the shifted symbol", () => {
    expect(acceleratorFromKeyPress(press("!", "Digit1", { ctrlKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+1"
    );
  });
});

test("displayAccelerator", () => {
  expect(displayAccelerator("CommandOrControl+Shift+Space")).toBe("Ctrl+Shift+Space");
  expect(displayAccelerator("")).toBe("None");
});
