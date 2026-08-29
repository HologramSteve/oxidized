// Website mode: serves the same UI that runs inside the Electron window.
// Usage: bun serve.ts  →  http://localhost:4820

const PORT = 4820;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    // Bundle the view entrypoint on the fly (dev-style, no caching)
    if (pathname === "/index.js") {
      const result = await Bun.build({
        entrypoints: ["./src/mainview/index.ts"],
        target: "browser",
        sourcemap: "inline",
      });
      if (!result.success) {
        console.error(...result.logs);
        return new Response("// build failed:\n" + result.logs.join("\n"), {
          status: 500,
          headers: { "content-type": "text/javascript" },
        });
      }
      return new Response(await result.outputs[0].text(), {
        headers: { "content-type": "text/javascript" },
      });
    }

    const file = Bun.file("./src/mainview" + pathname);
    if (await file.exists()) return new Response(file);
    return new Response("not found", { status: 404 });
  },
});

console.log(`Oxide (web mode) → http://localhost:${PORT}`);
