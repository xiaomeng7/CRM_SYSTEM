/**
 * Landing page behavior → CRM POST /api/analytics/lp-events (V1).
 * A/B Phase 1: random lpv assignment (sticky via localStorage) when URL has no lpv.
 * Optional: <meta name="bht-lp-events-api" content="https://api.example.com"> (no trailing path).
 */
(function (global) {
  'use strict';

  var EVENT_TYPES = { page_view: 1, scroll_50: 1, form_start: 1, form_submit: 1 };

  /** Hardcoded A/B pool; replace with API-driven list later. */
  var LP_VARIANTS = ['v1', 'v2'];
  var BHT_LPV_STORAGE_KEY = 'bht_lpv';

  function pickRandomVariant() {
    return LP_VARIANTS[Math.floor(Math.random() * LP_VARIANTS.length)];
  }

  function isInAbPool(v) {
    return LP_VARIANTS.indexOf(v) >= 0;
  }

  /**
   * Sync ?lpv= into the address bar (no reload) so getMeta() and form payloads see it.
   */
  function replaceUrlWithLpv(lpv) {
    if (!lpv) return;
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('lpv') === lpv) return;
      u.searchParams.set('lpv', lpv);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  /**
   * 1) URL ?lpv= wins (any value — ads / manual).
   * 2) Else localStorage bht_lpv if still in LP_VARIANTS.
   * 3) Else random from LP_VARIANTS → persist + replaceState.
   * @returns {string}
   */
  function getAssignedLandingVersion() {
    var p = new URLSearchParams(window.location.search);
    var fromUrl = (p.get('lpv') || '').trim();
    if (fromUrl) {
      try {
        localStorage.setItem(BHT_LPV_STORAGE_KEY, fromUrl);
      } catch (e) {}
      return fromUrl;
    }

    var stored = '';
    try {
      stored = (localStorage.getItem(BHT_LPV_STORAGE_KEY) || '').trim();
    } catch (e) {}
    if (stored && !isInAbPool(stored)) {
      stored = '';
      try {
        localStorage.removeItem(BHT_LPV_STORAGE_KEY);
      } catch (e2) {}
    }

    if (stored) {
      replaceUrlWithLpv(stored);
      return stored;
    }

    var assigned = pickRandomVariant();
    try {
      localStorage.setItem(BHT_LPV_STORAGE_KEY, assigned);
    } catch (e) {}
    replaceUrlWithLpv(assigned);
    return assigned;
  }

  function apiOrigin() {
    var m = document.querySelector('meta[name="bht-lp-events-api"]');
    var c = m && m.getAttribute('content');
    if (c != null && String(c).trim() !== '') return String(c).replace(/\/$/, '');
    if (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)) return 'http://localhost:8888';
    return '';
  }

  function endpoint() {
    var o = apiOrigin();
    return (o ? o : '') + '/api/analytics/lp-events';
  }

  function getMeta() {
    var p = new URLSearchParams(location.search);
    return {
      landing_page_version: (p.get('lpv') || '').trim() || null,
      creative_version: (p.get('cv') || '').trim() || null,
      utm_campaign: (p.get('utm_campaign') || '').trim() || null,
    };
  }

  function sessionId() {
    try {
      var k = 'bht_lp_session_v1';
      var s = sessionStorage.getItem(k);
      if (!s) {
        s = 'lp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
        sessionStorage.setItem(k, s);
      }
      return s;
    } catch (e) {
      return 'lp_' + Date.now().toString(36);
    }
  }

  function send(event_type) {
    if (!EVENT_TYPES[event_type]) return;
    var body = Object.assign({ session_id: sessionId(), event_type: event_type }, getMeta());
    var url = endpoint();
    var payload = JSON.stringify(body);
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (e) {}
    if (typeof fetch !== 'function') return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      mode: 'cors',
    }).catch(function () {});
  }

  var scrollDone = false;
  var formStartDone = false;

  function onScroll() {
    if (scrollDone) return;
    var docEl = document.documentElement;
    var sh = docEl.scrollHeight || 1;
    var pct = (window.pageYOffset + window.innerHeight) / sh;
    if (pct >= 0.5) {
      scrollDone = true;
      send('scroll_50');
    }
  }

  function bindForm(formSelector) {
    var form = document.querySelector(formSelector);
    if (!form) return;
    function markStart() {
      if (formStartDone) return;
      formStartDone = true;
      send('form_start');
    }
    form.addEventListener(
      'focusin',
      function (ev) {
        if (!form.contains(ev.target)) return;
        var tag = (ev.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') markStart();
      },
      true
    );
    form.addEventListener('click', markStart, true);
  }

  function init(opts) {
    opts = opts || {};
    getAssignedLandingVersion();
    window.addEventListener('scroll', onScroll, { passive: true });
    if (opts.formSelector) bindForm(opts.formSelector);
    function pv() {
      send('page_view');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pv);
    else pv();
  }

  global.BhtLpTracking = {
    init: init,
    send: send,
    getAssignedLandingVersion: getAssignedLandingVersion,
    LP_VARIANTS: LP_VARIANTS,
  };
})(typeof window !== 'undefined' ? window : this);
