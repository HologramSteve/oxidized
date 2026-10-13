// Local storage — everything under one data directory:
//   settings.json           app settings (shortcuts, sounds, …)
//   blobs/notes.json        note data
//   blobs/notes.json.bak    the notes as they were at the last launch
// No cloud, no accounts. (Copper-style.)
//
// Node-only (no Electron imports), so it can be unit-tested with `bun test`.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mergeSettings } from "../shared/settings";
import { parseStateJson } from "../shared/state";
import type { OxideSettings, WindowFrame } from "../shared/types";

export interface DataPaths {
  baseDir: string;
  blobsDir: string;
  settingsFile: string;
  stateFile: string;
  // pre-0.2 location, migrated on first load
  legacyStateFile: string;
}

/** OXIDE_DATA_DIR overrides the location (handy for dev runs and tests). */
export function resolveDataPaths(env: NodeJS.ProcessEnv = process.env): DataPaths {
  const baseDir =
    env.OXIDE_DATA_DIR || join(env.LOCALAPPDATA || join(homedir(), ".local", "share"), "oxidized");
  const blobsDir = join(baseDir, "blobs");
  return {
    baseDir,
    blobsDir,
    settingsFile: join(baseDir, "settings.json"),
    stateFile: join(blobsDir, "notes.json"),
    legacyStateFile: join(env.APPDATA || homedir(), "OxideNotes", "notes.json"),
  };
}

/** The data directory, shortened for display in Settings. */
export function describeDataDir(paths: DataPaths, env: NodeJS.ProcessEnv = process.env): string {
  if (!env.OXIDE_DATA_DIR && env.LOCALAPPDATA) return "%LOCALAPPDATA%\\oxidized";
  const home = homedir();
  return paths.baseDir.startsWith(home) ? "~" + paths.baseDir.slice(home.length) : paths.baseDir;
}

export function ensureDataDirs(paths: DataPaths): void {
  mkdirSync(paths.blobsDir, { recursive: true });
}

/** Screenshots were dropped in 1.1.1 — clear out what older builds left behind. */
export function removeLeftoverShots(paths: DataPaths): void {
  const leftoverShots = join(paths.blobsDir, "shots");
  if (!existsSync(leftoverShots)) return;
  try {
    rmSync(leftoverShots, { recursive: true, force: true });
  } catch (err) {
    console.error("[oxide] failed to remove leftover shots:", err);
  }
}

// ---------------------------------------------------------------------------
// Atomic writes: write a sibling temp file, then rename it over the target,
// so a crash mid-write can never leave a truncated file behind.
// ---------------------------------------------------------------------------

// Windows reports these while antivirus or the search indexer briefly holds
// the target open; the rename usually succeeds a moment later.
const TRANSIENT_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 5;

function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as NodeJS.ErrnoException).code : undefined;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data, { encoding: "utf8", flush: true });
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      if (!TRANSIENT_CODES.has(errorCode(err) ?? "")) throw err;
      if (attempt >= RENAME_ATTEMPTS) break;
      await sleep(40 * attempt);
    }
  }
  // the target stayed locked against renames — a plain overwrite may still work
  await writeFile(file, data, { encoding: "utf8", flush: true });
  rmSync(tmp, { force: true });
}

export function writeFileAtomicSync(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data, "utf8");
  try {
    renameSync(tmp, file);
  } catch (err) {
    if (!TRANSIENT_CODES.has(errorCode(err) ?? "")) throw err;
    writeFileSync(file, data, "utf8");
    rmSync(tmp, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

type ReadResult = { kind: "ok"; text: string } | { kind: "missing" } | { kind: "bad"; reason: unknown };

async function readStateFile(file: string): Promise<ReadResult> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    return errorCode(err) === "ENOENT" ? { kind: "missing" } : { kind: "bad", reason: err };
  }
  return parseStateJson(text) ? { kind: "ok", text } : { kind: "bad", reason: "not a valid notes file" };
}

/**
 * The notes file. Loads fall back to the launch backup when the main file is
 * unreadable; saves are atomic, serialized, and coalesced (only the newest
 * pending payload is written). A file we couldn't make sense of is copied
 * aside before the first save overwrites it — notes are never silently lost.
 */
export class StateFile {
  // true once this session has read the on-disk file successfully (or found
  // none); until then it holds data we don't understand and must preserve
  private verified = false;
  // the once-per-launch backup; also tells us it has been started
  private backup: Promise<void> | null = null;
  private pending: string | null = null;
  private draining: Promise<void> | null = null;
  private lastWriteOk = true;

