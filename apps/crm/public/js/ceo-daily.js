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

  function fmtDateTime(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return '—';
    }
  }

  function resolveExpenses(expenses, cashflow) {
    var exp = expenses || {};
    var cfg = Number(exp.expected_total) || 0;
    var eff = exp.effective_total;
    if (eff == null || (eff === 0 && cfg > 0)) {
      eff = cfg;
    }
    var source = exp.source || (cashflow && cashflow.expense_basis) || 'config';
    return { effective: eff, config: cfg, source: source };
  }

  function sourceLabel(kind) {
    var map = {
      config: 'Config',
      bank: 'Bank CSV',
      hybrid: 'Hybrid',
      servicem8: 'ServiceM8',
    };
    return map[kind] || kind || '—';
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

  function loadCashflowIntelligence() {
    var bodyEl = $('cf-body');
    var panelEl = $('cf-panel');
    var badgeEl = $('cf-status-badge');
    if (!bodyEl) return;

    fetch('/api/cashflow-intel/latest')
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || j.ok === false) {
            throw new Error(j.error || r.statusText);
          }
          return j;
        });
      })
      .then(function (data) {
        if (!data.snapshot) {
          renderCashflowEmpty(bodyEl, panelEl, badgeEl);
          return;
        }
        renderCashflowSnapshot(data.snapshot, bodyEl, panelEl, badgeEl);
      })
      .catch(function () {
        renderCashflowUnavailable(bodyEl, panelEl, badgeEl);
      });
  }

  function renderCashflowEmpty(bodyEl, panelEl, badgeEl) {
    if (panelEl) {
      panelEl.classList.remove('cf-status-critical', 'cf-status-warning');
    }
    if (badgeEl) badgeEl.hidden = true;
    bodyEl.innerHTML =
      '<div class="cf-empty">Cashflow snapshot has not been generated yet.</div>' +
      '<div class="cf-empty-hint">Run the cashflow intelligence job or wait for the next scheduled run.</div>';
  }

  function renderCashflowUnavailable(bodyEl, panelEl, badgeEl) {
    if (panelEl) {
      panelEl.classList.remove('cf-status-critical', 'cf-status-warning');
    }
    if (badgeEl) badgeEl.hidden = true;
    bodyEl.innerHTML =
      '<div class="cf-empty">Cashflow Intelligence is temporarily unavailable.</div>';
  }

  function renderCashflowSnapshot(snap, bodyEl, panelEl, badgeEl) {
    var facts = snap.facts || {};
    var income = facts.income || {};
    var expenses = facts.expenses || {};
    var cashflow = facts.cashflow || {};
    var overdue = facts.overdue || {};
    var health = snap.operational_health || { status: 'healthy', attention_score: 0 };
    var risks = snap.risks || [];
    var recs = snap.recommendations || [];
    var topInv = (facts.collections && facts.collections.top_invoices) ? facts.collections.top_invoices : [];

    var status = (health.status || 'healthy').toLowerCase();
    if (panelEl) {
      panelEl.classList.remove('cf-status-critical', 'cf-status-warning');
      if (status === 'critical') panelEl.classList.add('cf-status-critical');
      else if (status === 'warning') panelEl.classList.add('cf-status-warning');
    }
    if (badgeEl) {
      badgeEl.hidden = false;
      badgeEl.className = 'cf-status-badge ' + (status === 'critical' || status === 'warning' || status === 'healthy' ? status : 'healthy');
      badgeEl.textContent = status + ' · attention ' + (health.attention_score != null ? health.attention_score : '—');
    }

    var hasGap = !!cashflow.has_gap;
    var gapDisplay = hasGap ? fmtMoney(cashflow.gap_amount) : 'No gap';

    var obligations = facts.obligations || {};
    var liquidity = facts.liquidity || {};
    var expResolved = resolveExpenses(expenses, cashflow);
    var bankOut = liquidity.actual_week_outflow || 0;
    var hasBank = bankOut > 0 || (obligations.active_recurring_count || 0) > 0;
    var meta = snap.metadata || {};
    var freshness = meta.data_freshness || facts.meta?.data_freshness || {};
    var bankFresh = meta.bank_freshness || {};

    var freshnessHtml =
      '<div class="cf-freshness">' +
      '<span><strong>Snapshot</strong> ' + escHtml(fmtDateTime(meta.generated_at || facts.meta?.generated_at)) + '</span>' +
      '<span><strong>ServiceM8 sync</strong> ' + escHtml(fmtDateTime(freshness.last_sync_hint)) + '</span>' +
      '<span><strong>Bank import</strong> ' + escHtml(fmtDateTime(bankFresh.last_import_at || freshness.bank_last_import_at)) +
      (bankFresh.last_confirmed_txn_date || freshness.bank_last_confirmed_txn_date
        ? ' · last txn ' + escHtml(bankFresh.last_confirmed_txn_date || freshness.bank_last_confirmed_txn_date)
        : '') +
      '</span>' +
      '</div>';

    var expSub =
      expResolved.source === 'hybrid' && expResolved.config > 0
        ? 'config ' + fmtMoney(expResolved.config) + ' · bank week ' + fmtMoney(bankOut)
        : expResolved.source === 'config' && (facts.meta?.config_source || meta.config_source)
          ? String(facts.meta?.config_source || meta.config_source)
          : '';

    var cardsHtml =
      '<div class="cf-cards">' +
      cfCardWithSource('High-certainty income', fmtMoney(income.high_certainty), 'servicem8', '') +
      cfCardWithSource('Possible income', fmtMoney(income.possible), 'servicem8', '') +
      cfCardWithSource(
        'Week expenses',
        fmtMoney(expResolved.effective),
        expResolved.source,
        '',
        expSub
      ) +
      cfCardWithSource(
        'Conservative gap',
        gapDisplay,
        expResolved.source,
        hasGap ? ' cf-gap-alert' : '',
        hasGap ? 'income − expenses (' + sourceLabel(expResolved.source) + ')' : ''
      ) +
      cfCardWithSource('Overdue (collections)', fmtMoney(overdue.total_amount), 'servicem8', '') +
      '</div>';

    var bankHtml = '';
    if (hasBank) {
      var topSup = obligations.top_supplier_pressure;
      var topSupLabel = topSup
        ? escHtml((topSup.counterparty_key || 'supplier') + ' ' + fmtMoney(topSup.total))
        : '—';
      var payrollLines = (obligations.upcoming_payroll || []).slice(0, 2).map(function (p) {
        return escHtml((p.next_expected_date || '—') + ' ' + fmtMoney(Math.abs(p.typical_amount)));
      }).join('; ') || '—';

      bankHtml =
        '<div class="cf-section"><div class="cf-section-title">Bank & obligations (confirmed)</div>' +
        '<div class="cf-cards">' +
        cfCard('Actual bank outflow (week)', fmtMoney(bankOut), '') +
        cfCard('Next 7d obligations', fmtMoney(obligations.recurring_next_7d), '') +
        cfCard('Next 14d obligations', fmtMoney(obligations.recurring_next_14d), '') +
        cfCard('Supplier 30d', fmtMoney(obligations.supplier_30d_total), '') +
        '</div>' +
        '<div class="cf-list-item"><strong>Top supplier pressure</strong> · ' + topSupLabel + '</div>' +
        '<div class="cf-list-item"><strong>Upcoming payroll</strong> · ' + payrollLines + '</div>' +
        '</div>';
    }

    var risk0 = risks[0];
    var riskHtml;
    if (risk0 && risk0.message) {
      riskHtml =
        '<div class="cf-section">' +
        '<div class="cf-section-title">Attention / risk</div>' +
        '<div class="cf-risk-line">' + escHtml(risk0.message) + '</div>' +
        '<div class="cf-risk-meta">Severity: ' + escHtml(risk0.severity || '—') +
        (health.attention_score != null ? ' · Score ' + escHtml(String(health.attention_score)) : '') +
        '</div></div>';
    } else {
      riskHtml =
        '<div class="cf-section">' +
        '<div class="cf-section-title">Attention / risk</div>' +
        '<div class="cf-empty">No major cashflow risk detected.</div></div>';
    }

    var invHtml;
    if (topInv.length) {
      invHtml =
        '<div class="cf-section"><div class="cf-section-title">Priority collections</div>' +
        topInv.slice(0, 3).map(function (inv) {
          var num = inv.invoice_number || '—';
          return '<div class="cf-list-item">' +
            '<strong>' + escHtml(inv.customer || '—') + '</strong> · ' + escHtml(num) +
            ' · ' + escHtml(fmtMoney(inv.amount)) + ' · ' + escHtml(String(inv.days_overdue != null ? inv.days_overdue : '—')) + 'd overdue' +
            (inv.reason ? '<div class="cf-risk-meta">' + escHtml(inv.reason) + '</div>' : '') +
            '</div>';
        }).join('') +
        '</div>';
    } else {
      invHtml =
        '<div class="cf-section"><div class="cf-section-title">Priority collections</div>' +
        '<div class="cf-empty">No priority overdue invoices.</div></div>';
    }

    var sortedRecs = recs.slice().sort(function (a, b) {
      return (a.priority || 99) - (b.priority || 99);
    });
    var recHtml;
    if (sortedRecs.length) {
      recHtml =
        '<div class="cf-section"><div class="cf-section-title">Recommended actions</div>' +
        sortedRecs.slice(0, 5).map(function (rec) {
          return '<div class="cf-rec-item">' +
            '<span class="cf-rec-cat">' + escHtml(rec.category || 'ops') + '</span>' +
            escHtml(rec.text || '') +
            '</div>';
        }).join('') +
        '</div>';
    } else {
      recHtml = '';
    }

    var summaryHtml = '';
    if (snap.ai_summary) {
      summaryHtml =
        '<div class="cf-section"><div class="cf-section-title">Operating summary</div>' +
        '<div class="cf-summary">' + escHtml(snap.ai_summary) + '</div></div>';
    }

    var weekNote = '';
    if (snap.period_start && snap.period_end) {
      weekNote = '<div class="cf-empty-hint" style="margin-bottom:0.75rem;">Week ' +
        escHtml(snap.period_start) + ' – ' + escHtml(snap.period_end) +
        (snap.snapshot_date ? ' · Snapshot ' + escHtml(snap.snapshot_date) : '') +
        '</div>';
    }

    bodyEl.innerHTML = freshnessHtml + weekNote + cardsHtml + bankHtml + riskHtml + invHtml + recHtml + summaryHtml;
  }

  function cfCard(label, value, extraClass) {
    return cfCardWithSource(label, value, '', extraClass, '');
  }

  function cfCardWithSource(label, value, sourceKey, extraClass, hint) {
    var src = sourceKey ? '<span class="cf-source-tag">' + escHtml(sourceLabel(sourceKey)) + '</span>' : '';
    var hintHtml = hint ? '<div class="cf-risk-meta">' + escHtml(hint) + '</div>' : '';
    return (
      '<div class="cf-card' + (extraClass || '') + '">' +
      '<div class="cf-card-value">' + escHtml(value) + '</div>' +
      '<div class="cf-card-label">' + escHtml(label) + ' ' + src + hintHtml + '</div></div>'
    );
  }

  function openOutstandingModal() {
    var backdrop = $('ceo-outstanding-modal');
    var body = $('ceo-modal-body');
    var metaEl = $('ceo-modal-meta');
    if (!backdrop || !body) return;
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    body.innerHTML = '<div class="muted">Loading…</div>';
    metaEl.textContent = 'Source: ServiceM8 · status = outstanding';

    fetchJson('/api/cashflow/outstanding-details')
      .then(function (data) {
        metaEl.textContent =
          'Source: ' +
          escHtml(data.source || 'ServiceM8') +
          ' · ' +
          escHtml(data.count) +
          ' invoice(s) · Total ' +
          fmtMoney(data.total);
        if (!data.invoices || !data.invoices.length) {
          body.innerHTML = '<div class="cf-empty">No outstanding invoices.</div>';
          return;
        }
        body.innerHTML =
          '<table class="ceo-modal-table"><thead><tr>' +
          '<th>Invoice</th><th>Customer</th><th>Amount</th><th>Due</th><th>Overdue</th><th>Job / site</th>' +
          '</tr></thead><tbody>' +
          data.invoices
            .map(function (inv) {
              return (
                '<tr>' +
                '<td>' + escHtml(inv.invoice_number || '—') + '</td>' +
                '<td>' + escHtml(inv.customer || '—') + '</td>' +
                '<td>' + escHtml(fmtMoney(inv.amount)) + '</td>' +
                '<td>' + escHtml(inv.due_date || '—') + '</td>' +
                '<td>' +
                escHtml(inv.days_overdue != null ? inv.days_overdue + 'd' : '—') +
                '</td>' +
                '<td>' + escHtml(inv.job_label || inv.job_number || '—') + '</td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>';
      })
      .catch(function (e) {
        body.innerHTML =
          '<div class="cf-empty">' + escHtml(e.message || 'Could not load invoices') + '</div>';
      });
  }

  function closeOutstandingModal() {
    var backdrop = $('ceo-outstanding-modal');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
    }
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
    var outEl = $('m-outstanding');
    if (outEl) {
      outEl.textContent = fmtMoney(cf.outstanding);
      outEl.title = 'ServiceM8 invoices with status outstanding — click for list';
    }
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
      ['site_visit_booked', 'In Progress'],
      ['quote_sent', 'Quote Sent'],
      ['won', 'Won ✓'],
      ['lost', 'Lost'],
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
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        load();
        loadCashflowIntelligence();
      });
    }
    var outCard = $('card-outstanding');
    if (outCard) {
      outCard.addEventListener('click', openOutstandingModal);
      outCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openOutstandingModal();
        }
      });
    }
    var closeBtn = $('ceo-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeOutstandingModal);
    var backdrop = $('ceo-outstanding-modal');
    if (backdrop) {
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) closeOutstandingModal();
      });
    }
    load();
    loadCashflowIntelligence();
  });
})();
