// Type for the Electron preload bridge exposed on window.oxide.
// Present only on desktop (the packaged app and the dev server via preload);
// on the plain website it stays undefined and the view falls back to
// localStorage (isDesktop = !!window.oxide).

import type { OxideDesktopApi } from "../shared/ipc";

declare global {
  interface Window {
    oxide?: OxideDesktopApi;
  }
}

export {};
