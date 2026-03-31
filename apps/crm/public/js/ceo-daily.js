/**
 * CEO Daily View — loads owner-dashboard, campaign-roi, and draft ad counts.
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtMoney(n) {
    if (n == null || n === '') return '—';
    var x = Number(n);
    if (isNaN(x)) return '—';
    return '$' + x.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtTs(v) {
    if (!v) return '';
    try {
      return new Date(v).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function fetchJson(url) {
    return fetch(url).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || j.message || r.statusText);
        return j;
      });
    });
  }

  function showMsg(text, isErr) {
    var el = $('ceo-msg');
    if (!el) return;
    if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'growth-msg ' + (isErr ? 'err' : 'ok');
  }

  function load() {
    showMsg('');
    Promise.all([
      fetchJson('/api/owner-dashboard'),
      fetchJson('/api/dashboard/campaign-roi'),
      fetchJson('/api/ad-variants/review?status=draft&limit=100'),
      fetchJson('/api/landing-variants/review?status=draft&limit=100'),
    ]).then(function (results) {
      var dash = results[0];
      var roi = results[1];
      var adDrafts = results[2];
      var lpDrafts = results[3];
      renderMetrics(dash);
      renderAttention(dash, adDrafts, lpDrafts);
      renderTasks(dash.tasks);
      renderPipeline(dash.opportunities);
      renderHotLeads(dash.top20HotLeads);
      renderRoi(roi.rows || []);
      renderSms(dash.smsReplies);
      var el = $('ceo-last-updated');
      if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString('en-AU');
    }).catch(function (e) {
      showMsg(e.message || String(e), true);
    });
  }

  function renderMetrics(dash) {
    var cf = dash.cashflow || {};
    var overdueTasks = (dash.tasks && dash.tasks.overdue ? dash.tasks.overdue.length : 0);
    $('m-jobs').textContent = cf.jobsWonThisWeek != null ? cf.jobsWonThisWeek : '—';
    $('m-received').textContent = fmtMoney(cf.paymentsReceived);
    $('m-outstanding').textContent = fmtMoney(cf.outstanding);
    $('m-pipeline').textContent = fmtMoney(dash.opportunities ? dash.opportunities.totalPotential : null);
    $('m-overdue').textContent = overdueTasks || '0';
  }

  function renderAttention(dash, adDrafts, lpDrafts) {
    var overdueTasks = (dash.tasks && dash.tasks.overdue ? dash.tasks.overdue.length : 0);
    var draftAds = (adDrafts.rows || []).length;
    var draftLp = (lpDrafts.rows || []).length;
    var outstanding = Number((dash.cashflow || {}).outstanding || 0);

    var items = [];
    var hasIssues = false;

    if (overdueTasks > 0) {
      items.push('<a href="/tasks.html" class="ceo-badge danger">⚠ ' + overdueTasks + ' overdue task' + (overdueTasks > 1 ? 's' : '') + '</a>');
      hasIssues = true;
    }
    if (outstanding > 0) {
      items.push('<span class="ceo-badge warning">💰 ' + fmtMoney(outstanding) + ' outstanding</span>');
    }
    if (draftAds > 0 || draftLp > 0) {
      items.push('<a href="/growth-console.html" class="ceo-badge info">📋 ' + draftAds + ' ad + ' + draftLp + ' LP drafts to review</a>');
    }
    if (!items.length) {
      items.push('<span class="ceo-badge ok">✓ Nothing urgent</span>');
    }

    var attnEl = $('ceo-attention');
    var itemsEl = $('ceo-attention-items');
    if (attnEl) attnEl.classList.toggle('has-issues', hasIssues);
    if (itemsEl) itemsEl.innerHTML = items.join('');
  }

  function renderTasks(tasks) {
    var el = $('ceo-tasks');
    if (!el) return;
    var overdue = (tasks && tasks.overdue) ? tasks.overdue : [];
    var today = (tasks && tasks.today) ? tasks.today : [];
    var all = overdue.map(function (t) { return Object.assign({}, t, { bucket: 'overdue' }); })
      .concat(today.map(function (t) { return Object.assign({}, t, { bucket: 'today' }); }));

    if (!all.length) {
      el.innerHTML = '<div class="muted" style="font-size:0.85rem;">No tasks for today</div>';
      return;
    }
    el.innerHTML = all.slice(0, 8).map(function (t) {
      return '<div class="owner-list-item">' +
        '<div>' +
        '<div style="font-size:0.88rem;">' + escHtml(t.title) + '</div>' +
        '<div style="font-size:0.78rem;color:var(--muted);">' + escHtml(t.contact_name || '') + '</div>' +
        '</div>' +
        '<span class="ceo-badge' + (t.bucket === 'overdue' ? ' danger' : '') + '">' + escHtml(t.bucket) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderPipeline(opps) {
    var el = $('ceo-pipeline');
    if (!el) return;
    var stages = (opps && opps.stageCounts) ? opps.stageCounts : {};
    var labels = [
      ['site_visit_booked', 'Site Visit'],
      ['inspection_done', 'Inspected'],
      ['quote_sent', 'Quote Sent'],
      ['decision_pending', 'Deciding'],
      ['won', 'Won'],
    ];
    var bar = labels.map(function (pair) {
      return '<div class="pipeline-stage">' +
        '<div class="stage-count">' + (stages[pair[0]] || 0) + '</div>' +
        '<div class="stage-label">' + escHtml(pair[1]) + '</div>' +
        '</div>';
    }).join('');
    el.innerHTML = '<div class="pipeline-bar">' + bar + '</div>' +
      '<div class="owner-potential">Pipeline Value: ' + fmtMoney((opps && opps.totalPotential) ? opps.totalPotential : 0) + '</div>';
  }

  function renderHotLeads(leads) {
    var el = $('ceo-hot-leads');
    if (!el) return;
    if (!leads || !leads.length) {
      el.innerHTML = '<div class="muted" style="font-size:0.85rem;">No hot leads scored yet</div>';
      return;
    }
    el.innerHTML = leads.slice(0, 6).map(function (l) {
      return '<div class="owner-list-item">' +
        '<div>' +
        '<div style="font-size:0.88rem;font-weight:600;">' + escHtml(l.name) + '</div>' +
        '<div style="font-size:0.78rem;color:var(--muted);">' + escHtml(l.account_name || '') + (l.phone ? ' · ' + escHtml(l.phone) : '') + '</div>' +
        '</div>' +
        '<span class="ceo-badge ok">Score ' + escHtml(String(l.total_score)) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderRoi(rows) {
    var tbody = $('ceo-roi-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No campaign data yet — ads running soon.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var cost = Number(r.cost || 0);
      var revenue = Number(r.revenue || 0);
      var roi = cost > 0 ? Math.round((revenue - cost) / cost * 100) + '%' : '—';
      return '<tr>' +
        '<td>' + escHtml(r.utm_campaign || '—') + '</td>' +
        '<td>' + escHtml(String(r.leads != null ? r.leads : '—')) + '</td>' +
        '<td>' + escHtml(fmtMoney(r.revenue)) + '</td>' +
        '<td>' + escHtml(fmtMoney(r.cost)) + '</td>' +
        '<td>' + escHtml(roi) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderSms(replies) {
    var el = $('ceo-sms');
    if (!el) return;
    if (!replies || !replies.length) {
      el.innerHTML = '<div class="muted" style="font-size:0.85rem;">No recent SMS replies</div>';
      return;
    }
    el.innerHTML = replies.slice(0, 5).map(function (r) {
      return '<div class="owner-list-item">' +
        '<div>' +
        '<div style="font-size:0.85rem;font-weight:600;">' + escHtml(r.contact) + '</div>' +
        '<div style="font-size:0.8rem;color:var(--muted);">' + escHtml((r.message || '').slice(0, 60)) + '</div>' +
        '</div>' +
        '<span style="font-size:0.75rem;color:var(--muted);white-space:nowrap;">' + escHtml(fmtTs(r.received_at)) + '</span>' +
        '</div>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var refreshBtn = $('ceo-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', load);
    load();
  });
})();
