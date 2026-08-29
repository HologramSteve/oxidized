// Dev orchestrator: build the main process + preload once, make sure the web
// dev server (serve.ts, live-bundles the view) is up, then launch Electron
// pointed at it (OXIDE_DEV=1). Main-process changes need a restart (Ctrl+C);
// view code hot-reloads through serve.ts.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { buildApp } from "./build-app";

const root = join(import.meta.dir, "..");
const DEV_URL = "http://localhost:4820";

async function isDevServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL + "/index.js");
    return res.ok;
  } catch {
    return false;
  }
}

await buildApp({ renderer: false });

let server: ChildProcess | null = null;
if (!(await isDevServerUp())) {
  console.log("[dev] starting web dev server on", DEV_URL);
  server = spawn(process.execPath, ["serve.ts"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  for (let i = 0; i < 50 && !(await isDevServerUp()); i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!(await isDevServerUp())) {
    console.error("[dev] dev server did not start");
    server?.kill();
    process.exit(1);
  }
} else {
  console.log("[dev] reusing existing dev server on", DEV_URL);
}

const electronCli = join(root, "node_modules", "electron", "cli.js");
console.log("[dev] launching Electron");
const electron = spawn(process.execPath, [electronCli, "."], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, OXIDE_DEV: "1" },
});

const cleanup = () => {
  electron.kill();
  server?.kill();
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
electron.on("exit", () => {
  server?.kill();
  process.exit(0);
});
