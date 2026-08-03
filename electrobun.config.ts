export default {
  app: {
    name: "Oxide",
    identifier: "nl.stevenrs.oxide",
    version: "1.0.1",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/style.css": "views/mainview/style.css",
      "assets/icon.ico": "assets/icon.ico",
    },
    win: {
      // installer, shortcuts and taskbar icon for packaged builds
      icon: "assets/icon.ico",
    },
  },
  scripts: {
    // Embed the icon before Electrobun archives the Windows app bundle.
    postBuild: "./scripts/embed-icon.ts",
  },
};
