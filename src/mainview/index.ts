// Oxide — floating, keyboard-first scratchpad for scattered AI work.
// Runs both as a plain website and inside the Electron window.
//
// This file is only the entry point; the app itself starts in ./app.ts.
// The release workflow rewrites the version line below (and package.json),
// so it must stay here, in exactly this form, exactly once.

import { boot } from "./app";

const APP_VERSION = "1.1.1";

void boot(APP_VERSION);
