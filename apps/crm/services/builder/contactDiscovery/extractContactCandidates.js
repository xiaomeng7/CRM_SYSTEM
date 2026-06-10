/**
 * Extract likely builder contacts from website HTML and text snippets (PR10B).
 * Does not scrape LinkedIn pages — only extracts linkedin.com/in URLs from HTML hrefs.
 */

const { stripHtml } = require('../research/extractWebsiteText');
const { TARGET_ROLES, CONTACT_PAGE_HINTS } = require('./contactDiscoveryConstants');

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?61[\s.-]?)?(?:\(0\)[\s.-]?)?0?[2-478][\d\s().-]{7,12}/g;
const LINKEDIN_HREF_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/gi;
const MAILTO_RE = /href=["']mailto:([^"'?]+)["']/gi;
const TEL_RE = /href=["']tel:([^"']+)["']/gi;

const GENERIC_EMAIL_PREFIXES = ['info', 'hello', 'contact', 'admin', 'sales', 'enquiries', 'enquiry', 'office', 'mail'];

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.length < 8) return null;
  return String(raw).trim().replace(/\s+/g, ' ');
}

function normalizeEmail(raw) {
  if (!raw) return null;
  const email = String(raw).trim().toLowerCase();
  if (!email.includes('@')) return null;
  return email;
}

function isGenericEmail(email) {
  const local = email.split('@')[0];
  return GENERIC_EMAIL_PREFIXES.some((p) => local === p || local.startsWith(`${p}.`));
}

function pageKind(url) {
  const lower = String(url || '').toLowerCase();
  for (const hint of CONTACT_PAGE_HINTS) {
    if (lower.includes(hint)) return hint;
  }
  return 'page';
}

function roleFromText(text) {
  const value = String(text || '');
  for (const role of TARGET_ROLES) {
    for (const pattern of role.patterns) {
      if (pattern.test(value)) return role.label;
    }
  }
  return null;
}

function roleScore(role) {
  const order = ['Owner', 'Director', 'Construction Manager', 'Estimator', 'Project Manager'];
  const idx = order.indexOf(role);
  return idx >= 0 ? 100 - idx * 8 : 40;
}

const INVALID_NAME_WORDS = new Set([
  'team',
  'our',
  'about',
  'contact',
  'staff',
  'meet',
  'leadership',
  'director',
  'home',
  'builder',
  'builders',
]);

function cleanPersonName(name) {
  if (!name) return null;
  let parts = String(name)
    .trim()
    .split(/\s+/)
    .filter((p) => p && !INVALID_NAME_WORDS.has(p.toLowerCase()));
  if (parts.length > 3) parts = parts.slice(-3);
  if (parts.length < 2) return null;
  return parts.join(' ');
}

function nameLooksValid(name) {
  const cleaned = cleanPersonName(name);
  if (!cleaned) return false;
  const s = cleaned.trim();
  if (s.length < 4 || s.length > 60) return false;
  if (/\d/.test(s)) return false;
  if (/@|https?:|\.com/i.test(s)) return false;
  const parts = s.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-Z][a-z'.-]+$/.test(p) || /^[A-Z]{2,}$/.test(p));
}

function candidateKey(c) {
  return [c.email, c.phone, c.name, c.role].map((v) => String(v || '').toLowerCase()).join('|');
}

function upsertCandidate(map, candidate) {
  const key = candidateKey(candidate);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, candidate);
    return;
  }
  existing.confidence_score = Math.max(existing.confidence_score, candidate.confidence_score);
  existing.email = existing.email || candidate.email;
  existing.phone = existing.phone || candidate.phone;
  existing.name = existing.name || candidate.name;
  existing.role = existing.role || candidate.role;
  existing.linkedin_url = existing.linkedin_url || candidate.linkedin_url;
  existing.source_url = existing.source_url || candidate.source_url;
  existing.reason = existing.reason || candidate.reason;
}

function scoreCandidate(candidate, pageHint) {
  let score = candidate.confidence_score || 30;
  if (candidate.name) score += 15;
  if (candidate.role) score += roleScore(candidate.role);
  if (candidate.name && candidate.role) score += 25;
  if (candidate.email && !isGenericEmail(candidate.email)) score += 20;
  else if (candidate.email) score += 8;
  if (candidate.phone) score += 15;
  if (candidate.linkedin_url) score += 5;
  if (pageHint === 'team' || pageHint === 'about') score += 12;
  if (pageHint === 'contact') score += 8;
  return Math.min(100, score);
}

