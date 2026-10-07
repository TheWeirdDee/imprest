/**
 * Minimal, safe Markdown renderer for the repo's own docs. HTML is escaped first; only
 * headings, paragraphs, lists, tables, code, blockquotes, emphasis and http(s)/relative
 * links are produced. No raw HTML passes through.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  let out = esc(s);
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const safe = /^(https?:\/\/|\/|\.\/|#|[A-Z_]+\.md)/.test(href) ? href : "#";
    const resolved = /^[A-Z_]+\.md/.test(safe) ? `/docs/${safe}` : safe;
    const ext = /^https?:/.test(resolved);
    return `<a href="${resolved}"${ext ? ' target="_blank" rel="noreferrer"' : ""}>${text}</a>`;
  });
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) buf.push(lines[i++]!);
      i++;
      html.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1]!)) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) body.push(cells(lines[i++]!));
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/.test(lines[i]!) : /^\s*[-*]\s+/.test(lines[i]!))) {
        items.push(lines[i]!.replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, "").replace(/^\[( |x)\]\s*/, (m) => (m.includes("x") ? "[done] " : "[ ] ")));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) buf.push(lines[i++]!.replace(/^>\s?/, ""));
      html.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,4}\s|```|\||>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]!)) buf.push(lines[i++]!);
    html.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return html.join("\n");
}
