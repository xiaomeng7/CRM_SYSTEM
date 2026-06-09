/**
 * Extract clean text snippets from fetched HTML (PR8D).
 * No raw HTML storage — short snippets only.
 */

const MAX_SNIPPET_CHARS = 400;
const MAX_TOTAL_TEXT_CHARS = 8000;

function stripHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function truncate(text, max) {
  if (!text) return '';
  const s = String(text).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trim() + '…';
}

/**
 * @param {Array<{ url: string, html: string }>} pages
 * @returns {{ combined_text: string, snippets: Array<{ url: string, snippet: string }>, total_chars: number }}
 */
function extractWebsiteText(pages) {
  const snippets = [];
  let combined = '';

  for (const page of pages || []) {
    const text = stripHtml(page.html);
    if (!text) continue;
    const snippet = truncate(text, MAX_SNIPPET_CHARS);
    snippets.push({ url: page.url, snippet });
    combined += ` ${text}`;
    if (combined.length > MAX_TOTAL_TEXT_CHARS) {
      combined = combined.slice(0, MAX_TOTAL_TEXT_CHARS);
      break;
    }
  }

  return {
    combined_text: combined.trim(),
    snippets,
    total_chars: combined.trim().length,
  };
}

module.exports = {
  extractWebsiteText,
  stripHtml,
  truncate,
  MAX_SNIPPET_CHARS,
  MAX_TOTAL_TEXT_CHARS,
};
