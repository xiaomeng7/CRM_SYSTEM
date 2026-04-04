/**
 * Growth Dashboard — /dashboard/growth
 * Vanilla JS; funnel + ad table + recommendations + drawer/modals.
 */
(function () {
  var SECRET_KEY = 'growth_dash_secret';
  var BASE_URL_KEY = 'growth_dash_base_url';
  /** 占位：创意相关后台入口，便于销售跳转核对 */
  var CREATIVE_HELP_HREF = '/growth-console.html';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showMsg(text, isErr) {
    var el = $('gd-msg');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'gd-msg';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'gd-msg ' + (isErr ? 'err' : 'ok');
  }

  function getSecret() {
    try {
      return sessionStorage.getItem(SECRET_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setSecret(s) {
    try {
      if (s) sessionStorage.setItem(SECRET_KEY, s);
      else sessionStorage.removeItem(SECRET_KEY);
    } catch (e) {}
  }

  function secretHeaders() {
    var s = getSecret().trim();
    if (!s) return {};
    return { 'x-sync-secret': s };
  }

  function withSecretBody(obj) {
    var o = obj && typeof obj === 'object' ? Object.assign({}, obj) : {};
    var s = getSecret().trim();
    if (s) o.sync_secret = s;
    return o;
  }

  function fetchJson(url, options) {
    options = options || {};
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {}, secretHeaders());
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, Object.assign({}, options, { headers: headers })).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || j.message || r.statusText || String(r.status));
        return j;
      });
    });
  }

  function ymd(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /** Selected preset → { from, to } inclusive local dates */
  function computeDateRange(preset) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var to = new Date(now);
    var from = new Date(now);
    if (preset === '14d') {
      from.setDate(from.getDate() - 13);
    } else if (preset === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      from.setDate(from.getDate() - 6);
    }
    return { from: ymd(from), to: ymd(to), preset: preset || '7d' };
  }

  function getSelectedPreset() {
    var r = document.querySelector('input[name="gd-range"]:checked');
    return (r && r.value) || '7d';
  }

  function dimText(v) {
    if (v == null || String(v).trim() === '') return '（未填）';
    return String(v);
  }

  function dimLabel(v) {
    if (v == null || String(v).trim() === '') return '<span class="muted">（未填）</span>';
    return escapeHtml(String(v));
  }

  function fmtPct(n) {
    if (n == null || n === '') return '—';
    var x = Number(n);
    if (isNaN(x)) return '—';
    return x.toFixed(1) + '%';
  }

  function fmtMoney(n) {
    if (n == null || n === '') return '—';
    var x = Number(n);
    if (isNaN(x)) return '—';
    return '$' + x.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtDateShort(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString();
    } catch (e) {
      return '—';
    }
  }

  /**
   * 仅当创意库中恰好 1 条记录的 version 与 cv 一致时可自动操作。
   */
  function resolveCreativeStrict(creatives, cv) {
    if (cv == null || !String(cv).trim()) {
      return { creative: null, ok: false, hint: '缺少创意版本标签，无法自动操作。' };
    }
    var v = String(cv).trim();
    var list = creatives.filter(function (c) {
      return String(c.version || '').trim() === v;
    });
    if (list.length === 0) {
      return { creative: null, ok: false, hint: '创意库中未找到与此版本标签唯一对应的记录。' };
    }
    if (list.length > 1) {
      return { creative: null, ok: false, hint: '创意库中存在多条相同版本标签，无法自动操作，请联系后台处理。' };
    }
    return { creative: list[0], ok: true, hint: '' };
  }

  function getBaseUrlEffective() {
    var inp = ($('gd-base-url') && $('gd-base-url').value.trim()) || '';
    if (inp) return inp;
    try {
      return localStorage.getItem(BASE_URL_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveBaseUrlToStorage() {
    try {
      var v = ($('gd-base-url') && $('gd-base-url').value.trim()) || '';
      if (v) localStorage.setItem(BASE_URL_KEY, v);
    } catch (e) {}
  }

  function loadBaseUrlFromStorage() {
    try {
      var v = localStorage.getItem(BASE_URL_KEY) || '';
      var el = $('gd-base-url');
      if (el && v && !el.value.trim()) el.value = v;
    } catch (e) {}
  }

  var state = {
    range: computeDateRange('7d'),
    byVersion: [],
    creatives: [],
    rowResolve: [],
    recommendations: [],
    recLoadFailed: false,
    recPayload: null,
    forkCreativeId: null,
    forkRow: null,
    pauseCreativeId: null,
    linkRow: null,
    forkResultLink: '',
    drawerRow: null,
  };

  function queryParamsString() {
    var qs = new URLSearchParams();
    qs.set('date_from', state.range.from);
    qs.set('date_to', state.range.to);
    var pl = ($('gd-product-line') && $('gd-product-line').value) || '';
    if (pl) qs.set('product_line', pl);
    return qs.toString();
  }

  function buildCohortQueryParams(row) {
    var q = new URLSearchParams();
    q.set('limit', '200');
    q.set('date_from', state.range.from);
    q.set('date_to', state.range.to);
    q.append('creative_version', row.creative_version == null ? '' : String(row.creative_version));
    q.append('landing_page_version', row.landing_page_version == null ? '' : String(row.landing_page_version));
    q.append('utm_campaign', row.utm_campaign == null ? '' : String(row.utm_campaign));
    return q.toString();
  }

  /** utm_campaign= &cv= &lpv= query string only */
  function buildTrackingQueryString(row) {
    var utm = row.utm_campaign != null ? String(row.utm_campaign) : '';
    var cv = row.creative_version != null ? String(row.creative_version) : '';
    var lpv = row.landing_page_version != null ? String(row.landing_page_version) : '';
    return (
      'utm_campaign=' +
      encodeURIComponent(utm) +
      '&cv=' +
      encodeURIComponent(cv) +
      '&lpv=' +
      encodeURIComponent(lpv)
    );
  }

  function buildFullTrackingUrl(row) {
    var base = getBaseUrlEffective();
    if (!base) return '';
    var u = base.split('#')[0];
    var sep = u.indexOf('?') >= 0 ? '&' : '?';
    return u + sep + buildTrackingQueryString(row);
  }

  function canBuildLink(row) {
    var a = row.creative_version != null && String(row.creative_version).trim() !== '';
    var b = row.landing_page_version != null && String(row.landing_page_version).trim() !== '';
    var c = row.utm_campaign != null && String(row.utm_campaign).trim() !== '';
    return { ok: a && b && c, hint: '需同时填写创意版本、落地页版本和活动名称才能生成链接。' };
  }

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () {
          showMsg('已复制到剪贴板。', false);
          setTimeout(function () {
            showMsg('', false);
          }, 2000);
        },
        function () {
          fallbackCopy(text);
        }
      );
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showMsg('已复制。', false);
    } catch (e) {
      showMsg('请手动复制：' + text, true);
    }
    document.body.removeChild(ta);
  }

  function sortByVersion(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var pa = Number(a.total_paid_value) || 0;
      var pb = Number(b.total_paid_value) || 0;
      if (pb !== pa) return pb - pa;
      var ia = Number(a.invoices_paid) || 0;
      var ib = Number(b.invoices_paid) || 0;
      return ib - ia;
    });
  }

  function setSectionLoading(sectionEl, loading) {
    if (!sectionEl) return;
    if (loading) sectionEl.classList.add('gd-loading');
    else sectionEl.classList.remove('gd-loading');
  }

  function refresh() {
    var secret = getSecret().trim();
    if (!secret) {
      showMsg('请先填写并保存登录密钥。', true);
      return;
    }

    state.range = computeDateRange(getSelectedPreset());
    var qs = queryParamsString();

    var funnelSec = $('gd-funnel-section');
    var adSec = $('gd-ad-section');
    var recSec = $('gd-rec-section');

    $('gd-funnel-state').textContent = '加载中…';
    $('gd-ad-state').textContent = '加载中…';
    $('gd-rec-state').textContent = '加载中…';
    setSectionLoading(funnelSec, true);
    setSectionLoading(adSec, true);
    setSectionLoading(recSec, true);

    var convP = fetchJson('/api/analytics/conversion-performance?' + qs).catch(function (e) {
      return { _err: e.message || String(e) };
    });

    var recP = fetchJson('/api/analytics/ad-recommendations?' + qs).catch(function (e) {
      return { ok: false, recommendations: [], _recError: e.message || String(e) };
    });

    Promise.all([
      fetchJson('/api/analytics/ad-performance?' + qs),
      fetchJson('/api/ads/creatives?limit=500').catch(function () {
        return { creatives: [] };
      }),
      recP,
      convP,
    ])
      .then(function (quad) {
        var perf = quad[0];
        var cr = quad[1];
        var recPayload = quad[2];
        var conv = quad[3];

        setSectionLoading(funnelSec, false);
        setSectionLoading(adSec, false);
        setSectionLoading(recSec, false);

        if (conv._err) {
          $('gd-funnel-state').textContent = '概览加载失败，请稍后重试。';
          $('gd-funnel-leads').textContent = '—';
          $('gd-funnel-won').textContent = '—';
          $('gd-funnel-paid').textContent = '—';
        } else {
          var f = conv.funnel || {};
          $('gd-funnel-state').textContent =
            '统计区间：' + state.range.from + ' ~ ' + state.range.to + '。';
          $('gd-funnel-leads').textContent = String(f.leads ?? '0');
          $('gd-funnel-won').textContent = String(f.opportunities_won ?? '0');
          $('gd-funnel-paid').textContent = String(f.invoices_paid ?? '0');
        }

        var creatives = cr.creatives || [];
        if (!Array.isArray(creatives)) creatives = [];

        state.byVersion = sortByVersion(perf.by_version || []);
        state.creatives = creatives;
        state.rowResolve = state.byVersion.map(function (row) {
          return resolveCreativeStrict(creatives, row.creative_version);
        });

        if (perf.by_version && !state.byVersion.length) {
          $('gd-ad-state').textContent = '当前时间范围内还没有广告版本数据。';
        } else {
          $('gd-ad-state').textContent =
            '统计区间：' + state.range.from + ' ~ ' + state.range.to + ' · 已按付费金额排序。';
        }

        state.recPayload = recPayload;
        state.recommendations = recPayload.recommendations || [];
        if (recPayload._recError) {
          state.recLoadFailed = true;
          $('gd-rec-state').textContent = '建议加载失败，请稍后重试。';
        } else {
          state.recLoadFailed = false;
          $('gd-rec-state').textContent =
            '共 ' + state.recommendations.length + ' 条建议（含可能的全站提示）。';
        }

        renderAdTable();
        renderRecCards();
        showMsg('数据已更新。', false);
        setTimeout(function () {
          showMsg('', false);
        }, 2000);
      })
      .catch(function (e) {
        console.error(e);
        setSectionLoading(funnelSec, false);
        setSectionLoading(adSec, false);
        setSectionLoading(recSec, false);
        $('gd-funnel-state').textContent = '';
        $('gd-ad-state').textContent = '';
        $('gd-rec-state').textContent = '';
        showMsg(e.message || String(e), true);
        $('gd-ad-tbody').innerHTML =
          '<tr><td colspan="11" class="muted">加载失败：' + escapeHtml(e.message || String(e)) + '</td></tr>';
        $('gd-rec-grid').innerHTML =
          '<div class="muted" style="grid-column:1/-1;">加载失败</div>';
      });
  }

  function normDim(v) {
    return v == null ? '' : String(v).trim();
  }

  /** 与后端 ad-recommendations 维度一致；排除全窗口条目 */
  function findRecommendationForRow(row) {
    if (state.recLoadFailed) return null;
    var cv = normDim(row.creative_version);
    var lpv = normDim(row.landing_page_version);
    var utm = normDim(row.utm_campaign);
    for (var i = 0; i < state.recommendations.length; i++) {
      var r = state.recommendations[i];
      if (r.scope === 'cohort_window') continue;
      if (
        normDim(r.creative_version) === cv &&
        normDim(r.landing_page_version) === lpv &&
        normDim(r.utm_campaign) === utm
      ) {
        return r;
      }
    }
    return null;
  }

  /**
   * 徽章：仅用接口返回的 type + rule_id 映射文案，不重复业务规则。
   */
  function rowBadgeHtml(rec) {
    if (state.recLoadFailed) {
      return '<span class="gd-badge gd-badge-warn">建议未加载</span>';
    }
    if (!rec) {
      return '<span class="gd-badge gd-badge-muted">暂无匹配</span>';
    }
    var t = rec.type;
    var rid = rec.rule_id || '';
    var label;
    var cls;
    if (t === 'pause') {
      label = '建议暂停';
      cls = 'gd-badge-pause';
    } else if (t === 'scale') {
      label = '表现最好';
      cls = 'gd-badge-scale';
    } else if (t === 'fork') {
      label = '建议复制';
      cls = 'gd-badge-fork';
    } else if (t === 'sales_issue') {
      label = '销售跟进问题';
      cls = 'gd-badge-sales';
    } else if (t === 'tracking_issue') {
      label = '追踪异常';
      cls = 'gd-badge-track';
    } else if (t === 'observe') {
      if (rid === 'A_observe_low_n') {
        label = '数据不足';
        cls = 'gd-badge-weak';
      } else {
        label = '继续观察';
        cls = 'gd-badge-observe';
      }
    } else {
      label = '继续观察';
      cls = 'gd-badge-observe';
    }
    return '<span class="gd-badge ' + cls + '">' + escapeHtml(label) + '</span>';
  }

  function focusRecommendationRow(r) {
    if (!r || r.scope === 'cohort_window') return;
    var m = findTableRowMatchingRec(r);
    if (!m) return;
    var tr = document.querySelector('#gd-ad-tbody tr[data-gd-idx="' + m.idx + '"]');
    if (!tr) return;
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    tr.classList.remove('gd-row-flash');
    void tr.offsetWidth;
    tr.classList.add('gd-row-flash');
    setTimeout(function () {
      tr.classList.remove('gd-row-flash');
    }, 2600);
  }

  function creativeLibraryLinkHtml() {
    return (
      '<a href="' +
      CREATIVE_HELP_HREF +
      '" target="_blank" rel="noopener" class="muted">去 Growth Ops 核对创意</a>'
    );
  }

  function renderAdTable() {
    var tb = $('gd-ad-tbody');
    if (!tb) return;
    if (!state.byVersion.length) {
      tb.innerHTML =
        '<tr><td colspan="11" class="muted">当前时间范围内还没有广告版本数据</td></tr>';
      return;
    }
    tb.innerHTML = state.byVersion
      .map(function (row, idx) {
        var res = state.rowResolve[idx];
        var canOp = res.ok;
        var titleAttr = canOp ? '' : ' title="' + escapeHtml(res.hint) + '"';

        var chk = canBuildLink(row);
        var linkTitle = chk.ok ? '' : ' title="' + escapeHtml(chk.hint) + '"';

        var recForRow = findRecommendationForRow(row);
        var badgeCell = rowBadgeHtml(recForRow);

        var pauseBtn =
          '<button type="button" class="btn btn-sm" data-action="pause" data-idx="' +
          idx +
          '"' +
          (canOp ? '' : ' disabled') +
          titleAttr +
          '>暂停版本</button>';
        var forkBtn =
          '<button type="button" class="btn btn-sm" data-action="fork" data-idx="' +
          idx +
          '"' +
          (canOp ? '' : ' disabled') +
          titleAttr +
          '>复制新版本</button>';
        var detailBtn =
          '<button type="button" class="btn btn-sm btn-primary" data-action="detail" data-idx="' +
          idx +
          '">查看详情</button>';
        var linkBtn =
          '<button type="button" class="btn btn-sm" data-action="link" data-idx="' +
          idx +
          '"' +
          (chk.ok ? '' : ' disabled') +
          linkTitle +
          '>生成广告链接</button>';

        var opHint = '';
        if (!canOp) {
          opHint =
            '<div class="gd-op-hint">' +
            escapeHtml(res.hint) +
            ' · ' +
            creativeLibraryLinkHtml() +
            '</div>';
        }

        return (
          '<tr data-gd-idx="' +
          idx +
          '">' +
          '<td>' +
          badgeCell +
          '</td>' +
          '<td>' +
          dimLabel(row.creative_version) +
          '</td>' +
          '<td>' +
          dimLabel(row.landing_page_version) +
          '</td>' +
          '<td>' +
          dimLabel(row.utm_campaign) +
          '</td>' +
          '<td>' +
          escapeHtml(String(row.leads ?? '0')) +
          '</td>' +
          '<td>' +
          escapeHtml(String(row.opportunities_won ?? '0')) +
          '</td>' +
          '<td>' +
          escapeHtml(String(row.invoices_paid ?? '0')) +
          '</td>' +
          '<td>' +
          fmtPct(row.lead_to_won_pct) +
          '</td>' +
          '<td>' +
          fmtMoney(row.total_paid_value) +
          '</td>' +
          '<td>' +
          fmtMoney(row.avg_paid_value) +
          '</td>' +
          '<td class="gd-table-actions">' +
          detailBtn +
          linkBtn +
          pauseBtn +
          forkBtn +
          opHint +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    tb.onclick = function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var action = t.getAttribute('data-action');
      var idx = parseInt(t.getAttribute('data-idx'), 10);
      if (!action || isNaN(idx)) return;
      var row = state.byVersion[idx];
      if (!row) return;
      if (action === 'detail') openDrawer(row);
      if (action === 'link') openLinkModal(row);
      if (action === 'pause') openPauseModal(row, state.rowResolve[idx]);
      if (action === 'fork') openForkModal(row, state.rowResolve[idx]);
    };
  }

  var TYPE_LABELS = {
    pause: '建议暂停',
    observe: '继续观察',
    scale: '表现良好',
    fork: '建议试新版本',
    tracking_issue: '追踪/数据',
    sales_issue: '销售跟进',
  };

  function sevClass(sev) {
    var s = String(sev || '').toLowerCase();
    if (s === 'high') return 'sev-high';
    if (s === 'medium') return 'sev-medium';
    return 'sev-low';
  }

  function sevLabelZh(sev) {
    var s = String(sev || '').toLowerCase();
    if (s === 'high') return '高';
    if (s === 'medium') return '中';
    return '低';
  }

  function recPrimaryAction(r, idx) {
    var t = r.type;
    if (r.scope === 'cohort_window' && t === 'tracking_issue') {
      return { label: '查看问题', action: 'rec_tracking_win', idx: idx };
    }
    if (t === 'pause') return { label: '暂停这个版本', action: 'rec_pause', idx: idx };
    if (t === 'fork') return { label: '复制新版本', action: 'rec_fork', idx: idx };
    if (t === 'scale') return { label: '继续保留', action: 'rec_scale', idx: idx };
    if (t === 'observe') return { label: '继续观察', action: 'rec_observe', idx: idx };
    if (t === 'tracking_issue') return { label: '查看问题', action: 'rec_tracking', idx: idx };
    if (t === 'sales_issue') return { label: '查看客户', action: 'rec_sales', idx: idx };
    return { label: '知道了', action: 'rec_ok', idx: idx };
  }

  function rowFromRecommendation(r) {
    return {
      creative_version: r.creative_version,
      landing_page_version: r.landing_page_version,
      utm_campaign: r.utm_campaign,
      leads: 0,
      opportunities_won: 0,
      invoices_paid: 0,
      lead_to_won_pct: null,
      total_paid_value: 0,
      avg_paid_value: null,
    };
  }

  function findTableRowMatchingRec(r) {
    var cv = r.creative_version == null ? '' : String(r.creative_version).trim();
    var lpv = r.landing_page_version == null ? '' : String(r.landing_page_version).trim();
    var utm = r.utm_campaign == null ? '' : String(r.utm_campaign).trim();
    for (var i = 0; i < state.byVersion.length; i++) {
      var row = state.byVersion[i];
      var rc = row.creative_version == null ? '' : String(row.creative_version).trim();
      var rl = row.landing_page_version == null ? '' : String(row.landing_page_version).trim();
      var ru = row.utm_campaign == null ? '' : String(row.utm_campaign).trim();
      if (rc === cv && rl === lpv && ru === utm) return { row: row, idx: i };
    }
    return null;
  }

  function renderRecCards() {
    var grid = $('gd-rec-grid');
    if (!grid) return;
    if (state.recPayload && state.recPayload._recError) {
      grid.innerHTML =
        '<div class="muted" style="grid-column:1/-1;">建议暂时无法显示，请稍后重试。</div>';
      return;
    }
    if (!state.recommendations.length) {
      grid.innerHTML = '<div class="muted" style="grid-column:1/-1;">暂无系统建议</div>';
      return;
    }
    grid.innerHTML = state.recommendations
      .map(function (r, idx) {
        var tag = TYPE_LABELS[r.type] || r.type;
        var sev = sevClass(r.severity);
        var pa = recPrimaryAction(r, idx);
        var meta =
          '<div class="gd-rec-meta">' +
          '创意版本：' +
          escapeHtml(dimText(r.creative_version)) +
          '<br/>落地页：' +
          escapeHtml(dimText(r.landing_page_version)) +
          '<br/>活动：' +
          escapeHtml(dimText(r.utm_campaign)) +
          '</div>';
        if (r.scope === 'cohort_window') {
          meta =
            '<div class="gd-rec-meta">（全站数据质量提示，不针对单一版本）</div>';
        }
        return (
          '<div class="gd-rec-card ' +
          sev +
          '" data-rec-idx="' +
          idx +
          '">' +
          '<div class="tag">' +
          escapeHtml(tag) +
          ' · 优先级 ' +
          escapeHtml(sevLabelZh(r.severity)) +
          '</div>' +
          meta +
          '<p class="reason">' +
          escapeHtml(r.reason || '') +
          '</p>' +
          '<button type="button" class="btn btn-sm btn-primary" data-rec-action="' +
          pa.action +
          '" data-rec-idx="' +
          idx +
          '">' +
          escapeHtml(pa.label) +
          '</button>' +
          '</div>'
        );
      })
      .join('');
  }

  function openDrawer(row) {
    state.drawerRow = row;
    var dl = $('gd-drawer-metrics');
    if (dl) {
      dl.innerHTML =
        '<dt>创意版本</dt><dd>' +
        dimLabel(row.creative_version) +
        '</dd>' +
        '<dt>落地页版本</dt><dd>' +
        dimLabel(row.landing_page_version) +
        '</dd>' +
        '<dt>活动名称</dt><dd>' +
        dimLabel(row.utm_campaign) +
        '</dd>' +
        '<dt>线索数</dt><dd>' +
        escapeHtml(String(row.leads ?? '0')) +
        '</dd>' +
        '<dt>赢单</dt><dd>' +
        escapeHtml(String(row.opportunities_won ?? '0')) +
        '</dd>' +
        '<dt>已付发票</dt><dd>' +
        escapeHtml(String(row.invoices_paid ?? '0')) +
        '</dd>' +
        '<dt>线索→赢单</dt><dd>' +
        fmtPct(row.lead_to_won_pct) +
        '</dd>' +
        '<dt>付费合计</dt><dd>' +
        fmtMoney(row.total_paid_value) +
        '</dd>' +
        '<dt>客单价</dt><dd>' +
        fmtMoney(row.avg_paid_value) +
        '</dd>';
    }
    var tb = $('gd-drawer-leads-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="4" class="muted">加载中…</td></tr>';
    var bd = $('gd-drawer-backdrop');
    if (bd) {
      bd.classList.add('open');
      bd.setAttribute('aria-hidden', 'false');
    }
    fetch('/api/leads?' + buildCohortQueryParams(row))
      .then(function (r) {
        return r.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) throw new Error('数据格式异常');
        if (!tb) return;
        if (!rows.length) {
          tb.innerHTML = '<tr><td colspan="4" class="muted">该范围内暂无匹配客户</td></tr>';
          return;
        }
        tb.innerHTML = rows
          .map(function (l) {
            var href = '/lead-detail.html?id=' + encodeURIComponent(l.id);
            return (
              '<tr><td>' +
              escapeHtml(l.contact_name || '—') +
              '</td><td>' +
              escapeHtml(l.contact_phone || '—') +
              '</td><td>' +
              escapeHtml(l.status || '—') +
              '</td><td><a class="btn btn-sm" href="' +
              href +
              '">打开</a></td></tr>'
            );
          })
          .join('');
      })
      .catch(function (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="4" class="muted">客户列表加载失败</td></tr>';
      });
  }

  function closeDrawer() {
    var bd = $('gd-drawer-backdrop');
    if (bd) {
      bd.classList.remove('open');
      bd.setAttribute('aria-hidden', 'true');
    }
    state.drawerRow = null;
  }

  function openPauseModal(row, resolve) {
    if (!resolve || !resolve.ok || !resolve.creative) return;
    state.pauseCreativeId = resolve.creative.id;
    var s = $('gd-pause-summary');
    if (s) {
      s.innerHTML =
        '<strong>创意版本：</strong>' +
        escapeHtml(dimText(row.creative_version)) +
        '<br/><strong>落地页版本：</strong>' +
        escapeHtml(dimText(row.landing_page_version)) +
        '<br/><strong>活动名称：</strong>' +
        escapeHtml(dimText(row.utm_campaign));
    }
    var m = $('gd-modal-pause');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closePauseModal() {
    state.pauseCreativeId = null;
    var m = $('gd-modal-pause');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function confirmPause() {
    var id = state.pauseCreativeId;
    if (!id || !getSecret().trim()) return;
    fetchJson('/api/ads/creatives/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSecretBody({ status: 'paused' })),
    })
      .then(function () {
        showMsg('已暂停该创意版本。', false);
        closePauseModal();
        refresh();
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function openForkModal(row, resolve) {
    if (!resolve || !resolve.ok || !resolve.creative) return;
    state.forkCreativeId = resolve.creative.id;
    state.forkRow = row;
    $('gd-fork-form-wrap').style.display = '';
    $('gd-fork-result-wrap').style.display = 'none';
    $('gd-fork-headline').value = resolve.creative.headline || '';
    $('gd-fork-description').value = resolve.creative.description || '';
    $('gd-fork-cta').value = resolve.creative.cta || '';
    $('gd-fork-initial-status').value = 'draft';
    $('gd-fork-deactivate').checked = false;
    var m = $('gd-modal-fork');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeForkModal() {
    state.forkCreativeId = null;
    state.forkRow = null;
    var m = $('gd-modal-fork');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function submitFork() {
    var id = state.forkCreativeId;
    if (!id || !getSecret().trim()) return;
    var st = ($('gd-fork-initial-status') && $('gd-fork-initial-status').value) || 'draft';
    var body = withSecretBody({
      edits: {
        headline: $('gd-fork-headline').value.trim() || undefined,
        description: $('gd-fork-description').value.trim() || undefined,
        cta: $('gd-fork-cta').value.trim() || undefined,
      },
      initial_status: st,
      deactivate_previous: !!$('gd-fork-deactivate').checked,
    });
    fetchJson('/api/ads/creatives/' + encodeURIComponent(id) + '/publish-new-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        var c = res.creative || {};
        var ver = c.version || '—';
        var row = state.forkRow || {};
        var linkRow = {
          creative_version: c.version != null ? c.version : row.creative_version,
          landing_page_version: row.landing_page_version,
          utm_campaign: row.utm_campaign,
        };
        var full = buildFullTrackingUrl(linkRow);
        $('gd-fork-result-version').textContent = ver;
        $('gd-fork-result-link').textContent =
          full || '（请填写落地页网址，或依赖本页已自动保存的网址）';
        state.forkResultLink = full;
        $('gd-fork-form-wrap').style.display = 'none';
        $('gd-fork-result-wrap').style.display = '';
        refresh();
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function openLinkModal(row) {
    var chk = canBuildLink(row);
    if (!chk.ok) {
      showMsg(chk.hint, true);
      return;
    }
    state.linkRow = row;
    var q = buildTrackingQueryString(row);
    var full = buildFullTrackingUrl(row);
    $('gd-link-preview').textContent = full || '?' + q;
    var m = $('gd-modal-link');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeLinkModal() {
    state.linkRow = null;
    var m = $('gd-modal-link');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function copyLinkModal() {
    var row = state.linkRow;
    if (!row) return;
    var full = buildFullTrackingUrl(row);
    if (!full) {
      showMsg('请填写落地页网址（可使用自动记住的上次网址）。', true);
      return;
    }
    copyText(full);
  }

  function openTrackingModal(r) {
    var body = $('gd-tracking-body');
    if (!body) return;
    var html =
      '<ul style="margin:0;padding-left:1.2rem;">' +
      '<li>确认广告最终到达网址里带有活动名称、创意版本、落地页版本参数。</li>' +
      '<li>落地页提交表单时会带上这些参数，客户线索才会归到正确版本。</li>' +
      '<li>若使用 Google 广告，请确认自动标记与 gclid 能传到落地页。</li>' +
      '</ul>';
    if (r && r.reason) {
      html = '<p><strong>说明：</strong>' + escapeHtml(r.reason) + '</p>' + html;
    }
    if (state.recPayload && state.recPayload.window_signals) {
      var w = state.recPayload.window_signals;
      html +=
        '<p style="margin-top:0.75rem;"><strong>全站信号：</strong>离线转化队列中 gclid 质量偏低标记为 ' +
        (w.gclid_quality_flag ? '是' : '否') +
        '。</p>';
    }
    body.innerHTML = html;
    var m = $('gd-modal-tracking');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeTrackingModal() {
    var m = $('gd-modal-tracking');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function onRecCardClick(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('button[data-rec-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-rec-action');
    var idx = parseInt(btn.getAttribute('data-rec-idx'), 10);
    if (!action || isNaN(idx)) return;
    var r = state.recommendations[idx];
    if (!r) return;

    if (action !== 'rec_sales') focusRecommendationRow(r);

    if (action === 'rec_ok') {
      showMsg('好的。', false);
      setTimeout(function () {
        showMsg('', false);
      }, 1500);
      return;
    }
    if (action === 'rec_observe') {
      showMsg('已记录：继续观察该版本。', false);
      setTimeout(function () {
        showMsg('', false);
      }, 2000);
      return;
    }
    if (action === 'rec_scale') {
      showMsg('好的，可继续保持该版本投放。', false);
      setTimeout(function () {
        showMsg('', false);
      }, 2000);
      return;
    }
    if (action === 'rec_sales') {
      window.location.href = '/leads.html';
      return;
    }
    if (action === 'rec_tracking' || action === 'rec_tracking_win') {
      openTrackingModal(r);
      return;
    }

    var match = findTableRowMatchingRec(r);
    var row = match ? match.row : rowFromRecommendation(r);
    var res = resolveCreativeStrict(state.creatives, r.creative_version);

    if (action === 'rec_pause') {
      if (!res.ok) {
        showMsg(res.hint, true);
        return;
      }
      openPauseModal(row, res);
      return;
    }
    if (action === 'rec_fork') {
      if (!res.ok) {
        showMsg(res.hint, true);
        return;
      }
      openForkModal(row, res);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadBaseUrlFromStorage();

    var inp = $('gd-secret');
    if (inp) inp.value = getSecret();

    $('gd-save-secret') &&
      $('gd-save-secret').addEventListener('click', function () {
        var v = (inp && inp.value) || '';
        setSecret(v.trim());
        showMsg(v.trim() ? '密钥已保存到本浏览器。' : '已清除密钥。', !v.trim());
        if (v.trim()) refresh();
      });

    $('gd-refresh') && $('gd-refresh').addEventListener('click', refresh);

    document.querySelectorAll('input[name="gd-range"]').forEach(function (el) {
      el.addEventListener('change', function () {
        /* 仅改选项，不自动请求，避免误触 */
      });
    });

    $('gd-drawer-close') && $('gd-drawer-close').addEventListener('click', closeDrawer);
    $('gd-drawer-backdrop') &&
      $('gd-drawer-backdrop').addEventListener('click', function (e) {
        if (e.target === $('gd-drawer-backdrop')) closeDrawer();
      });

    $('gd-pause-confirm') && $('gd-pause-confirm').addEventListener('click', confirmPause);
    document.querySelectorAll('[data-close="pause"]').forEach(function (b) {
      b.addEventListener('click', closePauseModal);
    });

    $('gd-fork-submit') && $('gd-fork-submit').addEventListener('click', submitFork);
    document.querySelectorAll('[data-close="fork"]').forEach(function (b) {
      b.addEventListener('click', closeForkModal);
    });
    $('gd-fork-result-copy') &&
      $('gd-fork-result-copy').addEventListener('click', function () {
        if (state.forkResultLink) copyText(state.forkResultLink);
        else showMsg('请填写落地页网址，或使用已自动保存的网址后再复制。', true);
      });
    $('gd-fork-result-done') &&
      $('gd-fork-result-done').addEventListener('click', function () {
        closeForkModal();
        refresh();
      });

    $('gd-link-copy-btn') &&
      $('gd-link-copy-btn').addEventListener('click', function () {
        copyLinkModal();
      });
    document.querySelectorAll('[data-close="link"]').forEach(function (b) {
      b.addEventListener('click', closeLinkModal);
    });

    document.querySelectorAll('[data-close="tracking"]').forEach(function (b) {
      b.addEventListener('click', closeTrackingModal);
    });

    $('gd-rec-grid') &&
      $('gd-rec-grid').addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('button[data-rec-action]')) {
          onRecCardClick(ev);
          return;
        }
        var card = ev.target.closest && ev.target.closest('.gd-rec-card[data-rec-idx]');
        if (card) {
          var ridx = parseInt(card.getAttribute('data-rec-idx'), 10);
          var rec = state.recommendations[ridx];
          if (rec) focusRecommendationRow(rec);
        }
      });

    var baseUrlEl = $('gd-base-url');
    if (baseUrlEl) {
      baseUrlEl.addEventListener('blur', saveBaseUrlToStorage);
      baseUrlEl.addEventListener('change', saveBaseUrlToStorage);
    }

    if (getSecret().trim()) refresh();
  });
})();