function confidenceBand(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function extractFromHtml(html, pageUrl, sourceType = 'website') {
  const map = new Map();
  const hint = pageKind(pageUrl);
  const text = stripHtml(html);

  let match;
  while ((match = MAILTO_RE.exec(html)) !== null) {
    const email = normalizeEmail(match[1]);
    if (!email) continue;
    upsertCandidate(map, {
      name: null,
      role: null,
      email,
      phone: null,
      linkedin_url: null,
      confidence_score: isGenericEmail(email) ? 35 : 55,
      source_type: sourceType,
      source_url: pageUrl,
      reason: `Email found on ${hint} page`,
    });
  }

  while ((match = TEL_RE.exec(html)) !== null) {
    const phone = normalizePhone(match[1]);
    if (!phone) continue;
    upsertCandidate(map, {
      name: null,
      role: null,
      email: null,
      phone,
      linkedin_url: null,
      confidence_score: 50,
      source_type: sourceType,
      source_url: pageUrl,
      reason: `Phone found on ${hint} page`,
    });
  }

  const emails = text.match(EMAIL_RE) || [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    upsertCandidate(map, {
      name: null,
      role: null,
      email,
      phone: null,
      linkedin_url: null,
      confidence_score: isGenericEmail(email) ? 30 : 50,
      source_type: sourceType,
      source_url: pageUrl,
      reason: `Email in page text (${hint})`,
    });
  }

  const phones = text.match(PHONE_RE) || [];
  for (const raw of phones) {
    const phone = normalizePhone(raw);
    if (!phone) continue;
    upsertCandidate(map, {
      name: null,
      role: null,
      email: null,
      phone,
      linkedin_url: null,
      confidence_score: 45,
      source_type: sourceType,
      source_url: pageUrl,
      reason: `Phone in page text (${hint})`,
    });
  }

  const linkedinMatches = html.match(LINKEDIN_HREF_RE) || [];
  for (const linkedin_url of linkedinMatches) {
    upsertCandidate(map, {
      name: null,
      role: null,
      email: null,
      phone: null,
      linkedin_url,
      confidence_score: 40,
      source_type: sourceType,
      source_url: pageUrl,
      reason: 'LinkedIn profile link on website (not scraped)',
    });
  }

  const nameRolePatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})\s*[-–|,]\s*([^,.;]{3,80})/g,
    /(Director|Owner|Construction Manager|Project Manager|Estimator|CEO|Founder)\s*[-–|:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})/gi,
  ];

  for (const pattern of nameRolePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name;
      let roleText;
      if (pattern === nameRolePatterns[0]) {
        name = match[1];
        roleText = match[2];
      } else {
        roleText = match[1];
        name = match[2];
      }
      const role = roleFromText(roleText);
      const cleanedName = cleanPersonName(name);
      if (!role || !nameLooksValid(cleanedName)) continue;
      upsertCandidate(map, {
        name: cleanedName,
        role,
        email: null,
        phone: null,
        linkedin_url: null,
        confidence_score: 65,
        source_type: sourceType,
        source_url: pageUrl,
        reason: `Named ${role} on ${hint} page`,
      });
    }
  }

  return [...map.values()].map((c) => {
    const confidence_score = scoreCandidate(c, hint);
    return {
      ...c,
      confidence_score,
      confidence_band: confidenceBand(confidence_score),
    };
  });
}

function extractFromSnippets(snippets) {
  const map = new Map();
  for (const item of snippets || []) {
    const html = `<div>${item.snippet || ''}</div>`;
    for (const candidate of extractFromHtml(html, item.url, 'research_snippet')) {
      upsertCandidate(map, candidate);
    }
  }
  return [...map.values()];
}

function mergeContactChannels(candidates) {
  const list = [...(candidates || [])];
  for (const person of list) {
    if (!person.name) continue;
    for (const channel of list) {
      if (channel === person || channel.name) continue;
      if (channel.source_url && person.source_url && channel.source_url !== person.source_url) continue;
      person.email = person.email || channel.email || null;
      person.phone = person.phone || channel.phone || null;
      person.linkedin_url = person.linkedin_url || channel.linkedin_url || null;
    }
  }
  return list;
}

function rankContactCandidates(candidates) {
  return mergeContactChannels(candidates)
    .map((c) => ({
      ...c,
      confidence_score: scoreCandidate(c, pageKind(c.source_url)),
      confidence_band: confidenceBand(scoreCandidate(c, pageKind(c.source_url))),
    }))
    .sort((a, b) => {
      if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
      if (Boolean(b.name) !== Boolean(a.name)) return b.name ? 1 : -1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function pickRecommendedContact(candidates) {
  const ranked = rankContactCandidates(candidates);
  const namedRole = ranked.find((c) => c.name && c.role);
  if (namedRole) return namedRole;
  const named = ranked.find((c) => c.name);
  if (named) return named;
  return ranked[0] || null;
}

module.exports = {
  extractFromHtml,
  extractFromSnippets,
  rankContactCandidates,
  pickRecommendedContact,
  roleFromText,
  nameLooksValid,
  normalizeEmail,
  normalizePhone,
};
