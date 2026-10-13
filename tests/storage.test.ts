import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  describeDataDir,
  resolveDataPaths,
  SettingsStore,
  StateFile,
  writeFileAtomic,
  writeFileAtomicSync,
} from "../src/main/storage";
import { DEFAULT_SETTINGS } from "../src/shared/types";

const stateJson = (text: string) =>
  JSON.stringify({
    sections: [{ id: "s", title: "Inbox", collapsed: false, notes: [{ id: "n", text, done: false, createdAt: 1 }] }],
    activeSectionId: "s",
  });

let dir: string;
let file: string;
let opened: StateFile[] = [];

/** A StateFile the test cleanup waits for before deleting its folder. */
function openState(path: string, legacyPath?: string): StateFile {
  const store = new StateFile(path, legacyPath);
  opened.push(store);
  return store;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oxide-test-"));
  file = join(dir, "blobs", "notes.json");
});

afterEach(async () => {
  // background work (launch backup, queued writes) still holds files open
  await Promise.all(opened.map((store) => store.idle()));
  opened = [];
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const put = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
};
const quarantined = () =>
  existsSync(dirname(file)) ? readdirSync(dirname(file)).filter((f) => f.startsWith("notes.corrupt-")) : [];

describe("atomic writes", () => {
  test("replace the target and leave no temp file behind", async () => {
    const target = join(dir, "a.json");
    writeFileAtomicSync(target, "one");
    await writeFileAtomic(target, "two");
    expect(readFileSync(target, "utf8")).toBe("two");
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });
});

describe("StateFile", () => {
  test("a fresh install loads as null and saves cleanly", async () => {
    const store = openState(file);
    expect(await store.load()).toBeNull();
    expect(await store.save(stateJson("first"))).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(stateJson("first"));
    expect(quarantined()).toEqual([]);
  });

  test("loading a good file backs it up once per launch", async () => {
    put(file, stateJson("launch"));
    const store = openState(file);
    expect(await store.load()).toBe(stateJson("launch"));
    await store.save(stateJson("edited"));
    await store.load();
    await store.idle();
    // the backup still holds what the file looked like at launch
    expect(readFileSync(store.backupFile, "utf8")).toBe(stateJson("launch"));
    expect(readFileSync(file, "utf8")).toBe(stateJson("edited"));
  });

  test("rapid saves coalesce and the newest payload wins", async () => {
    const store = openState(file);
    await store.load();
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => store.save(stateJson(`v${n}`))));
    expect(results).toEqual([true, true, true, true, true]);
    expect(readFileSync(file, "utf8")).toBe(stateJson("v5"));
  });

  test("a corrupt file falls back to the backup and is kept aside", async () => {
    put(file, '{"sections": [ truncated');
    put(`${file}.bak`, stateJson("from backup"));
    const store = openState(file);
    expect(await store.load()).toBe(stateJson("from backup"));
    await store.save(stateJson("after recovery"));
    expect(quarantined()).toHaveLength(1);
    expect(readFileSync(join(dirname(file), quarantined()[0]), "utf8")).toBe('{"sections": [ truncated');
    expect(readFileSync(file, "utf8")).toBe(stateJson("after recovery"));
  });

  test("a corrupt file with no backup is never silently overwritten", async () => {
    put(file, "not json at all");
    const store = openState(file);
    expect(await store.load()).toBeNull();
    // the view seeds first-run notes and saves them
    await store.save(stateJson("seed"));
    await store.save(stateJson("seed 2"));
    expect(quarantined()).toHaveLength(1);
    expect(readFileSync(join(dirname(file), quarantined()[0]), "utf8")).toBe("not json at all");
  });

  test("valid JSON that isn't a notes file counts as corrupt", async () => {
    put(file, JSON.stringify({ hello: "world" }));
    const store = openState(file);
    expect(await store.load()).toBeNull();
    await store.save(stateJson("seed"));
    expect(quarantined()).toHaveLength(1);
  });

  test("migrates notes from the legacy location", async () => {
    const legacy = join(dir, "OxideNotes", "notes.json");
    put(legacy, stateJson("legacy"));
    const store = openState(file, legacy);
    expect(await store.load()).toBe(stateJson("legacy"));
    expect(readFileSync(file, "utf8")).toBe(stateJson("legacy"));
    expect(existsSync(legacy)).toBe(true);
  });
});

describe("SettingsStore", () => {
  test("starts from defaults when the file is missing or broken", () => {
    const settingsFile = join(dir, "settings.json");
    expect(new SettingsStore(settingsFile).current).toEqual(DEFAULT_SETTINGS);
    put(settingsFile, "{ nope");
    expect(new SettingsStore(settingsFile).current).toEqual(DEFAULT_SETTINGS);
  });

  test("replace() validates input and keeps the window frame main owns", () => {
    const settingsFile = join(dir, "settings.json");
    const settings = new SettingsStore(settingsFile);
    settings.setWindow({ width: 380, height: 680, x: 100, y: 200 });
    const next = settings.replace({
      theme: "dark",
      sounds: "broken",
      window: { width: 1, height: 1, x: 0, y: 0 },
    });
    expect(next.theme).toBe("dark");
    expect(next.sounds).toBe(true);
    expect(next.window).toEqual({ width: 380, height: 680, x: 100, y: 200 });
    // and it all reached the disk
    expect(new SettingsStore(settingsFile).current).toEqual(next);
  });
});

describe("data paths", () => {
  test("follow LOCALAPPDATA, with OXIDE_DATA_DIR as an override", () => {
    const win = resolveDataPaths({ LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" });
    expect(win.baseDir).toBe(join("C:\\Users\\me\\AppData\\Local", "oxidized"));
    expect(win.stateFile).toBe(join(win.baseDir, "blobs", "notes.json"));
    expect(describeDataDir(win, { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" })).toBe(
      "%LOCALAPPDATA%\\oxidized"
    );

    const custom = resolveDataPaths({ OXIDE_DATA_DIR: dir, LOCALAPPDATA: "C:\\x" });
    expect(custom.baseDir).toBe(dir);
    // shown relative to the home folder when it lives there
    const home = homedir();
    expect(describeDataDir(custom, { OXIDE_DATA_DIR: dir })).toBe(
      dir.startsWith(home) ? "~" + dir.slice(home.length) : dir
    );
  });
});