  constructor(
    private readonly file: string,
    private readonly legacyFile?: string
  ) {}

  get backupFile(): string {
    return `${this.file}.bak`;
  }

  async load(): Promise<string | null> {
    // a renderer reload can ask for the state while its last save is in flight
    await this.idle();
    this.migrateLegacy();

    const main = await readStateFile(this.file);
    if (main.kind === "missing") {
      this.verified = true;
      return null;
    }
    if (main.kind === "ok") {
      this.verified = true;
      this.backup ??= this.writeBackup(main.text);
      return main.text;
    }

    console.error("[oxide] notes file is unreadable:", main.reason);
    const backup = await readStateFile(this.backupFile);
    if (backup.kind === "ok") {
      console.warn("[oxide] restored notes from", this.backupFile);
      return backup.text;
    }
    return null;
  }

  /** Queue a write. Resolves once this payload (or a newer one) is on disk. */
  save(json: string): Promise<boolean> {
    this.pending = json;
    this.draining ??= this.drain();
    return this.draining.then(() => this.lastWriteOk);
  }

  /** Resolves when no write (notes or launch backup) is queued or in flight. */
  async idle(): Promise<void> {
    await this.backup;
    await this.draining;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending !== null) {
        const data = this.pending;
        this.pending = null;
        this.lastWriteOk = await this.writeOnce(data);
      }
    } finally {
      this.draining = null;
    }
  }

  private async writeOnce(data: string): Promise<boolean> {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      if (!this.verified) {
        this.quarantine();
        this.verified = true;
      }
      await writeFileAtomic(this.file, data);
      return true;
    } catch (err) {
      console.error("[oxide] failed to write state:", err);
      return false;
    }
  }

  // one-time migration from the old location
  private migrateLegacy(): void {
    if (!this.legacyFile || existsSync(this.file) || !existsSync(this.legacyFile)) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      copyFileSync(this.legacyFile, this.file);
      console.log("[oxide] migrated notes from", this.legacyFile);
    } catch (err) {
      console.error("[oxide] failed to migrate legacy notes:", err);
    }
  }

  /**
   * Snapshot the known-good notes once per launch. Written from the text that
   * was just read (not copied from the file), so a save racing the backup
   * can never leak this session's edits into it.
   */
  private async writeBackup(text: string): Promise<void> {
    try {
      await writeFileAtomic(this.backupFile, text);
    } catch (err) {
      console.error("[oxide] failed to back up notes:", err);
    }
  }

  /** Copy a file we couldn't read aside, so overwriting it loses nothing. */
  private quarantine(): void {
    if (!existsSync(this.file)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = join(dirname(this.file), `notes.corrupt-${stamp}.json`);
    try {
      copyFileSync(this.file, target);
      console.warn("[oxide] kept the unreadable notes file as", target);
    } catch (err) {
      console.error("[oxide] failed to preserve the unreadable notes file:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * In-memory settings backed by settings.json. Small and read at startup
 * before the window exists, so its I/O is synchronous.
 */
export class SettingsStore {
  private value: OxideSettings;

  constructor(private readonly file: string) {
    this.value = SettingsStore.read(file);
  }

  get current(): OxideSettings {
    return this.value;
  }

  /**
   * Replace the settings with a (validated) blob from the renderer. Window
   * geometry is owned by the main process, so the stored frame is kept.
   */
  replace(raw: unknown): OxideSettings {
    const next = mergeSettings(raw);
    next.window = this.value.window;
    this.value = next;
    this.save();
    return next;
  }

  setWindow(frame: WindowFrame): void {
    const prev = this.value.window;
    if (
      prev &&
      prev.width === frame.width &&
      prev.height === frame.height &&
      prev.x === frame.x &&
      prev.y === frame.y
    ) {
      return;
    }
    this.value.window = frame;
    this.save();
  }

  save(): boolean {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileAtomicSync(this.file, JSON.stringify(this.value, null, 2));
      return true;
    } catch (err) {
      console.error("[oxide] failed to write settings:", err);
      return false;
    }
  }

  private static read(file: string): OxideSettings {
    try {
      if (existsSync(file)) return mergeSettings(JSON.parse(readFileSync(file, "utf8")));
    } catch (err) {
      console.error("[oxide] failed to read settings, using defaults:", err);
    }
    return mergeSettings(null);
  }
}
