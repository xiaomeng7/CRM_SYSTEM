#!/usr/bin/env node
/**
 * PR10A.1 — Unified CRM sidebar navigation tests.
 */

const fs = require('fs');
const path = require('path');
const {
  NAV_ITEMS,
  normalizePath,
  resolveActiveHref,
} = require('../public/js/sidebar');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SIDEBAR_JS = path.join(PUBLIC, 'js/sidebar.js');

const MAIN_PAGES = [
  'index.html',
  'ceo-daily.html',
  'builder-intelligence.html',
  'bank-import.html',
  'bank-review.html',
  'leads.html',
  'lead-detail.html',
  'opportunities.html',
  'contacts.html',
  'contact-detail.html',
  'account-detail.html',
  'tasks.html',
  'b2b-prospects.html',
  'inspection-review.html',
  'admin-console.html',
  'growth-console.html',
  'data-maintenance.html',
  'reactivation-dashboard.html',
  'reply-inbox.html',
  'reactivation-queue.html',
  'seo-tasks.html',
  'seo-opportunities.html',
  'dashboard/growth.html',
  'dashboard/inspectors.html',
  'dashboard/inspector-detail.html',
  'dashboard/new-lead.html',
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function walkHtmlFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkHtmlFiles(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function hasHardcodedSidebarNav(html) {
  const asideMatch = html.match(/<aside[^>]*id="app-sidebar"[^>]*>([\s\S]*?)<\/aside>/i);
  if (!asideMatch) return false;
  const inner = asideMatch[1].trim();
  return /<nav[\s>]/i.test(inner) || /<a\s+href=/i.test(inner);
}

function labelInNav(label) {
  return NAV_ITEMS.some((item) => item.label === label);
}

function testSidebarLayoutCss() {
  console.log('\n=== sidebar layout css ===\n');
  const css = fs.readFileSync(path.join(PUBLIC, 'css/admin.css'), 'utf8');
  assert(css.includes('overflow: hidden') && css.includes('body'), 'body scroll lock');
  assert(css.includes('.sidebar') && css.includes('overflow-y: auto'), 'sidebar scroll area');
  assert(css.includes('.main') && css.includes('min-height: 0'), 'main flex scroll shell');
  assert(css.includes('.content') && css.includes('overflow-y: auto'), 'content scroll area');
  console.log('layout css OK');
}

function testSidebarFile() {
  console.log('\n=== sidebar.js ===\n');
  assert(fs.existsSync(SIDEBAR_JS), 'public/js/sidebar.js exists');
  assert(labelInNav('Builder Intelligence'), 'NAV_ITEMS includes Builder Intelligence');
  assert(labelInNav('Bank Import'), 'NAV_ITEMS includes Bank Import');
  assert(labelInNav('Bank Review'), 'NAV_ITEMS includes Bank Review');
  assert(labelInNav('CEO Daily'), 'NAV_ITEMS includes CEO Daily');
  assert(NAV_ITEMS.length >= 15, 'NAV_ITEMS has unified nav entries');
  console.log('sidebar.js OK');
}

function testActivePaths() {
  console.log('\n=== active path logic ===\n');
  assert(resolveActiveHref('/') === '/', 'dashboard root');
  assert(resolveActiveHref('/index.html') === '/', 'index.html → dashboard');
  assert(resolveActiveHref('/builder-intelligence.html') === '/builder-intelligence.html', 'builder intelligence');
  assert(resolveActiveHref('/dashboard/growth') === '/dashboard/growth', 'growth route');
  assert(resolveActiveHref('/dashboard/growth.html') === '/dashboard/growth', 'growth html path');
  assert(resolveActiveHref('/admin/seo/tasks') === '/admin/seo/tasks', 'seo tasks');
  assert(resolveActiveHref('/seo-opportunities.html') === '/admin/seo/tasks', 'seo opportunities alias');
  assert(resolveActiveHref('/lead-detail.html') === '/leads.html', 'lead detail → leads');
  assert(resolveActiveHref('/dashboard/inspector-detail.html') === '/dashboard/inspectors', 'inspector detail');
  assert(normalizePath('/foo/') === '/foo', 'trailing slash trimmed');
  console.log('active path logic OK');
}

function testHtmlPages() {
  console.log('\n=== HTML pages ===\n');
  const missingSidebar = [];
  const missingScript = [];
  const hardcoded = [];

  for (const rel of MAIN_PAGES) {
    const file = path.join(PUBLIC, rel);
    assert(fs.existsSync(file), `${rel} exists`);
    const html = fs.readFileSync(file, 'utf8');
    if (!/id="app-sidebar"/.test(html)) missingSidebar.push(rel);
    if (!html.includes('/js/sidebar.js')) missingScript.push(rel);
    if (hasHardcodedSidebarNav(html)) hardcoded.push(rel);
  }

  assert(!missingSidebar.length, `missing #app-sidebar: ${missingSidebar.join(', ')}`);
  assert(!missingScript.length, `missing sidebar.js script: ${missingScript.join(', ')}`);
  assert(!hardcoded.length, `hardcoded sidebar nav remains: ${hardcoded.join(', ')}`);

  const allWithSidebar = walkHtmlFiles(PUBLIC).filter((file) =>
    fs.readFileSync(file, 'utf8').includes('class="sidebar"')
  );
  for (const file of allWithSidebar) {
    const rel = path.relative(PUBLIC, file);
    const html = fs.readFileSync(file, 'utf8');
    if (!/id="app-sidebar"/.test(html)) {
      throw new Error(`sidebar page missing #app-sidebar: ${rel}`);
    }
  }

  console.log(`checked ${MAIN_PAGES.length} main pages, ${allWithSidebar.length} total sidebar pages OK`);
}

function main() {
  testSidebarFile();
  testSidebarLayoutCss();
  testActivePaths();
  testHtmlPages();
  console.log('\nPR10A.1 unified sidebar tests passed.\n');
}

main();
