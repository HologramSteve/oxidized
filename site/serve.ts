// Local-only Oxide page. bun run site  →  http://localhost:4840

const PORT = 4840;
const root = import.meta.dir;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(root + pathname);
    if (await file.exists()) return new Response(file);
    return new Response("not found", { status: 404 });
  },
});

console.log(`Oxide (local site) → http://localhost:${PORT}`);
