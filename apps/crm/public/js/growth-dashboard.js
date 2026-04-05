/**
 * Growth Dashboard — /dashboard/growth
 * Vanilla JS; funnel + ad table + recommendations + drawer/modals.
 */
(function () {
  var SECRET_KEY = 'growth_dash_secret';
  var BASE_URL_KEY = 'growth_dash_base_url';
  var OP_MODE_KEY = 'growth_dash_op_mode';
  var QUEUE_KEY = 'growth_action_queue_v1';
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
    pauseModalRow: null,
    linkRow: null,
    forkResultLink: '',
    forkResultCreative: null,
    forkResultRow: null,
    forkAdCopyPlaintext: '',
    forkLaunchPlaintext: '',
    forkLaunchUrl: '',
    drawerRow: null,
    autoActions: {
      pause_list: [],
      total: 0,
      truncated: false,
      loadFailed: false,
    },
    scaleActions: {
      scale_list: [],
      total: 0,
      truncated: false,
      loadFailed: false,
    },
    lpOptimizationList: [],
    lpOptimizationLoadFailed: false,
    lpBehaviorRows: [],
    lpBehaviorLoadFailed: false,
    adLpBestCombinations: [],
    adLpMismatches: [],
    adLpLoadFailed: false,
    lpOptOneClick: null,
  };

  function getOpMode() {
    try {
      var v = localStorage.getItem(OP_MODE_KEY);
      if (v === 'semi' || v === 'full') return v;
    } catch (e) {}
    return 'manual';
  }

  function setOpMode(v) {
    if (v !== 'manual' && v !== 'semi' && v !== 'full') v = 'manual';
    try {
      localStorage.setItem(OP_MODE_KEY, v);
    } catch (e) {}
    var radios = document.querySelectorAll('input[name="gd-op-mode"]');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].value === v) radios[i].checked = true;
    }
    applyOpModeUI();
  }

  function loadActionQueue() {
    try {
      var s = sessionStorage.getItem(QUEUE_KEY);
      if (!s) return [];
      var a = JSON.parse(s);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function saveActionQueue(q) {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch (e) {}
  }

  function newQueueId() {
    return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function enqueueAction(entry, opts) {
    opts = opts || {};
    var q = loadActionQueue();
    q.push(entry);
    saveActionQueue(q);
    renderActionQueue();
    if (!opts.silent) {
      showMsg('已加入待执行队列（半自动）。请在下方队列中批准后再执行。', false);
      setTimeout(function () {
        showMsg('', false);
      }, 2800);
    }
  }

  function removeQueueItemById(id) {
    var q = loadActionQueue().filter(function (x) {
      return x.id !== id;
    });
    saveActionQueue(q);
    renderActionQueue();
  }

  function whyModalBlocksHtml(blocks) {
    if (!blocks || !blocks.length) return '<p class="muted">暂无说明</p>';
    return blocks
      .map(function (b) {
        return (
          '<div class="gd-why-block"><strong>' +
          escapeHtml(b.label) +
          '</strong><div>' +
          escapeHtml(b.text) +
          '</div></div>'
        );
      })
      .join('');
  }

  function openWhyModal(title, blocks) {
    var t = $('gd-why-title');
    var b = $('gd-why-body');
    var m = $('gd-modal-why');
    if (t) t.textContent = title || '为什么这样建议';
    if (b) b.innerHTML = whyModalBlocksHtml(blocks);
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeWhyModal() {
    var m = $('gd-modal-why');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function closeWalkthroughModal() {
    var m = $('gd-modal-walkthrough');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function openWalkthroughModal() {
    var m = $('gd-modal-walkthrough');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function buildWhyAutoPauseItem(item) {
    var m = item.metrics || {};
    return {
      title: '为什么建议暂停该创意版本',
      blocks: [
        {
          label: '触发规则',
          text:
            '在当前所选日期范围内，系统已能观察到「有付费」的其它广告版本作对照；本创意版本线索数≥10、线索→赢单比例低于10%、且尚无已付发票，才会进入待暂停列表（不含追踪异常等特殊情况）。',
        },
        {
          label: '当前数据（本创意版本）',
          text:
            '线索：' +
            String(m.leads != null ? m.leads : '—') +
            '；线索→赢单：' +
            fmtPct(m.lead_to_won_pct) +
            '；已付发票：' +
            String(m.invoices_paid != null ? m.invoices_paid : '—') +
            '。',
        },
        {
          label: '对照说明',
          text:
            '同一统计窗口内，已有其它组合产生付费，说明预算可以流向更有效版本；本组合在样本足够时仍无付费且赢单率偏低，适合优先暂停以免继续消耗。',
        },
        {
          label: '系统建议动作',
          text: '将对应创意在库中标记为「暂停」（不在此页直接改广告平台投放开关）。',
        },
        {
          label: '为什么现在建议这么做',
          text: item.reason || '（无额外说明）',
        },
      ],
    };
  }

  function buildWhyScaleItem(item) {
    var m = item.metrics || {};
    return {
      title: '为什么列为「值得放大」候选',
      blocks: [
        {
          label: '触发规则',
          text:
            '在当前日期范围内：已付发票≥2、线索→赢单比例≥20%、创意仍为活跃状态，且落地页版本信息完整时，会进入放大候选列表。',
        },
        {
          label: '当前数据',
          text:
            '线索：' +
            String(m.leads != null ? m.leads : '—') +
            '；赢单：' +
            String(m.opportunities_won != null ? m.opportunities_won : '—') +
            '；已付：' +
            String(m.invoices_paid != null ? m.invoices_paid : '—') +
            '；线索→赢单：' +
            fmtPct(m.lead_to_won_pct) +
            '；付费合计：' +
            fmtMoney(m.total_paid_value) +
            '。',
        },
        {
          label: '对照数据',
          text: '本类建议以「已有多笔真实付费 + 转化率达标」为门槛，与仅有点击无成交的版本形成对照。',
        },
        {
          label: '系统建议动作',
          text: '可继续保持投放，或「复制新版本」做 A/B 测试；也可「生成链接」用于投放核对。',
        },
        {
          label: '为什么现在建议这么做',
          text: item.reason || '（无额外说明）',
        },
      ],
    };
  }

  function buildWhyLpOptItem(item) {
    return {
      title: '为什么建议优化该落地页版本',
      blocks: [
        {
          label: '触发规则',
          text:
            '当前版本在统计窗口内线索量足够，但线索→赢单比例偏低；且在同活动或同产品线中，存在已登记在库、表现更好的其它落地页版本可供对照。',
        },
        {
          label: '当前数据',
          text:
            '落地页版本：' +
            String(item.landing_page_version || '—') +
            '；本版线索→赢单约 ' +
            String(item.lead_to_won_pct != null ? item.lead_to_won_pct : '—') +
            '%。',
        },
        {
          label: '对照数据',
          text:
            '更好版本：' +
            String(item.better_version || '—') +
            '，其线索→赢单约 ' +
            String(item.better_lead_to_won_pct != null ? item.better_lead_to_won_pct : '—') +
            '%；活动：' +
            dimText(item.utm_campaign) +
            '。',
        },
        {
          label: '系统建议动作',
          text: '结合更好版本结构与用户行为阶段生成英文文案，经你确认后新建一条落地页草稿版本，不覆盖旧版。',
        },
        {
          label: '为什么现在建议这么做',
          text: item.reason || '在同样流量成本下，优先对齐高转化版本的表达与结构，可更快验证是否能抬升赢单率。',
        },
      ],
    };
  }

  function buildWhyLpBehaviorRow(row) {
    var s = row.suggestion;
    var sug =
      s && typeof s === 'object'
        ? String(s.problem_title || '') +
          ' ' +
          String(s.action_text || '')
        : '（无结构化建议）';
    return {
      title: '为什么给出这条行为诊断',
      blocks: [
        {
          label: '触发规则',
          text:
            '基于落地页埋点统计的浏览、滚动、开始填表、提交等比例；当某阶段明显低于常见水平或相对其它版本偏差较大时，会生成阶段提示与文案建议。',
        },
        {
          label: '当前数据',
          text:
            '版本：' +
            String(row.landing_page_version || '—') +
            '；浏览：' +
            String(row.page_views != null ? row.page_views : '—') +
            '；滚动参与率：' +
            fmtPct(row.scroll_rate_pct) +
            '；开始表单率：' +
            fmtPct(row.form_start_rate_pct) +
            '；提交率：' +
            fmtPct(row.submit_rate_pct) +
            '。',
        },
        {
          label: '对照说明',
          text: row.drop_off_hint || '（无单独对照句）',
        },
        {
          label: '系统建议动作',
          text: sug.trim() || '优化该阶段对应的文案或版式，并在小流量下复测。',
        },
        {
          label: '为什么现在建议这么做',
          text:
            '行为漏斗能早于「赢单/付费」暴露体验问题；在数据样本可读时优先修短板，往往比单纯加预算更有效。',
        },
      ],
    };
  }

  function buildWhyRecommendation(r) {
    var typeZh = {
      pause: '建议暂停',
      observe: '继续观察',
      scale: '表现最好',
      fork: '建议试新版本',
      tracking_issue: '追踪异常',
      sales_issue: '跟进问题',
    };
    var t = typeZh[r.type] || r.type;
    return {
      title: '为什么卡片上这样写',
      blocks: [
        {
          label: '触发规则',
          text:
            '系统按预设阈值与全窗口信号（如追踪质量）对每条「创意×落地页×活动」打标签；具体类型包括暂停、观察、放大、复制试新、追踪异常、销售跟进等。',
        },
        {
          label: '当前数据（卡片维度）',
          text:
            '创意版本：' +
            dimText(r.creative_version) +
            '；落地页：' +
            dimText(r.landing_page_version) +
            '；活动：' +
            dimText(r.utm_campaign) +
            '。优先级：' +
            sevLabelZh(r.severity) +
            '。',
        },
        {
          label: '对照数据',
          text:
            r.scope === 'cohort_window'
              ? '本条为全站或全窗口级提示，不绑定单一版本组合。'
              : '与同一统计区间内其它版本组合及全站汇总一并参与规则计算。',
        },
        {
          label: '系统建议动作',
          text: '见卡片主按钮（暂停、复制、查看问题等）。',
        },
        {
          label: '为什么现在建议这么做',
          text: r.reason || '（无详细理由）',
        },
      ],
    };
  }

  function buildWhyAdRowRecommendation(row, rec) {
    if (!rec)
      return buildWhyRecommendation({
        type: 'observe',
        severity: 'low',
        reason: '本行暂无匹配的系统建议卡片；可对照上方徽章或「三、系统建议」中的其它条目。',
        creative_version: row.creative_version,
        landing_page_version: row.landing_page_version,
        utm_campaign: row.utm_campaign,
        scope: '',
      });
    return buildWhyRecommendation(rec);
  }

  function buildWhyTablePauseRow(row) {
    return {
      title: '为什么可以暂停该版本',
      blocks: [
        {
          label: '触发规则',
          text:
            '主表上的「建议暂停」来自与「三、系统建议」相同的规则引擎；若徽章显示建议暂停，通常表示在样本量与对照满足阈值时，该组合表现偏弱或存在风险信号。',
        },
        {
          label: '当前数据（本行）',
          text:
            '线索：' +
            String(row.leads ?? '0') +
            '；赢单：' +
            String(row.opportunities_won ?? '0') +
            '；已付：' +
            String(row.invoices_paid ?? '0') +
            '；线索→赢单：' +
            fmtPct(row.lead_to_won_pct) +
            '；付费合计：' +
            fmtMoney(row.total_paid_value) +
            '。',
        },
        {
          label: '对照数据',
          text: '请结合同表其它版本、以及本页漏斗与「待暂停」列表中的对照说明一并判断。',
        },
        {
          label: '系统建议动作',
          text: '将创意库中对应记录设为「暂停」，避免继续向该版本标签导流。',
        },
        {
          label: '为什么现在建议这么做',
          text: '在数据已可读的前提下，先停掉明显偏弱版本，把预算留给已验证能带来成交的组合，通常比「再观察很久」更省广告费。',
        },
      ],
    };
  }

  function buildWhyForkQueue(row) {
    return {
      title: '为什么可以复制新版本',
      blocks: [
        {
          label: '触发规则',
          text:
            '当系统判断某版本已有付费或转化较好、或建议试新文案时，会引导你基于现有创意复制一条新版本（常见为草稿），便于在广告平台做 A/B。',
        },
        {
          label: '当前数据',
          text:
            row
              ? '创意版本：' +
                dimText(row.creative_version) +
                '；落地页：' +
                dimText(row.landing_page_version) +
                '；活动：' +
                dimText(row.utm_campaign) +
                '。'
              : '（行信息暂缺）',
        },
        {
          label: '对照数据',
          text: '新版本会继承当前落地页与活动参数，仅改文案或状态，便于与旧版并排对比。',
        },
        {
          label: '系统建议动作',
          text: '在创意库中新建一条版本记录（你可在弹窗中改标题/描述/按钮文案），再按流程上线到广告。',
        },
        {
          label: '为什么现在建议这么做',
          text: '在表现好的版本上小步试新，比从零写创意风险更低；草稿状态也便于内部先审再投放。',
        },
      ],
    };
  }

  function buildWhyLpPublishQueue() {
    return {
      title: '为什么创建新的落地页版本',
      blocks: [
        {
          label: '触发规则',
          text:
            '当某落地页版本转化率明显低于库中已登记的更好版本，且线索量足够时，系统会建议基于更好版本的结构并结合行为阶段生成新文案。',
        },
        {
          label: '当前数据',
          text: '见「落地页优化」表格中该行的转化率、更好版本与活动列。',
        },
        {
          label: '对照数据',
          text: '「更好版本」来自落地页库中已存在、且在同活动/产品线对比下表现更优的 lpv。',
        },
        {
          label: '系统建议动作',
          text: '新建一条落地页草稿版本，不覆盖旧版；上线前需在站点或 Growth Ops 核对路由与 lpv。',
        },
        {
          label: '为什么现在建议这么做',
          text: '结构已验证有效时，优先对齐文案与阶段痛点，往往比大改整页更快验证。',
        },
      ],
    };
  }

  function executeQueueItem(item) {
    switch (item.kind) {
      case 'pause_creative':
        return pauseCreativeById(item.payload.creativeId);
      case 'fork_publish':
        return fetchJson(
          '/api/ads/creatives/' + encodeURIComponent(item.payload.creativeId) + '/publish-new-version',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withSecretBody(item.payload.body)),
          }
        );
      case 'lp_publish':
        return fetchJson(
          '/api/ads/landing-pages/' +
            encodeURIComponent(item.payload.source_landing_page_id) +
            '/publish-new-version',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withSecretBody(item.payload.body)),
          }
        );
      default:
        return Promise.reject(new Error('未知队列动作'));
    }
  }

  function approveQueueItemById(id) {
    var q = loadActionQueue();
    var item = null;
    for (var i = 0; i < q.length; i++) {
      if (q[i].id === id) {
        item = q[i];
        break;
      }
    }
    if (!item) return;
    if (!getSecret().trim()) {
      showMsg('请先保存密钥。', true);
      return;
    }
    if (getOpMode() === 'full') {
      showMsg('全自动模式尚未启用，无法从队列执行。', true);
      return;
    }
    showMsg('正在执行：' + item.title + '…', false);
    executeQueueItem(item)
      .then(function (res) {
        removeQueueItemById(id);
        showMsg('已执行：' + item.title + '。', false);
        if (item.kind === 'fork_publish' && res && res.creative) {
          /* 可选：打开结果卡 — 保持简单，仅刷新 */
        }
        closeLpOptGenModal();
        refresh();
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function renderActionQueue() {
    var sec = $('gd-queue-section');
    var tbody = $('gd-queue-tbody');
    if (!sec || !tbody) return;
    if (getOpMode() !== 'semi') {
      sec.style.display = 'none';
      return;
    }
    sec.style.display = '';
    var q = loadActionQueue();
    if (!q.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="muted">队列为空。可在「待暂停/放大」详情、主表暂停确认、复制新版本、落地页一键优化等处将动作加入队列。</td></tr>';
      return;
    }
    tbody.innerHTML = q
      .map(function (item) {
        return (
          '<tr>' +
          '<td>' +
          escapeHtml(item.title) +
          '</td>' +
          '<td style="font-size:0.82rem;">' +
          escapeHtml(item.targetLine) +
          '</td>' +
          '<td style="font-size:0.82rem;">' +
          escapeHtml(item.reasonLine) +
          '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm gd-queue-why" data-queue-id="' +
          escapeHtml(item.id) +
          '">查看原因</button> ' +
          '<button type="button" class="btn btn-sm btn-primary gd-queue-approve" data-queue-id="' +
          escapeHtml(item.id) +
          '">批准执行</button> ' +
          '<button type="button" class="btn btn-sm gd-queue-dismiss" data-queue-id="' +
          escapeHtml(item.id) +
          '">暂不执行</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function applyOpModeUI() {
    var mode = getOpMode();
    var ban = $('gd-op-banner');
    if (ban) {
      ban.className = 'gd-op-banner';
      if (mode === 'manual') {
        ban.classList.add('muted');
        ban.textContent =
          '人工驾驶：页面只展示数据与建议；单条暂停、复制、落地页发布等仍可直接点按钮执行。批量「一键暂停全部」不可用——若希望先审再执行，请切换到半自动并将动作加入下方队列。';
      } else if (mode === 'semi') {
        ban.textContent =
          '半自动：可执行动作会先进入「待执行队列」，必须点「批准执行」后才会真正提交到服务器（无定时任务）。';
      } else {
        ban.classList.add('warn');
        ban.textContent =
          '全自动：尚未启用。系统不会代替你批量执行暂停或发布；请使用人工驾驶或半自动。';
      }
    }

    var batchBtn = $('gd-auto-pause-all');
    var batchConf = $('gd-auto-pause-batch-confirm');
    var t = state.autoActions.total || 0;
    if (batchBtn) {
      batchBtn.disabled =
        !getSecret().trim() ||
        state.autoActions.loadFailed ||
        t === 0 ||
        mode === 'full' ||
        mode === 'manual';
      batchBtn.title =
        mode === 'manual'
          ? '人工驾驶下请使用详情中的单条暂停，或切换到半自动以使用队列。'
          : '';
    }
    if (batchConf) {
      batchConf.textContent = mode === 'semi' ? '全部加入队列' : '确认暂停';
    }

    var pc = $('gd-pause-confirm');
    if (pc) pc.textContent = mode === 'semi' ? '加入队列' : '确认暂停';

    var fs = $('gd-fork-submit');
    if (fs) fs.textContent = mode === 'semi' ? '加入队列' : '创建新版本';

    var lpPub = $('gd-lp-opt-gen-publish');
    if (lpPub) lpPub.textContent = mode === 'semi' ? '加入队列' : '创建新版本';

    renderScaleActionsBanner();
    var scaleFork = $('gd-scale-fork-btn');
    if (mode === 'full' && scaleFork) scaleFork.disabled = true;

    renderActionQueue();
  }

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

  /**
   * 复制新版本成功后的广告落地链接：cv → lpv → utm_campaign（与追踪链接模块参数顺序区分）。
   */
  function buildForkAdUrl(landingBase, cv, lpv, utm) {
    var b = landingBase == null ? '' : String(landingBase).trim();
    if (!b) return '';
    var u = b.split('#')[0];
    var sep = u.indexOf('?') >= 0 ? '&' : '?';
    return (
      u +
      sep +
      'cv=' +
      encodeURIComponent(cv == null ? '' : String(cv)) +
      '&lpv=' +
      encodeURIComponent(lpv == null ? '' : String(lpv)) +
      '&utm_campaign=' +
      encodeURIComponent(utm == null ? '' : String(utm))
    );
  }

  function getForkLandingBase(creative) {
    var fromC = creative && creative.landing_url ? String(creative.landing_url).trim() : '';
    if (fromC) return fromC;
    return getBaseUrlEffective();
  }

  function normalizeProductLine(pl) {
    var s = String(pl == null ? '' : pl)
      .toLowerCase()
      .trim()
      .replace(/-/g, '_');
    if (s === 'pre_purchase') return 'pre_purchase';
    if (s === 'rental') return 'rental';
    if (s === 'energy') return 'energy';
    return 'energy';
  }

  function resolveAngle(productLine, angle) {
    if (angle === 'risk' || angle === 'cost' || angle === 'safety') return angle;
    if (productLine === 'rental') return 'safety';
    if (productLine === 'pre_purchase') return 'cost';
    return 'cost';
  }

  /**
   * 高转化规则文案（电工检查 / 能源咨询），英文，适配 Google Ads。
   * 默认 3 条：2 条风险/损失/知情导向 + 1 条结果/时间型；条数 5 时补足第三条风险模板 + 第二条时间型。
   */
  function generateAdVariants(opts) {
    opts = opts || {};
    var n = parseInt(String(opts.count), 10);
    if (![1, 3, 5].includes(n)) n = 3;
    var productLine = normalizeProductLine(opts.product_line);
    var angle = resolveAngle(productLine, opts.angle || null);
    var version = opts.version != null ? String(opts.version).trim() : '';

    var L = adCopyLexicon(productLine, angle);
    var risks = L.risks;
    var actionsBefore = L.actionsBefore;
    var actionsDont = L.actionsDont;
    var results = L.results;
    var times = L.times;
    var descParts = L.desc;

    function headlineAvoid(i) {
      return (
        'Avoid ' +
        risks[i % risks.length] +
        ' Before ' +
        actionsBefore[i % actionsBefore.length]
      );
    }
    function headlineLoss(i) {
      return (
        "Don't " +
        actionsDont[i % actionsDont.length] +
        ' Until You Check ' +
        risks[(i + 1) % risks.length]
      );
    }
    function headlineKnow(i) {
      return (
        'Know ' +
        risks[(i + 2) % risks.length] +
        ' Before ' +
        actionsBefore[(i + 1) % actionsBefore.length]
      );
    }
    function headlineTime(i) {
      return 'Get ' + results[i % results.length] + ' in ' + times[i % times.length];
    }

    function buildDescription(idx) {
      var r = descParts.results[idx % descParts.results.length];
      var t = descParts.trust[idx % descParts.trust.length];
      var c = descParts.cta[idx % descParts.cta.length];
      var tail = version ? ' Ref ' + version + '.' : '';
      return r + ' ' + t + ' ' + c + tail;
    }

    var out = [];
    if (n >= 1) {
      out.push({ headline: headlineAvoid(0), description: buildDescription(0) });
    }
    if (n >= 2) {
      out.push({ headline: headlineLoss(0), description: buildDescription(1) });
    }
    if (n >= 3) {
      out.push({ headline: headlineTime(0), description: buildDescription(2) });
    }
    if (n >= 4) {
      out.push({ headline: headlineKnow(0), description: buildDescription(3) });
    }
    if (n >= 5) {
      out.push({ headline: headlineTime(1), description: buildDescription(4) });
    }
    return out.slice(0, n);
  }

  function adCopyLexicon(productLine, angle) {
    var base = {
      risks: [],
      actionsBefore: [],
      actionsDont: [],
      results: [],
      times: ['48 Hours', 'This Week', 'Minutes Online'],
      desc: {
        results: [],
        trust: [
          'Licensed electrician review.',
          'Independent advice — no sales pressure.',
          'Clear scope before you commit.',
        ],
        cta: ['Book now.', 'Request inspection.', 'Get started today.'],
      },
    };

    if (productLine === 'pre_purchase') {
      base.risks = [
        angle === 'safety' ? 'Hidden Safety Issues' : '$5,000+ Surprise Costs',
        angle === 'risk' ? 'Costly Defects' : '$1,000+ Repair Bills',
        'Settlement Regrets',
      ];
      base.actionsBefore = ['You Settle', 'You Buy', 'Signing'];
      base.actionsDont = ['Settle', 'Buy', 'Sign'];
      base.results = [
        'A Pre-Settlement Electrical Read',
        'Clarity Before Buying',
        'Your Settlement Checklist',
      ];
      base.desc.results = [
        'Identify hidden electrical issues before settlement.',
        'Avoid $5,000+ repair surprises after you buy.',
        'Know electrical condition before you sign.',
      ];
    } else if (productLine === 'rental') {
      base.risks = [
        angle === 'cost' ? 'Compliance Fines' : 'Tenant Safety Risks',
        'Insurance Gaps',
        'Legal Liability',
      ];
      base.actionsBefore = ['You Lease Out', 'Tenants Move In', 'You Sign'];
      base.actionsDont = ['Lease Out', 'Let Tenants In', 'Sign'];
      base.results = [
        'Compliance Peace of Mind',
        'A Documented Safety Check',
        'Rental-Ready Electrical Clarity',
      ];
      base.desc.results = [
        'Spot safety and compliance risks before lease-up.',
        'Reduce landlord liability with a documented electrical check.',
        'Independent rental electrical assessment.',
      ];
    } else {
      base.risks = [
        angle === 'safety' ? 'Unsafe Circuits' : 'Bill Shock',
        'Overspending on Power',
        'Missed Savings',
      ];
      base.actionsBefore = ['You Pay', 'The Bill Arrives', 'You Switch'];
      base.actionsDont = ['Pay', 'Open That Bill', 'Switch Plans'];
      base.results = [
        'Your Bill Checked',
        'Independent Cost Clarity',
        'A Smarter Energy Read',
      ];
      base.desc.results = [
        'Find bill errors and hidden usage costs.',
        'Compare options before you overpay another quarter.',
        'Independent read on what your bill really says.',
      ];
    }

    if (angle === 'risk') {
      if (productLine === 'pre_purchase') {
        base.risks = ['Costly Hidden Defects', '$5,000+ Surprise Costs', 'Last-Minute Settlement Risk'];
      } else if (productLine === 'rental') {
        base.risks = ['Serious Electrical Hazards', 'Insurance Gaps', 'Legal Liability'];
      } else {
        base.risks = ['Silent Bill Shock', 'Overspending on Power', 'Missed Savings'];
      }
    }
    return base;
  }

  function renderForkAdCopyBlocks() {
    var el = $('gd-fork-ad-copy-blocks');
    var sel = $('gd-fork-ad-count');
    if (!el || !state.forkResultCreative) return;
    var count = parseInt((sel && sel.value) || '3', 10);
    if (![1, 3, 5].includes(count)) count = 3;
    var c = state.forkResultCreative;
    var row = state.forkResultRow || {};
    var cv = c.version != null ? String(c.version) : '';
    var lpv = row.landing_page_version != null ? String(row.landing_page_version) : '';
    var utm = row.utm_campaign != null ? String(row.utm_campaign) : '';
    var base = getForkLandingBase(c);
    var url = buildForkAdUrl(base, cv, lpv, utm);
    var angleEl = $('gd-fork-ad-angle');
    var angleVal =
      angleEl && String(angleEl.value || '').trim() !== '' ? String(angleEl.value).trim() : null;
    var variants = generateAdVariants({
      product_line: c.product_line,
      version: cv,
      angle: angleVal,
      count: count,
    });
    var plainParts = [];
    el.innerHTML = variants
      .map(function (v, i) {
        plainParts.push(
          (i > 0 ? '\n' : '') +
            '标题：\n' +
            v.headline +
            '\n\n描述：\n' +
            v.description +
            '\n\n链接：\n' +
            (url || '') +
            '\n'
        );
        return (
          '<div class="gd-ad-variant">' +
          '<div class="lbl">广告 ' +
          (i + 1) +
          '</div>' +
          '<div class="lbl">标题</div><pre>' +
          escapeHtml(v.headline) +
          '</pre>' +
          '<div class="lbl">描述</div><pre>' +
          escapeHtml(v.description) +
          '</pre>' +
          '<div class="lbl">链接</div><pre>' +
          escapeHtml(url || '（请填写落地页网址，或在创意库中维护落地页）') +
          '</pre>' +
          '</div>'
        );
      })
      .join('');
    state.forkAdCopyPlaintext = plainParts.join('');
  }

  /**
   * 投放准备卡：用 generateAdVariants(count=5) 取前 3 条标题、前 2 条描述 + 完整链接。
   */
  function buildForkLaunchPack() {
    var c = state.forkResultCreative;
    var row = state.forkResultRow || {};
    if (!c) return null;
    var cv = c.version != null ? String(c.version) : '';
    var lpv = row.landing_page_version != null ? String(row.landing_page_version) : '';
    var utm = row.utm_campaign != null ? String(row.utm_campaign) : '';
    var angleEl = $('gd-fork-ad-angle');
    var angleVal =
      angleEl && String(angleEl.value || '').trim() !== '' ? String(angleEl.value).trim() : null;
    var variants = generateAdVariants({
      product_line: c.product_line,
      version: cv,
      angle: angleVal,
      count: 5,
    });
    var headlines = variants.slice(0, 3).map(function (v) {
      return v.headline;
    });
    var descriptions = variants.slice(0, 2).map(function (v) {
      return v.description;
    });
    var base = getForkLandingBase(c);
    var url = buildForkAdUrl(base, cv, lpv, utm);
    return {
      cv: cv,
      lpv: lpv,
      utm: utm,
      headlines: headlines,
      descriptions: descriptions,
      url: url || '',
    };
  }

  function renderForkLaunchReadyCard() {
    var hOl = $('gd-fork-launch-headlines');
    var dOl = $('gd-fork-launch-descs');
    var urlEl = $('gd-fork-launch-url-preview');
    var paramEl = $('gd-fork-launch-param-line');
    var verStrong = $('gd-fork-launch-cv');
    if (!hOl || !dOl || !urlEl || !state.forkResultCreative) return;
    var pack = buildForkLaunchPack();
    if (!pack) return;
    if (verStrong) verStrong.textContent = pack.cv || '—';
    hOl.innerHTML = pack.headlines
      .map(function (h) {
        return '<li><pre class="gd-fork-launch-pre">' + escapeHtml(h) + '</pre></li>';
      })
      .join('');
    dOl.innerHTML = pack.descriptions
      .map(function (d) {
        return '<li><pre class="gd-fork-launch-pre">' + escapeHtml(d) + '</pre></li>';
      })
      .join('');
    urlEl.textContent =
      pack.url ||
      '（请填写落地页网址，或在创意库中维护落地页；需 utm_campaign、cv、lpv 齐全）';
    var paramText =
      '链接参数：utm_campaign=' +
      (pack.utm ? String(pack.utm) : '（空）') +
      ' · cv=' +
      (pack.cv || '（空）') +
      ' · lpv=' +
      (pack.lpv || '（空）') +
      ' · gclid：请在 Google Ads 开启「自动标记」，点击后由 Google 附加，无需写入最终到达网址。';
    if (paramEl) paramEl.textContent = paramText;
    state.forkLaunchPlaintext =
      '新创意版本（cv）：\n' +
      pack.cv +
      '\n\n推荐广告标题（3）：\n' +
      pack.headlines
        .map(function (h, i) {
          return i + 1 + '. ' + h;
        })
        .join('\n') +
      '\n\n推荐描述（2）：\n' +
      pack.descriptions
        .map(function (d, i) {
          return i + 1 + '. ' + d;
        })
        .join('\n') +
      '\n\n完整广告链接：\n' +
      (pack.url || '') +
      '\n\n' +
      paramText;
    state.forkLaunchUrl = pack.url || '';
  }

  function copyForkLaunchContent() {
    var t = state.forkLaunchPlaintext || '';
    if (!t.trim()) {
      showMsg('暂无可复制内容。', true);
      return;
    }
    copyText(t);
  }

  function copyForkLaunchUrl() {
    var u = state.forkLaunchUrl || state.forkResultLink || '';
    if (!u.trim()) {
      showMsg('请先填写落地页网址，并确保活动名与落地页版本已填。', true);
      return;
    }
    copyText(u);
  }

  function copyForkAdAll() {
    var t = state.forkAdCopyPlaintext || '';
    if (!t.trim()) {
      showMsg('暂无可复制内容。', true);
      return;
    }
    copyText(t);
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
    var adLpSec = $('gd-ad-lp-section');

    $('gd-funnel-state').textContent = '加载中…';
    $('gd-ad-state').textContent = '加载中…';
    $('gd-rec-state').textContent = '加载中…';
    var adlpState = $('gd-adlp-state');
    if (adlpState) adlpState.textContent = '加载中…';
    setSectionLoading(funnelSec, true);
    setSectionLoading(adSec, true);
    setSectionLoading(recSec, true);
    setSectionLoading(adLpSec, true);

    var convP = fetchJson('/api/analytics/conversion-performance?' + qs).catch(function (e) {
      return { _err: e.message || String(e) };
    });

    var recP = fetchJson('/api/analytics/ad-recommendations?' + qs).catch(function (e) {
      return { ok: false, recommendations: [], _recError: e.message || String(e) };
    });

    var autoP = fetchJson('/api/analytics/ad-auto-actions?' + qs).catch(function (e) {
      return {
        ok: false,
        pause_list: [],
        total: 0,
        truncated: false,
        _autoErr: e.message || String(e),
      };
    });

    var scaleP = fetchJson('/api/analytics/ad-scale-actions?' + qs).catch(function (e) {
      return {
        ok: false,
        scale_list: [],
        total: 0,
        truncated: false,
        _scaleErr: e.message || String(e),
      };
    });

    var lpOptP = fetchJson('/api/analytics/lp-optimization-actions?' + qs).catch(function (e) {
      return {
        lp_optimization_list: [],
        total: 0,
        _lpErr: e.message || String(e),
      };
    });

    var lpBehP = fetchJson('/api/analytics/lp-behavior?' + qs).catch(function (e) {
      return { ok: false, rows: [], _lpBehErr: e.message || String(e) };
    });

    var adLpP = fetchJson('/api/analytics/ad-lp-combinations?' + qs).catch(function (e) {
      return { ok: false, _adLpErr: e.message || String(e) };
    });

    Promise.all([
      fetchJson('/api/analytics/ad-performance?' + qs),
      fetchJson('/api/ads/creatives?limit=500').catch(function () {
        return { creatives: [] };
      }),
      recP,
      convP,
      autoP,
      scaleP,
      lpOptP,
      lpBehP,
      adLpP,
    ])
      .then(function (quad) {
        var perf = quad[0];
        var cr = quad[1];
        var recPayload = quad[2];
        var conv = quad[3];
        var autoPayload = quad[4];
        var scalePayload = quad[5];
        var lpPayload = quad[6];
        var lpBehPayload = quad[7];
        var adLpPayload = quad[8];

        setSectionLoading(funnelSec, false);
        setSectionLoading(adSec, false);
        setSectionLoading(recSec, false);
        setSectionLoading(adLpSec, false);

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

        if (autoPayload._autoErr) {
          state.autoActions = {
            pause_list: [],
            total: 0,
            truncated: false,
            loadFailed: true,
          };
        } else {
          var pl = autoPayload.pause_list || [];
          state.autoActions = {
            pause_list: pl,
            total: autoPayload.total != null ? autoPayload.total : pl.length,
            truncated: !!autoPayload.truncated,
            loadFailed: false,
          };
        }
        renderAutoActionsBanner();
        renderAutoActionsModalTable();

        if (scalePayload._scaleErr) {
          state.scaleActions = {
            scale_list: [],
            total: 0,
            truncated: false,
            loadFailed: true,
          };
        } else {
          var sl = scalePayload.scale_list || [];
          state.scaleActions = {
            scale_list: sl,
            total: scalePayload.total != null ? scalePayload.total : sl.length,
            truncated: !!scalePayload.truncated,
            loadFailed: false,
          };
        }
        renderScaleActionsBanner();
        renderScaleActionsModalTable();

        if (lpPayload._lpErr) {
          state.lpOptimizationList = [];
          state.lpOptimizationLoadFailed = true;
        } else {
          state.lpOptimizationList = lpPayload.lp_optimization_list || [];
          state.lpOptimizationLoadFailed = false;
        }
        if (lpBehPayload._lpBehErr) {
          state.lpBehaviorRows = [];
          state.lpBehaviorLoadFailed = true;
        } else {
          state.lpBehaviorRows = lpBehPayload.rows || [];
          state.lpBehaviorLoadFailed = false;
        }
        renderLpOptimizationBanner();

        if (adLpPayload._adLpErr) {
          state.adLpBestCombinations = [];
          state.adLpMismatches = [];
          state.adLpLoadFailed = true;
        } else {
          state.adLpBestCombinations = adLpPayload.best_combinations || [];
          state.adLpMismatches = adLpPayload.mismatches || [];
          state.adLpLoadFailed = false;
        }
        renderAdLpCombinationsSection();

        renderAdTable();
        renderRecCards();
        applyOpModeUI();
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
        setSectionLoading($('gd-ad-lp-section'), false);
        $('gd-funnel-state').textContent = '';
        $('gd-ad-state').textContent = '';
        $('gd-rec-state').textContent = '';
        var adlpSt = $('gd-adlp-state');
        if (adlpSt) adlpSt.textContent = '';
        showMsg(e.message || String(e), true);
        $('gd-ad-tbody').innerHTML =
          '<tr><td colspan="11" class="muted">加载失败：' + escapeHtml(e.message || String(e)) + '</td></tr>';
        $('gd-rec-grid').innerHTML =
          '<div class="muted" style="grid-column:1/-1;">加载失败</div>';
        state.autoActions = {
          pause_list: [],
          total: 0,
          truncated: false,
          loadFailed: true,
        };
        state.scaleActions = {
          scale_list: [],
          total: 0,
          truncated: false,
          loadFailed: true,
        };
        state.lpOptimizationList = [];
        state.lpOptimizationLoadFailed = true;
        state.lpBehaviorRows = [];
        state.lpBehaviorLoadFailed = true;
        state.adLpBestCombinations = [];
        state.adLpMismatches = [];
        state.adLpLoadFailed = true;
        renderAutoActionsBanner();
        renderScaleActionsBanner();
        renderLpOptimizationBanner();
        renderAdLpCombinationsSection();
      });
  }

  function renderAdLpCombinationsSection() {
    var bestTb = $('gd-adlp-best-tbody');
    var misTb = $('gd-adlp-mismatch-tbody');
    var st = $('gd-adlp-state');
    if (!bestTb || !misTb) return;

    if (!getSecret().trim()) {
      if (st) st.textContent = '';
      bestTb.innerHTML = '<tr><td colspan="6" class="muted">请先保存密钥并刷新。</td></tr>';
      misTb.innerHTML = '<tr><td colspan="4" class="muted">请先保存密钥并刷新。</td></tr>';
      return;
    }

    if (state.adLpLoadFailed) {
      if (st) st.textContent = '组合数据加载失败。';
      bestTb.innerHTML = '<tr><td colspan="6" class="muted">加载失败</td></tr>';
      misTb.innerHTML = '<tr><td colspan="4" class="muted">加载失败</td></tr>';
      return;
    }

    if (st) {
      st.textContent =
        '统计区间：' +
        state.range.from +
        ' ~ ' +
        state.range.to +
        '。不匹配时系统推荐仅替换落地页版本（lpv），创意版本与活动名保持不变。';
    }

    var best = state.adLpBestCombinations || [];
    if (!best.length) {
      bestTb.innerHTML =
        '<tr><td colspan="6" class="muted">暂无满足条件的组合（需已付发票 ≥ 2）。</td></tr>';
    } else {
      bestTb.innerHTML = best
        .map(function (row, idx) {
          return (
            '<tr>' +
            '<td><strong>' +
            escapeHtml(String(row.creative_version || '—')) +
            '</strong></td>' +
            '<td>' +
            escapeHtml(String(row.landing_page_version || '—')) +
            '</td>' +
            '<td style="max-width:10rem;word-break:break-word;font-size:0.85rem;">' +
            escapeHtml(dimText(row.utm_campaign)) +
            '</td>' +
            '<td>' +
            escapeHtml(String(row.conversion_rate != null ? row.conversion_rate : '—')) +
            '%</td>' +
            '<td>' +
            escapeHtml(String(row.invoices_paid != null ? row.invoices_paid : '—')) +
            '</td>' +
            '<td style="white-space:nowrap;"><button type="button" class="btn btn-sm btn-primary gd-adlp-best-link" data-adlp-best-idx="' +
            idx +
            '">生成广告链接</button></td>' +
            '</tr>'
          );
        })
        .join('');
    }

    var mis = state.adLpMismatches || [];
    if (!mis.length) {
      misTb.innerHTML =
        '<tr><td colspan="4" class="muted">暂无：未在同一活动下发现 lpv 间转化率差 &gt; 10% 且样本足够的组合。</td></tr>';
    } else {
      misTb.innerHTML = mis
        .map(function (m, idx) {
          var cur =
            '<strong>cv</strong> ' +
            escapeHtml(String(m.creative_version || '—')) +
            '<br/><strong>lpv</strong> ' +
            escapeHtml(String(m.worse_lpv || '—')) +
            '<br/><span class="muted" style="font-size:0.78rem;">' +
            escapeHtml(dimText(m.utm_campaign)) +
            '</span>';
          var rec =
            '<strong>cv</strong> ' +
            escapeHtml(String(m.creative_version || '—')) +
            '<br/><strong>lpv</strong> ' +
            escapeHtml(String(m.better_lpv || '—')) +
            '<br/><span class="muted" style="font-size:0.78rem;">' +
            escapeHtml(dimText(m.utm_campaign)) +
            '</span>';
          var cmp =
            escapeHtml(String(m.worse_conversion_rate)) +
            '% → ' +
            escapeHtml(String(m.better_conversion_rate)) +
            '%';
          return (
            '<tr>' +
            '<td style="max-width:12rem;line-height:1.35;">' +
            cur +
            '</td>' +
            '<td style="max-width:12rem;line-height:1.35;">' +
            rec +
            '</td>' +
            '<td>' +
            cmp +
            '<br/><span class="muted" style="font-size:0.75rem;">' +
            escapeHtml(String(m.recommendation || '')) +
            '</span></td>' +
            '<td><button type="button" class="btn btn-sm btn-primary gd-adlp-apply-mismatch" data-adlp-mis-idx="' +
            idx +
            '">应用推荐</button></td>' +
            '</tr>'
          );
        })
        .join('');
    }
  }

  function openLinkFromBestAdLp(idx) {
    var list = state.adLpBestCombinations || [];
    var row = list[idx];
    if (!row) return;
    openLinkModal({
      creative_version: row.creative_version,
      landing_page_version: row.landing_page_version,
      utm_campaign: row.utm_campaign,
    });
  }

  function applyAdLpMismatch(idx) {
    var list = state.adLpMismatches || [];
    var m = list[idx];
    if (!m) return;
    var row = {
      creative_version: m.creative_version,
      landing_page_version: m.better_lpv,
      utm_campaign: m.utm_campaign,
    };
    var chk = canBuildLink(row);
    if (!chk.ok) {
      showMsg(chk.hint, true);
      return;
    }
    var full = buildFullTrackingUrl(row);
    if (!full) {
      showMsg('请填写落地页网址（页面顶部「落地页网址」）。', true);
      return;
    }
    var lpvLabel = String(m.better_lpv || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(
        function () {
          showMsg('已复制推荐链接（cv / utm 不变，lpv →「' + lpvLabel + '」）。', false);
          setTimeout(function () {
            showMsg('', false);
          }, 3200);
        },
        function () {
          fallbackCopy(full);
        }
      );
      return;
    }
    fallbackCopy(full);
  }

  function renderLpSuggestionCell(row, behIdx) {
    var s = row.suggestion;
    if (!s || typeof s !== 'object') {
      return (
        '<td class="muted" style="font-size:0.78rem;">— ' +
        '<button type="button" class="btn btn-sm gd-why-btn gd-why-lp-beh" data-lp-beh-idx="' +
        behIdx +
        '">为什么</button></td>'
      );
    }
    var ex = s.example_text != null ? String(s.example_text).trim() : '';
    var exLine = ex
      ? '<span class="muted" style="font-size:0.72rem;display:block;margin-top:0.35rem;">例：' +
        escapeHtml(ex) +
        '</span>'
      : '';
    return (
      '<td style="max-width:17rem;line-height:1.4;vertical-align:top;">' +
      '<strong style="font-size:0.88rem;">' +
      escapeHtml(String(s.problem_title || '')) +
      '</strong>' +
      '<div style="font-size:0.8rem;margin-top:0.25rem;color:var(--text);">' +
      escapeHtml(String(s.problem_description || '')) +
      '</div>' +
      '<div style="font-size:0.8rem;margin-top:0.25rem;">' +
      escapeHtml(String(s.action_text || '')) +
      '</div>' +
      exLine +
      '<div style="margin-top:0.35rem;">' +
      '<button type="button" class="btn btn-sm gd-why-btn gd-why-lp-beh" data-lp-beh-idx="' +
      behIdx +
      '">为什么</button></div>' +
      '</td>'
    );
  }

  function renderLpBehaviorTable() {
    var behTb = $('gd-lp-behavior-tbody');
    if (!behTb) return;
    if (state.lpBehaviorLoadFailed) {
      behTb.innerHTML = '<tr><td colspan="7" class="muted">行为数据加载失败</td></tr>';
      return;
    }
    var br = state.lpBehaviorRows || [];
    if (!br.length) {
      behTb.innerHTML =
        '<tr><td colspan="7" class="muted">暂无行为事件（确认已部署埋点且时间范围内有流量）</td></tr>';
      return;
    }
    behTb.innerHTML = br
      .map(function (row, behIdx) {
        var hint = row.drop_off_hint != null ? String(row.drop_off_hint) : '';
        return (
          '<tr>' +
          '<td><strong>' +
          escapeHtml(String(row.landing_page_version || '—')) +
          '</strong></td>' +
          '<td>' +
          escapeHtml(String(row.page_views != null ? row.page_views : '—')) +
          '</td>' +
          '<td>' +
          fmtPct(row.scroll_rate_pct) +
          '</td>' +
          '<td>' +
          fmtPct(row.form_start_rate_pct) +
          '</td>' +
          '<td>' +
          fmtPct(row.submit_rate_pct) +
          '</td>' +
          '<td style="max-width:10rem;font-size:0.78rem;line-height:1.35;">' +
          escapeHtml(hint) +
          '</td>' +
          renderLpSuggestionCell(row, behIdx) +
          '</tr>'
        );
      })
      .join('');
  }

  function renderLpOptimizationBanner() {
    var wrap = $('gd-lp-opt-banner');
    var nEl = $('gd-lp-opt-n');
    var hint = $('gd-lp-opt-hint');
    var tb = $('gd-lp-opt-tbody');
    if (!wrap || !nEl || !hint || !tb) return;
    if (!getSecret().trim()) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    if (state.lpOptimizationLoadFailed) {
      wrap.className = 'gd-lp-opt-banner gd-lp-opt-err';
      nEl.textContent = '—';
      hint.textContent = '落地页优化列表加载失败，请稍后刷新。';
      tb.innerHTML = '<tr><td colspan="6" class="muted">加载失败</td></tr>';
      renderLpBehaviorTable();
      return;
    }
    var list = state.lpOptimizationList || [];
    nEl.textContent = String(list.length);
    if (!list.length) {
      wrap.className = 'gd-lp-opt-banner gd-lp-opt-muted';
      hint.textContent =
        '无待优化项（需线索≥10、线索→赢单<15%，且同活动或同产品线存在更高转化落地页并已注册在落地页库）。';
      tb.innerHTML = '<tr><td colspan="6" class="muted">暂无</td></tr>';
      renderLpBehaviorTable();
      return;
    }
    wrap.className = 'gd-lp-opt-banner';
    hint.textContent =
      '点击「一键生成优化版本」将结合更好版本库文案与用户行为阶段生成英文 headline / subheadline / CTA，可在弹窗中编辑后再创建草稿；不修改原版本、不自动发布。请到 Growth Ops 核对路由与 lpv。';
    tb.innerHTML = list
      .map(function (item, idx) {
        return (
          '<tr>' +
          '<td><strong>' +
          escapeHtml(String(item.landing_page_version || '—')) +
          '</strong><br/><span class="muted" style="font-size:0.72rem;">' +
          escapeHtml((item.reason || '').slice(0, 80)) +
          (item.reason && item.reason.length > 80 ? '…' : '') +
          '</span></td>' +
          '<td>' +
          escapeHtml(String(item.lead_to_won_pct != null ? item.lead_to_won_pct : '—')) +
          '%</td>' +
          '<td>' +
          escapeHtml(String(item.better_version || '—')) +
          '</td>' +
          '<td>' +
          escapeHtml(String(item.better_lead_to_won_pct != null ? item.better_lead_to_won_pct : '—')) +
          '%</td>' +
          '<td style="font-size:0.78rem;max-width:8rem;word-break:break-word;">' +
          escapeHtml(dimText(item.utm_campaign)) +
          '</td>' +
          '<td><button type="button" class="btn btn-sm gd-why-btn gd-why-lp-opt" data-lp-opt-idx="' +
          idx +
          '">为什么</button> ' +
          '<button type="button" class="btn btn-sm btn-primary gd-lp-opt-oneclick" data-lp-opt-idx="' +
          idx +
          '">一键生成优化版本</button></td>' +
          '</tr>'
        );
      })
      .join('');
    renderLpBehaviorTable();
  }

  function dropOffStageForLpOptimizationItem(item) {
    var lpv = item.landing_page_version == null ? '' : String(item.landing_page_version).trim();
    var rows = state.lpBehaviorRows || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rv = r.landing_page_version == null ? '' : String(r.landing_page_version).trim();
      if (rv === lpv) return String(r.drop_off_stage || 'ok').toLowerCase();
    }
    return 'ok';
  }

  function closeLpOptGenModal() {
    state.lpOptOneClick = null;
    var m = $('gd-modal-lp-opt-gen');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function openLpOneClickOptimize(idx) {
    var list = state.lpOptimizationList || [];
    var item = list[idx];
    if (!item || !getSecret().trim()) return;
    var srcId = item.source_landing_page_id;
    var refId = item.reference_landing_page_id;
    if (!srcId || !refId) {
      showMsg('缺少落地页库引用，无法生成。', true);
      return;
    }
    var st = dropOffStageForLpOptimizationItem(item);
    var body = withSecretBody({
      reference_landing_page_id: refId,
      source_landing_page_id: srcId,
      product_line: item.product_line,
      drop_off_stage: st,
    });
    showMsg('正在生成文案…', false);
    fetchJson('/api/ads/landing-pages/generate-optimized-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        showMsg('', false);
        state.lpOptOneClick = {
          source_landing_page_id: srcId,
        };
        var h = $('gd-lp-opt-gen-headline');
        var s = $('gd-lp-opt-gen-sub');
        var c = $('gd-lp-opt-gen-cta');
        if (h) h.value = res.headline != null ? String(res.headline) : '';
        if (s) s.value = res.subheadline != null ? String(res.subheadline) : '';
        if (c) c.value = res.cta_text != null ? String(res.cta_text) : '';
        var hint = $('gd-lp-opt-gen-hint');
        if (hint) {
          hint.textContent =
            '行为阶段：' +
            (res.drop_off_stage || st) +
            ' · 参考更好版本：' +
            (res.reference_version || '—') +
            ' · 从当前版本 fork：' +
            (res.source_version || '—') +
            '（新建草稿，不覆盖旧版）';
        }
        var m = $('gd-modal-lp-opt-gen');
        if (m) {
          m.classList.add('open');
          m.setAttribute('aria-hidden', 'false');
        }
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function confirmLpOptGenPublish() {
    var w = state.lpOptOneClick;
    if (!w || !w.source_landing_page_id) return;
    if (getOpMode() === 'full') {
      showMsg('全自动尚未启用。', true);
      return;
    }
    var h = $('gd-lp-opt-gen-headline');
    var s = $('gd-lp-opt-gen-sub');
    var c = $('gd-lp-opt-gen-cta');
    var bodyCore = {
      edits: {
        headline: h && h.value != null ? h.value.trim() : '',
        subheadline: s && s.value != null ? s.value.trim() : '',
        cta_text: c && c.value != null ? c.value.trim() : '',
      },
      initial_status: 'draft',
      deactivate_previous: false,
    };
    if (getOpMode() === 'semi') {
      var wq = buildWhyLpPublishQueue();
      enqueueAction({
        id: newQueueId(),
        kind: 'lp_publish',
        title: '发布新落地页版本',
        targetLine: '源落地页 ID ' + w.source_landing_page_id,
        reasonLine: '一键优化后的新建草稿',
        why: { title: wq.title, blocks: wq.blocks },
        payload: {
          source_landing_page_id: w.source_landing_page_id,
          body: bodyCore,
        },
      });
      closeLpOptGenModal();
      return;
    }
    var body = withSecretBody(bodyCore);
    fetchJson(
      '/api/ads/landing-pages/' + encodeURIComponent(w.source_landing_page_id) + '/publish-new-version',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
      .then(function (res) {
        var lpv = res.landing_page_version || {};
        closeLpOptGenModal();
        showMsg(
          '已创建新落地页版本：' +
            (lpv.version || '—') +
            '（草稿）。请到 Growth Ops 或站点核对路由与 lpv 后再上线。',
          false
        );
        refresh();
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function renderAutoActionsBanner() {
    var el = $('gd-auto-actions-banner');
    var nEl = $('gd-auto-actions-n');
    var hint = $('gd-auto-actions-hint');
    var btnAll = $('gd-auto-pause-all');
    var btnDetail = $('gd-auto-actions-detail-btn');
    if (!el || !nEl || !hint) return;
    if (!getSecret().trim()) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (state.autoActions.loadFailed) {
      el.className = 'gd-auto-actions-banner gd-auto-actions-err';
      nEl.textContent = '—';
      hint.textContent = '待处理列表加载失败，请稍后刷新。';
      if (btnAll) btnAll.disabled = true;
      if (btnDetail) btnDetail.disabled = false;
      return;
    }
    var t = state.autoActions.total;
    nEl.textContent = String(t);
    if (t === 0) {
      el.className = 'gd-auto-actions-banner gd-auto-actions-muted';
      hint.textContent =
        '当前窗口内无可批量暂停候选（需至少一条组合已有付费；且满足线索≥10、线索→赢单<10%、无付费；不含追踪缺失与「多赢单无付款」组合）。';
      if (btnAll) btnAll.disabled = true;
      if (btnDetail) btnDetail.disabled = false;
    } else {
      el.className = 'gd-auto-actions-banner gd-auto-actions-alert';
      var extra = state.autoActions.truncated ? ' 至多列出 5 条，其余请在下方广告表中处理。' : '';
      hint.textContent =
        '同窗口内已有付费样本作对照；下列为可安全批量暂停的活跃创意（不含追踪/销售类异常）。' + extra;
      if (btnAll) btnAll.disabled = false;
      if (btnDetail) btnDetail.disabled = false;
    }
  }

  function renderAutoActionsModalTable() {
    var tb = $('gd-auto-actions-modal-tbody');
    if (!tb) return;
    var list = state.autoActions.pause_list || [];
    var mode = getOpMode();
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="6" class="muted">当前没有待暂停项</td></tr>';
      return;
    }
    tb.innerHTML = list
      .map(function (item, idx) {
        var m = item.metrics || {};
        var id = item.creative_id != null ? String(item.creative_id) : '';
        var pauseLabel = mode === 'semi' ? '加入队列' : mode === 'full' ? '未启用' : '暂停';
        var pauseDisabled = mode === 'full' ? ' disabled' : '';
        return (
          '<tr>' +
          '<td><strong>' +
          escapeHtml(String(item.creative_version || '—')) +
          '</strong><br/><span class="muted">' +
          escapeHtml(String(item.landing_page_version || '—')) +
          '</span><br/><span class="muted" style="font-size:0.78rem;">' +
          escapeHtml(dimText(item.utm_campaign)) +
          '</span><br/><span class="reason-cell">' +
          escapeHtml(item.reason || '') +
          '</span></td>' +
          '<td>' +
          escapeHtml(String(m.leads != null ? m.leads : '—')) +
          '</td>' +
          '<td>' +
          escapeHtml(fmtPct(m.lead_to_won_pct)) +
          '</td>' +
          '<td>' +
          escapeHtml(String(m.invoices_paid != null ? m.invoices_paid : '—')) +
          '</td>' +
          '<td><button type="button" class="btn btn-sm gd-why-btn gd-why-auto-pause" data-auto-pause-idx="' +
          idx +
          '">为什么</button></td>' +
          '<td><button type="button" class="btn btn-sm btn-primary gd-auto-pause-one" data-creative-id="' +
          escapeHtml(id) +
          '"' +
          pauseDisabled +
          '>' +
          pauseLabel +
          '</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function openAutoActionsModal() {
    renderAutoActionsModalTable();
    var note = $('gd-auto-actions-modal-note');
    if (note) {
      var semiN =
        getOpMode() === 'semi'
          ? ' 半自动：表内按钮为「加入队列」，须在页面下方「待执行队列」中批准后才提交。'
          : '';
      note.textContent =
        '统计区间 ' +
        state.range.from +
        ' ~ ' +
        state.range.to +
        '。' +
        semiN +
        (getOpMode() === 'manual'
          ? ' 人工驾驶：点「暂停」将立即提交。'
          : '') +
        (getOpMode() === 'full'
          ? ' 全自动未启用：表内暂停不可用。'
          : '');
    }
    var m = $('gd-modal-auto-actions');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAutoActionsModal() {
    var m = $('gd-modal-auto-actions');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function openBatchPauseModal() {
    var list = state.autoActions.pause_list || [];
    var n = list.length;
    if (!n) return;
    var msg = $('gd-auto-pause-batch-msg');
    if (msg) {
      if (getOpMode() === 'semi') {
        msg.textContent =
          '将把 ' +
          n +
          ' 条「暂停创意」加入页面下方的待执行队列。每条仍需在队列里点「批准执行」才会真正提交到服务器。';
      } else {
        msg.textContent = '将暂停 ' + n + ' 条广告版本（创意库中对应活跃创意）。确认后继续。';
      }
    }
    var m = $('gd-modal-auto-pause-batch');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeBatchPauseModal() {
    var m = $('gd-modal-auto-pause-batch');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function pauseCreativeById(creativeId) {
    return fetchJson('/api/ads/creatives/' + encodeURIComponent(creativeId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withSecretBody({ status: 'paused' })),
    });
  }

  function confirmBatchPauseAll() {
    var list = state.autoActions.pause_list || [];
    if (!list.length) return;
    if (getOpMode() === 'full') {
      showMsg('全自动尚未启用，无法执行批量暂停。', true);
      return;
    }
    if (getOpMode() === 'semi') {
      list.forEach(function (item) {
        var id = item.creative_id;
        if (!id) return;
        var w = buildWhyAutoPauseItem(item);
        enqueueAction(
          {
            id: newQueueId(),
            kind: 'pause_creative',
            title: '暂停创意',
            targetLine:
              'cv ' +
              String(item.creative_version || '—') +
              ' · lpv ' +
              String(item.landing_page_version || '—'),
            reasonLine: (item.reason || '').slice(0, 140),
            why: { title: w.title, blocks: w.blocks },
            payload: { creativeId: String(id) },
          },
          { silent: true }
        );
      });
      closeBatchPauseModal();
      showMsg('已将 ' + list.length + ' 条加入待执行队列。', false);
      return;
    }
    var chain = Promise.resolve();
    var errors = [];
    list.forEach(function (item) {
      var id = item.creative_id;
      if (!id) return;
      chain = chain.then(function () {
        return pauseCreativeById(id).catch(function (e) {
          errors.push(
            (item.creative_version || id) + ': ' + (e.message || String(e))
          );
        });
      });
    });
    chain.then(function () {
      closeBatchPauseModal();
      if (errors.length) {
        showMsg('部分失败：' + errors.join('；'), true);
      } else {
        showMsg('已全部提交暂停。', false);
      }
      refresh();
    });
  }

  function rowFromScaleItem(item) {
    var m = item.metrics || {};
    return {
      creative_version: item.creative_version,
      landing_page_version: item.landing_page_version,
      utm_campaign: item.utm_campaign,
      leads: m.leads != null ? Number(m.leads) : 0,
      opportunities_won: m.opportunities_won != null ? Number(m.opportunities_won) : 0,
      invoices_paid: m.invoices_paid != null ? Number(m.invoices_paid) : 0,
      lead_to_won_pct: m.lead_to_won_pct != null ? Number(m.lead_to_won_pct) : null,
      total_paid_value: m.total_paid_value != null ? Number(m.total_paid_value) : 0,
      avg_paid_value: null,
    };
  }

  function renderScaleActionsBanner() {
    var el = $('gd-scale-actions-banner');
    var nEl = $('gd-scale-actions-n');
    var hint = $('gd-scale-actions-hint');
    var btnFork = $('gd-scale-fork-btn');
    var btnLink = $('gd-scale-link-btn');
    var btnDetail = $('gd-scale-detail-btn');
    if (!el || !nEl || !hint) return;
    if (!getSecret().trim()) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (state.scaleActions.loadFailed) {
      el.className = 'gd-scale-actions-banner gd-scale-actions-err';
      nEl.textContent = '—';
      hint.textContent = '放大候选列表加载失败，请稍后刷新。';
      if (btnFork) btnFork.disabled = true;
      if (btnLink) btnLink.disabled = true;
      if (btnDetail) btnDetail.disabled = false;
      return;
    }
    var t = state.scaleActions.total;
    nEl.textContent = String(t);
    if (t === 0) {
      el.className = 'gd-scale-actions-banner gd-scale-actions-muted';
      hint.textContent =
        '当前窗口内暂无符合「已付≥2、线索→赢单≥20%、活跃创意、落地页版本已填」的放大候选。';
      if (btnFork) btnFork.disabled = true;
      if (btnLink) btnLink.disabled = true;
      if (btnDetail) btnDetail.disabled = false;
    } else {
      el.className = 'gd-scale-actions-banner gd-scale-actions-good';
      var extra = state.scaleActions.truncated ? ' 至多列出 5 条。' : '';
      hint.textContent =
        '建议保持投放或复制新版本做 A/B；多条时请打开详情逐条操作「复制 / 链接」。' + extra;
      if (btnFork) btnFork.disabled = false;
      if (btnLink) btnLink.disabled = false;
      if (btnDetail) btnDetail.disabled = false;
    }
  }

  function renderScaleActionsModalTable() {
    var tb = $('gd-scale-actions-modal-tbody');
    if (!tb) return;
    var list = state.scaleActions.scale_list || [];
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="8" class="muted">当前没有放大候选</td></tr>';
      return;
    }
    var mode = getOpMode();
    tb.innerHTML = list
      .map(function (item, idx) {
        var m = item.metrics || {};
        var forkDis = mode === 'full' ? ' disabled' : '';
        var forkLab = mode === 'full' ? '未启用' : '复制新版本';
        return (
          '<tr>' +
          '<td><strong>' +
          escapeHtml(String(item.creative_version || '—')) +
          '</strong><br/><span class="muted">' +
          escapeHtml(String(item.landing_page_version || '—')) +
          '</span><br/><span class="muted" style="font-size:0.78rem;">' +
          escapeHtml(dimText(item.utm_campaign)) +
          '</span><br/><span class="reason-cell">' +
          escapeHtml(item.reason || '') +
          '</span></td>' +
          '<td>' +
          escapeHtml(String(m.leads != null ? m.leads : '—')) +
          '</td>' +
          '<td>' +
          escapeHtml(String(m.opportunities_won != null ? m.opportunities_won : '—')) +
          '</td>' +
          '<td>' +
          escapeHtml(String(m.invoices_paid != null ? m.invoices_paid : '—')) +
          '</td>' +
          '<td>' +
          escapeHtml(fmtPct(m.lead_to_won_pct)) +
          '</td>' +
          '<td>' +
          escapeHtml(fmtMoney(m.total_paid_value)) +
          '</td>' +
          '<td><button type="button" class="btn btn-sm gd-why-btn gd-why-scale" data-scale-idx="' +
          idx +
          '">为什么</button></td>' +
          '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm btn-primary gd-scale-row-fork" data-scale-idx="' +
          idx +
          '"' +
          forkDis +
          '>' +
          forkLab +
          '</button> ' +
          '<button type="button" class="btn btn-sm gd-scale-row-link" data-scale-idx="' +
          idx +
          '">生成链接</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function openScaleActionsModal() {
    renderScaleActionsModalTable();
    var note = $('gd-scale-actions-modal-note');
    if (note) {
      note.textContent =
        '统计区间 ' +
        state.range.from +
        ' ~ ' +
        state.range.to +
        '。每行可单独复制新版本或生成追踪链接。';
    }
    var m = $('gd-modal-scale-actions');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeScaleActionsModal() {
    var m = $('gd-modal-scale-actions');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function openForkFromScaleByIdx(idx) {
    var list = state.scaleActions.scale_list || [];
    var item = list[idx];
    if (!item) return;
    closeScaleActionsModal();
    var res = resolveCreativeStrict(state.creatives, item.creative_version);
    if (!res.ok) {
      showMsg(res.hint, true);
      return;
    }
    openForkModal(rowFromScaleItem(item), res);
  }

  function openLinkFromScaleByIdx(idx) {
    var list = state.scaleActions.scale_list || [];
    var item = list[idx];
    if (!item) return;
    closeScaleActionsModal();
    openLinkModal(rowFromScaleItem(item));
  }

  function onScaleForkTopClick() {
    var list = state.scaleActions.scale_list || [];
    if (!list.length) return;
    if (list.length === 1) {
      openForkFromScaleByIdx(0);
    } else {
      openScaleActionsModal();
    }
  }

  function onScaleLinkTopClick() {
    var list = state.scaleActions.scale_list || [];
    if (!list.length) return;
    if (list.length === 1) {
      openLinkFromScaleByIdx(0);
    } else {
      openScaleActionsModal();
    }
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
      label = '跟进问题';
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
        var isPauseRec = recForRow && recForRow.type === 'pause';
        var isTrackRec = recForRow && recForRow.type === 'tracking_issue';
        var isSalesRec = recForRow && recForRow.type === 'sales_issue';
        var trExtraClass = isPauseRec
          ? 'gd-row-pause'
          : isTrackRec
            ? 'gd-row-tracking'
            : isSalesRec
              ? 'gd-row-sales'
              : '';

        var pauseBtnClass = isPauseRec ? 'btn btn-sm btn-primary' : 'btn btn-sm';
        var detailBtnClass = isPauseRec ? 'btn btn-sm' : 'btn btn-sm btn-primary';
        var opFull = getOpMode() === 'full';
        var canPauseFork = canOp && !opFull;

        var pauseBtn =
          '<button type="button" class="' +
          pauseBtnClass +
          '" data-action="pause" data-idx="' +
          idx +
          '"' +
          (canPauseFork ? '' : ' disabled') +
          titleAttr +
          '>暂停版本</button>';
        var forkBtn =
          '<button type="button" class="btn btn-sm" data-action="fork" data-idx="' +
          idx +
          '"' +
          (canPauseFork ? '' : ' disabled') +
          titleAttr +
          '>复制新版本</button>';
        var detailBtn =
          '<button type="button" class="' +
          detailBtnClass +
          '" data-action="detail" data-idx="' +
          idx +
          '">查看详情</button>';
        var linkBtn =
          '<button type="button" class="btn btn-sm" data-action="link" data-idx="' +
          idx +
          '"' +
          (chk.ok ? '' : ' disabled') +
          linkTitle +
          '>生成广告链接</button>';

        var actionBtns = isPauseRec
          ? pauseBtn + detailBtn + linkBtn + forkBtn
          : detailBtn + linkBtn + pauseBtn + forkBtn;

        var whyAd =
          '<button type="button" class="btn btn-sm gd-why-btn gd-why-ad-row" data-ad-idx="' +
          idx +
          '">为什么</button> ';

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
          '"' +
          (trExtraClass ? ' class="' + trExtraClass + '"' : '') +
          '>' +
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
          whyAd +
          actionBtns +
          opHint +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    tb.onclick = function (ev) {
      var whyA = ev.target.closest && ev.target.closest('.gd-why-ad-row');
      if (whyA) {
        var aidx = parseInt(whyA.getAttribute('data-ad-idx'), 10);
        var arow = state.byVersion[aidx];
        if (arow) {
          var arec = findRecommendationForRow(arow);
          var wa = buildWhyAdRowRecommendation(arow, arec);
          openWhyModal(wa.title, wa.blocks);
        }
        return;
      }
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
    scale: '表现最好',
    fork: '建议试新版本',
    tracking_issue: '追踪异常',
    sales_issue: '跟进问题',
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
        var salesBanner =
          r.type === 'sales_issue'
            ? '<p class="gd-rec-sales-banner">此为销售/收款跟进提示，<strong>不是</strong>「广告版本应暂停」类淘汰建议。</p>'
            : '';
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
          salesBanner +
          '<p class="reason">' +
          escapeHtml(r.reason || '') +
          '</p>' +
          '<button type="button" class="btn btn-sm btn-primary" data-rec-action="' +
          pa.action +
          '" data-rec-idx="' +
          idx +
          '">' +
          escapeHtml(pa.label) +
          '</button> ' +
          '<button type="button" class="btn btn-sm gd-why-btn gd-why-rec" data-rec-idx="' +
          idx +
          '">为什么</button>' +
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
    state.pauseModalRow = row;
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
    state.pauseModalRow = null;
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
    if (getOpMode() === 'full') {
      showMsg('全自动尚未启用。', true);
      return;
    }
    if (getOpMode() === 'semi') {
      var row = state.pauseModalRow;
      var w = row ? buildWhyTablePauseRow(row) : { title: '暂停创意', blocks: [{ label: '说明', text: '将所选创意设为暂停。' }] };
      enqueueAction({
        id: newQueueId(),
        kind: 'pause_creative',
        title: '暂停创意',
        targetLine: row
          ? 'cv ' + dimText(row.creative_version) + ' · lpv ' + dimText(row.landing_page_version)
          : '创意 ID ' + id,
        reasonLine: '主表或建议流程中的暂停确认',
        why: { title: w.title, blocks: w.blocks },
        payload: { creativeId: id },
      });
      closePauseModal();
      return;
    }
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
    state.forkResultCreative = null;
    state.forkResultRow = null;
    state.forkAdCopyPlaintext = '';
    state.forkLaunchPlaintext = '';
    state.forkLaunchUrl = '';
    state.forkResultLink = '';
    var adBlocks = $('gd-fork-ad-copy-blocks');
    if (adBlocks) adBlocks.innerHTML = '';
    var lh = $('gd-fork-launch-headlines');
    var ld = $('gd-fork-launch-descs');
    if (lh) lh.innerHTML = '';
    if (ld) ld.innerHTML = '';
    var urlP = $('gd-fork-launch-url-preview');
    if (urlP) urlP.textContent = '—';
    var pl = $('gd-fork-launch-param-line');
    if (pl) pl.textContent = '';
    var cvEl = $('gd-fork-launch-cv');
    if (cvEl) cvEl.textContent = '—';
    $('gd-fork-form-wrap').style.display = '';
    $('gd-fork-result-wrap').style.display = 'none';
    $('gd-fork-headline').value = resolve.creative.headline || '';
    $('gd-fork-description').value = resolve.creative.description || '';
    $('gd-fork-cta').value = resolve.creative.cta || '';
    $('gd-fork-initial-status').value = 'draft';
    $('gd-fork-deactivate').checked = false;
    var angleOpen = $('gd-fork-ad-angle');
    if (angleOpen) angleOpen.value = '';
    var m = $('gd-modal-fork');
    if (m) {
      m.classList.add('open');
      m.setAttribute('aria-hidden', 'false');
    }
  }

  function closeForkModal() {
    state.forkCreativeId = null;
    state.forkRow = null;
    state.forkResultCreative = null;
    state.forkResultRow = null;
    state.forkAdCopyPlaintext = '';
    state.forkLaunchPlaintext = '';
    state.forkLaunchUrl = '';
    state.forkResultLink = '';
    var m = $('gd-modal-fork');
    if (m) {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    }
  }

  function submitFork() {
    var id = state.forkCreativeId;
    if (!id || !getSecret().trim()) return;
    if (getOpMode() === 'full') {
      showMsg('全自动尚未启用。', true);
      return;
    }
    var st = ($('gd-fork-initial-status') && $('gd-fork-initial-status').value) || 'draft';
    var bodyCore = {
      edits: {
        headline: $('gd-fork-headline').value.trim() || undefined,
        description: $('gd-fork-description').value.trim() || undefined,
        cta: $('gd-fork-cta').value.trim() || undefined,
      },
      initial_status: st,
      deactivate_previous: !!$('gd-fork-deactivate').checked,
    };
    if (getOpMode() === 'semi') {
      var fk = buildWhyForkQueue(state.forkRow);
      enqueueAction({
        id: newQueueId(),
        kind: 'fork_publish',
        title: '发布创意新版本',
        targetLine:
          '创意 ID ' +
          id +
          (state.forkRow ? ' · cv ' + String(state.forkRow.creative_version || '') : ''),
        reasonLine: '状态 ' + st + (bodyCore.deactivate_previous ? ' · 同时暂停旧版' : ''),
        why: { title: fk.title, blocks: fk.blocks },
        payload: { creativeId: id, body: bodyCore },
      });
      closeForkModal();
      return;
    }
    var body = withSecretBody(bodyCore);
    fetchJson('/api/ads/creatives/' + encodeURIComponent(id) + '/publish-new-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        var c = res.creative || {};
        var row = state.forkRow || {};
        var linkRow = {
          creative_version: c.version != null ? c.version : row.creative_version,
          landing_page_version: row.landing_page_version,
          utm_campaign: row.utm_campaign,
        };
        var full = buildFullTrackingUrl(linkRow);
        var forkBase = getForkLandingBase(c);
        var forkUrl = buildForkAdUrl(
          forkBase,
          c.version,
          row.landing_page_version,
          row.utm_campaign
        );
        state.forkResultLink = forkUrl || full;
        state.forkResultCreative = c;
        state.forkResultRow = {
          landing_page_version: row.landing_page_version,
          utm_campaign: row.utm_campaign,
        };
        var countSel = $('gd-fork-ad-count');
        if (countSel) countSel.value = '3';
        var angleSel = $('gd-fork-ad-angle');
        if (angleSel) angleSel.value = '';
        $('gd-fork-form-wrap').style.display = 'none';
        $('gd-fork-result-wrap').style.display = '';
        renderForkLaunchReadyCard();
        renderForkAdCopyBlocks();
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

    if (getOpMode() === 'full' && (action === 'rec_pause' || action === 'rec_fork')) {
      showMsg('全自动尚未启用，请改用人工驾驶或半自动。', true);
      return;
    }

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

    document.querySelectorAll('input[name="gd-op-mode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.checked) setOpMode(r.value);
      });
    });
    var modeNow = getOpMode();
    document.querySelectorAll('input[name="gd-op-mode"]').forEach(function (r) {
      r.checked = r.value === modeNow;
    });

    $('gd-walkthrough-btn') &&
      $('gd-walkthrough-btn').addEventListener('click', function () {
        openWalkthroughModal();
      });
    document.querySelectorAll('[data-close="why"]').forEach(function (b) {
      b.addEventListener('click', closeWhyModal);
    });
    document.querySelectorAll('[data-close="walkthrough"]').forEach(function (b) {
      b.addEventListener('click', closeWalkthroughModal);
    });
    var whyBackdrop = $('gd-modal-why');
    whyBackdrop &&
      whyBackdrop.addEventListener('click', function (e) {
        if (e.target === whyBackdrop) closeWhyModal();
      });
    var walkBackdrop = $('gd-modal-walkthrough');
    walkBackdrop &&
      walkBackdrop.addEventListener('click', function (e) {
        if (e.target === walkBackdrop) closeWalkthroughModal();
      });

    $('gd-queue-tbody') &&
      $('gd-queue-tbody').addEventListener('click', function (ev) {
        var ap = ev.target.closest && ev.target.closest('.gd-queue-approve');
        var dis = ev.target.closest && ev.target.closest('.gd-queue-dismiss');
        var wy = ev.target.closest && ev.target.closest('.gd-queue-why');
        var qid =
          (ap && ap.getAttribute('data-queue-id')) ||
          (dis && dis.getAttribute('data-queue-id')) ||
          (wy && wy.getAttribute('data-queue-id'));
        if (!qid) return;
        if (wy) {
          var qq = loadActionQueue().filter(function (x) {
            return x.id === qid;
          })[0];
          if (qq && qq.why && qq.why.blocks) openWhyModal(qq.why.title, qq.why.blocks);
          return;
        }
        if (dis) {
          removeQueueItemById(qid);
          return;
        }
        if (ap) approveQueueItemById(qid);
      });

    $('gd-lp-behavior-tbody') &&
      $('gd-lp-behavior-tbody').addEventListener('click', function (ev) {
        var bh = ev.target.closest && ev.target.closest('.gd-why-lp-beh');
        if (!bh) return;
        var bix = parseInt(bh.getAttribute('data-lp-beh-idx'), 10);
        var brow = (state.lpBehaviorRows || [])[bix];
        if (brow) {
          var wb = buildWhyLpBehaviorRow(brow);
          openWhyModal(wb.title, wb.blocks);
        }
      });

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

    $('gd-auto-actions-detail-btn') &&
      $('gd-auto-actions-detail-btn').addEventListener('click', function () {
        openAutoActionsModal();
      });
    $('gd-auto-pause-all') &&
      $('gd-auto-pause-all').addEventListener('click', function () {
        if (getOpMode() === 'manual') {
          showMsg(
            '人工驾驶下不支持一键批量暂停。请打开「查看详情」逐条暂停，或切换到「半自动」将多条加入待执行队列后再批准。',
            true
          );
          return;
        }
        if (!state.autoActions.pause_list || !state.autoActions.pause_list.length) return;
        openBatchPauseModal();
      });
    document.querySelectorAll('[data-close="auto-actions"]').forEach(function (b) {
      b.addEventListener('click', closeAutoActionsModal);
    });
    document.querySelectorAll('[data-close="auto-pause-batch"]').forEach(function (b) {
      b.addEventListener('click', closeBatchPauseModal);
    });
    $('gd-auto-pause-batch-confirm') &&
      $('gd-auto-pause-batch-confirm').addEventListener('click', function () {
        confirmBatchPauseAll();
      });
    $('gd-auto-actions-modal-tbody') &&
      $('gd-auto-actions-modal-tbody').addEventListener('click', function (ev) {
        var whyB = ev.target && ev.target.closest ? ev.target.closest('.gd-why-auto-pause') : null;
        if (whyB) {
          var aix = parseInt(whyB.getAttribute('data-auto-pause-idx'), 10);
          var aitem = (state.autoActions.pause_list || [])[aix];
          if (aitem) {
            var wa = buildWhyAutoPauseItem(aitem);
            openWhyModal(wa.title, wa.blocks);
          }
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('.gd-auto-pause-one') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-creative-id');
        if (!id || !getSecret().trim()) return;
        if (getOpMode() === 'full') {
          showMsg('全自动尚未启用。', true);
          return;
        }
        if (getOpMode() === 'semi') {
          var item = null;
          var pl = state.autoActions.pause_list || [];
          for (var z = 0; z < pl.length; z++) {
            if (String(pl[z].creative_id) === String(id)) {
              item = pl[z];
              break;
            }
          }
          if (!item) return;
          var ws = buildWhyAutoPauseItem(item);
          enqueueAction({
            id: newQueueId(),
            kind: 'pause_creative',
            title: '暂停创意',
            targetLine:
              'cv ' +
              String(item.creative_version || '—') +
              ' · lpv ' +
              String(item.landing_page_version || '—'),
            reasonLine: (item.reason || '').slice(0, 140),
            why: { title: ws.title, blocks: ws.blocks },
            payload: { creativeId: String(id) },
          });
          return;
        }
        btn.disabled = true;
        pauseCreativeById(id)
          .then(function () {
            showMsg('已暂停该创意。', false);
            closeAutoActionsModal();
            refresh();
          })
          .catch(function (e) {
            btn.disabled = false;
            showMsg(e.message || String(e), true);
          });
      });

    $('gd-scale-detail-btn') &&
      $('gd-scale-detail-btn').addEventListener('click', function () {
        openScaleActionsModal();
      });
    $('gd-scale-fork-btn') &&
      $('gd-scale-fork-btn').addEventListener('click', function () {
        onScaleForkTopClick();
      });
    $('gd-scale-link-btn') &&
      $('gd-scale-link-btn').addEventListener('click', function () {
        onScaleLinkTopClick();
      });
    document.querySelectorAll('[data-close="scale-actions"]').forEach(function (b) {
      b.addEventListener('click', closeScaleActionsModal);
    });
    $('gd-scale-actions-modal-tbody') &&
      $('gd-scale-actions-modal-tbody').addEventListener('click', function (ev) {
        var whyS = ev.target && ev.target.closest ? ev.target.closest('.gd-why-scale') : null;
        if (whyS) {
          var six = parseInt(whyS.getAttribute('data-scale-idx'), 10);
          var sit = (state.scaleActions.scale_list || [])[six];
          if (sit) {
            var wsc = buildWhyScaleItem(sit);
            openWhyModal(wsc.title, wsc.blocks);
          }
          return;
        }
        var bf = ev.target && ev.target.closest ? ev.target.closest('.gd-scale-row-fork') : null;
        if (bf) {
          if (getOpMode() === 'full') {
            showMsg('全自动尚未启用。', true);
            return;
          }
          var i1 = parseInt(bf.getAttribute('data-scale-idx'), 10);
          if (!isNaN(i1)) openForkFromScaleByIdx(i1);
          return;
        }
        var bl = ev.target && ev.target.closest ? ev.target.closest('.gd-scale-row-link') : null;
        if (bl) {
          var i2 = parseInt(bl.getAttribute('data-scale-idx'), 10);
          if (!isNaN(i2)) openLinkFromScaleByIdx(i2);
        }
      });

    $('gd-lp-opt-tbody') &&
      $('gd-lp-opt-tbody').addEventListener('click', function (ev) {
        var whyL = ev.target && ev.target.closest ? ev.target.closest('.gd-why-lp-opt') : null;
        if (whyL) {
          var lix = parseInt(whyL.getAttribute('data-lp-opt-idx'), 10);
          var lit = (state.lpOptimizationList || [])[lix];
          if (lit) {
            var wl = buildWhyLpOptItem(lit);
            openWhyModal(wl.title, wl.blocks);
          }
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('.gd-lp-opt-oneclick') : null;
        if (!btn) return;
        var ix = parseInt(btn.getAttribute('data-lp-opt-idx'), 10);
        if (!isNaN(ix)) openLpOneClickOptimize(ix);
      });

    document.querySelectorAll('[data-close="lp-opt-gen"]').forEach(function (b) {
      b.addEventListener('click', closeLpOptGenModal);
    });
    $('gd-lp-opt-gen-publish') &&
      $('gd-lp-opt-gen-publish').addEventListener('click', function () {
        confirmLpOptGenPublish();
      });
    var lpOptGenBackdrop = $('gd-modal-lp-opt-gen');
    lpOptGenBackdrop &&
      lpOptGenBackdrop.addEventListener('click', function (e) {
        if (e.target === lpOptGenBackdrop) closeLpOptGenModal();
      });

    $('gd-adlp-best-tbody') &&
      $('gd-adlp-best-tbody').addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('.gd-adlp-best-link') : null;
        if (!btn) return;
        var i = parseInt(btn.getAttribute('data-adlp-best-idx'), 10);
        if (!isNaN(i)) openLinkFromBestAdLp(i);
      });
    $('gd-adlp-mismatch-tbody') &&
      $('gd-adlp-mismatch-tbody').addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('.gd-adlp-apply-mismatch') : null;
        if (!btn) return;
        var i = parseInt(btn.getAttribute('data-adlp-mis-idx'), 10);
        if (!isNaN(i)) applyAdLpMismatch(i);
      });

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
    $('gd-fork-copy-launch-content') &&
      $('gd-fork-copy-launch-content').addEventListener('click', function () {
        copyForkLaunchContent();
      });
    $('gd-fork-copy-launch-url') &&
      $('gd-fork-copy-launch-url').addEventListener('click', function () {
        copyForkLaunchUrl();
      });
    $('gd-fork-ad-copy-all') &&
      $('gd-fork-ad-copy-all').addEventListener('click', function () {
        copyForkAdAll();
      });
    $('gd-fork-ad-count') &&
      $('gd-fork-ad-count').addEventListener('change', function () {
        renderForkLaunchReadyCard();
        renderForkAdCopyBlocks();
      });
    $('gd-fork-ad-angle') &&
      $('gd-fork-ad-angle').addEventListener('change', function () {
        renderForkLaunchReadyCard();
        renderForkAdCopyBlocks();
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
        var whyR = ev.target.closest && ev.target.closest('.gd-why-rec');
        if (whyR) {
          var ridx0 = parseInt(whyR.getAttribute('data-rec-idx'), 10);
          var rec0 = state.recommendations[ridx0];
          if (rec0) {
            var w0 = buildWhyRecommendation(rec0);
            openWhyModal(w0.title, w0.blocks);
          }
          return;
        }
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

    applyOpModeUI();

    if (getSecret().trim()) refresh();
  });
})();
