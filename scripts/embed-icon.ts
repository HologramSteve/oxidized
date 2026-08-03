// Embed assets/icon.ico into the built launcher.exe / bun.exe.
// Electrobun's compiled CLI tries this itself but its bundled rcedit path is
// broken (upstream bug: it resolves to their CI machine's path), so we do it
// ourselves after a build. Run manually with `bun scripts/embed-icon.ts`
// (e.g. for build/dev while the dev server is stopped).

import { join, dirname } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = dirname(import.meta.dir);
const ico = join(root, "assets", "icon.ico");
// Electrobun runs this as postBuild before packaging. Its environment points
// at the exact platform/environment build folder; keep the root fallback for
// manual runs such as `bun run embed-icon`.
const buildDir = process.env.ELECTROBUN_BUILD_DIR || join(root, "build");

if (process.platform !== "win32") {
  console.log("[embed-icon] Windows only, skipping");
  process.exit(0);
}
if (!existsSync(ico)) {
  console.error("[embed-icon] assets/icon.ico not found");
  process.exit(1);
}
if (!existsSync(buildDir)) {
  console.log("[embed-icon] no build/ folder yet — run a build first");
  process.exit(0);
}

const rceditDir = join(root, "node_modules", "rcedit", "bin");
const rcedit = ["rcedit-x64.exe", "rcedit.exe"]
  .map((n) => join(rceditDir, n))
  .find(existsSync);
if (!rcedit) {
  console.error("[embed-icon] rcedit binary not found — run `bun install`");
  process.exit(1);
}

const targets: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^(launcher|bun)\.exe$/i.test(entry)) targets.push(p);
  }
};
walk(buildDir);

if (targets.length === 0) {
  console.log("[embed-icon] no launcher.exe / bun.exe found under build/");
  process.exit(0);
}

let ok = 0;
for (const exe of targets) {
  try {
    execFileSync(rcedit, [exe, "--set-icon", ico]);
    console.log("[embed-icon] ✓", exe);
    ok++;
  } catch (err) {
    // a running dev instance keeps its exe locked — that's fine, skip it
    console.warn("[embed-icon] ✗ skipped (in use?):", exe);
  }
}
console.log(`[embed-icon] done — ${ok}/${targets.length} embedded`);
