/**
 * Fetch builder website pages (PR8D).
 * Homepage + limited same-origin internal pages. No recursive crawl.
 */

const USER_AGENT = 'BetterHomeBuilderResearchBot/1.0';
const MAX_PAGES = 5;
const MAX_HTML_BYTES = 250 * 1024;
const TIMEOUT_MS = 10000;

const RELEVANT_KEYWORDS = [
  'about',
  'projects',
  'portfolio',
  'services',
  'contact',
  'our-work',
  'our-work',
  'gallery',
  'work',
  'team',
];

function normalizeWebsiteUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    const err = new Error('website URL required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let url;
  try {
    url = new URL(withProto);
  } catch (_) {
    const err = new Error('Invalid website URL');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    const err = new Error('Invalid website URL protocol');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return url;
}

function sameOrigin(baseUrl, candidateUrl) {
  try {
    const a = new URL(candidateUrl, baseUrl);
    const b = new URL(baseUrl);
    return a.hostname === b.hostname;
  } catch (_) {
    return false;
  }
}

function scoreInternalPath(pathname) {
  const lower = pathname.toLowerCase();
  let score = 0;
  for (const kw of RELEVANT_KEYWORDS) {
    if (lower.includes(kw)) score += 10;
  }
  if (lower === '/' || lower === '') score += 1;
  return score;
}

function discoverInternalUrls(homepageUrl, html) {
  const base = normalizeWebsiteUrl(homepageUrl);
  const found = new Map();
  found.set(base.href, scoreInternalPath(base.pathname));

  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      const resolved = new URL(href, base.href);
      if (!sameOrigin(base.href, resolved.href)) continue;
      resolved.hash = '';
      const key = resolved.href;
      const pathScore = scoreInternalPath(resolved.pathname);
      if (pathScore <= 0) continue;
      found.set(key, Math.max(found.get(key) || 0, pathScore));
    } catch (_) {
      /* skip bad href */
    }
  }

  const sorted = [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);

  const unique = [];
  for (const url of sorted) {
    if (!unique.includes(url)) unique.push(url);
    if (unique.length >= MAX_PAGES) break;
  }
  return unique;
}

async function defaultFetchPage(url, options = {}) {
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const maxBytes = options.maxBytes || MAX_HTML_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.code = 'FETCH_FAILED';
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(contentType) && contentType !== '') {
      const err = new Error(`Non-HTML content at ${url}`);
      err.code = 'FETCH_FAILED';
      throw err;
    }

    const reader = res.body?.getReader?.();
    if (!reader) {
      const text = await res.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        return text.slice(0, maxBytes);
      }
      return text;
    }

    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        chunks.push(value.slice(0, maxBytes - (total - value.length)));
        break;
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`Timeout fetching ${url}`);
      e.code = 'FETCH_TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} homepageUrl
 * @param {object} [options]
 * @param {function} [options.fetchPage]
 * @returns {Promise<{ homepage_url: string, pages: Array<{ url: string, html: string }> }>}
 */
async function fetchBuilderWebsite(homepageUrl, options = {}) {
  const fetchPage = options.fetchPage || defaultFetchPage;
  const base = normalizeWebsiteUrl(homepageUrl);

  const homepageHtml = await fetchPage(base.href, options);
  const urls = discoverInternalUrls(base.href, homepageHtml);

  const pages = [];
  for (const url of urls) {
    let html;
    if (url === base.href) {
      html = homepageHtml;
    } else {
      html = await fetchPage(url, options);
    }
    pages.push({ url, html });
  }

  return { homepage_url: base.href, pages };
}

module.exports = {
  fetchBuilderWebsite,
  discoverInternalUrls,
  normalizeWebsiteUrl,
  defaultFetchPage,
  USER_AGENT,
  MAX_PAGES,
  MAX_HTML_BYTES,
  TIMEOUT_MS,
};
