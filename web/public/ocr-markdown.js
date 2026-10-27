/** Requires /vendor/purify.min.js and /vendor/marked.min.js loaded before app.js. */

/** @type {typeof import('marked').marked | undefined} */
const marked = globalThis.marked;
/** @type {typeof import('dompurify').default | undefined} */
const DOMPurify = globalThis.DOMPurify;

if (marked?.setOptions) {
  marked.setOptions({ gfm: true, breaks: true });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip accidental outer markdown fences from model output. */
export function normalizeOcrMarkdown(raw) {
  let s = String(raw || "").trim();
  const fence = s.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence) s = fence[1].trim();
  return s;
}

export function renderOcrMarkdown(source) {
  const md = normalizeOcrMarkdown(source);
  if (!md) return "";
  if (marked?.parse && DOMPurify?.sanitize) {
    try {
      const html = marked.parse(md);
      return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    } catch {
      /* fall through */
    }
  }
  return escapeHtml(md).replace(/\n/g, "<br>");
}
