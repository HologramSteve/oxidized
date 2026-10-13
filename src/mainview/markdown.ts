// Markdown-lite renderer for note text (safe: escapes HTML first).
// Supports `code`, **bold**, *em* / _em_, [links](https://…) and bare URLs.

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function mdToHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" rel="noopener">$1</a>'
  );
  html = html.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" rel="noopener">$2</a>'
  );
  return html.replaceAll("\n", "<br>");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap search matches in <mark class="hl">. Works on the rendered text nodes,
 * so markdown tags and HTML entities stay intact.
 */
export function highlightMatches(root: HTMLElement, query: string): void {
  const needle = query.trim();
  if (!needle) return;
  const pattern = new RegExp(escapeRegExp(needle), "gi");

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const text = node.data;
    const pieces: (string | HTMLElement)[] = [];
    let pos = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > pos) pieces.push(text.slice(pos, match.index));
      const mark = document.createElement("mark");
      mark.className = "hl";
      mark.textContent = match[0];
      pieces.push(mark);
      pos = match.index + match[0].length;
    }
    if (pieces.length === 0) continue;
    if (pos < text.length) pieces.push(text.slice(pos));
    node.replaceWith(...pieces);
  }
}
