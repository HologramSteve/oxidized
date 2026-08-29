// Build the desktop app's bundles:
//   dist-electron/main.js     Electron main process (Node/CJS)
//   dist-electron/preload.js  sandboxed preload bridge (Node/CJS)
//   dist-renderer/*           renderer bundle + static files (browser)
// Run manually with `bun scripts/build-app.ts`; `bun run build` then packages
// the results with electron-builder.

import { mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

export async function buildApp(opts: { renderer?: boolean } = {}): Promise<void> {
  const { renderer = true } = opts;

  rmSync(join(root, "dist-electron"), { recursive: true, force: true });
  if (renderer) rmSync(join(root, "dist-renderer"), { recursive: true, force: true });
  mkdirSync(join(root, "dist-electron"), { recursive: true });

  const results = [];
  results.push(
    await Bun.build({
      entrypoints: [join(root, "src/main/index.ts")],
      target: "node",
      format: "cjs",
      // electron must stay external: Electron's main process provides the API
      // at runtime; bundling node_modules/electron/index.js would give us the
      // binary path string instead
      external: ["electron"],
      outdir: join(root, "dist-electron"),
      naming: "main.js",
    })
  );
  results.push(
    await Bun.build({
      entrypoints: [join(root, "src/main/preload.ts")],
      target: "node",
      format: "cjs",
      external: ["electron"],
      outdir: join(root, "dist-electron"),
      naming: "preload.js",
    })
  );
  if (renderer) {
    results.push(
      await Bun.build({
        entrypoints: [join(root, "src/mainview/index.ts")],
        target: "browser",
        outdir: join(root, "dist-renderer"),
        naming: "index.js",
      })
    );
    mkdirSync(join(root, "dist-renderer"), { recursive: true });
    cpSync(join(root, "src/mainview/index.html"), join(root, "dist-renderer/index.html"));
    cpSync(join(root, "src/mainview/style.css"), join(root, "dist-renderer/style.css"));
  }

  for (const r of results) {
    if (!r.success) {
      console.error(...r.logs);
      throw new Error("bundle failed");
    }
  }
  console.log(
    "[build-app] dist-electron/main.js, dist-electron/preload.js" +
      (renderer ? ", dist-renderer/*" : "") +
      " written"
  );
}

if (import.meta.main) {
  await buildApp();
}