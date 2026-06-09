/**
 * Founder Attention Console — CEO Daily + operational events attention feed.
 */
(function () {
  var SECRET_KEY = 'ceo_daily_secret';
  var FA_DISPLAY_LIMIT = 5;
  var FA_FETCH_LIMIT = 20;

  function $(id) { return document.getElementById(id); }

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

  function fetchJson(url, options) {
    options = options || {};
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {}, secretHeaders());
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(url, Object.assign({}, options, { headers: headers })).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || j.message || r.statusText);
        return j;
      });
    });
  }

  var syncInFlight = false;

  function setActionButtonsDisabled(disabled) {
    var refreshBtn = $('ceo-refresh');
    var syncBtn = $('ceo-sync-sm8');
    if (refreshBtn) refreshBtn.disabled = disabled;
    if (syncBtn) syncBtn.disabled = disabled;
  }

  function syncServiceM8() {
    if (syncInFlight) return Promise.resolve();
    syncInFlight = true;
    setActionButtonsDisabled(true);
    var syncBtn = $('ceo-sync-sm8');
    var prevLabel = syncBtn ? syncBtn.textContent : '';
    if (syncBtn) syncBtn.textContent = 'Syncing…';
    showMsg('Syncing ServiceM8 (incremental)…', false);

    return fetchJson('/api/admin/actions/sync-servicem8', {
      method: 'POST',
      body: JSON.stringify({ mode: 'incremental' }),
    })
      .then(function (json) {
        if (json.locked) {
          showMsg(json.message || 'Another sync is already running — showing cached data.', false);
        } else {
          showMsg(json.message || 'ServiceM8 sync completed.', false);
        }
        return Promise.all([loadDashboard(true), loadFounderAttention()]);
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      })
      .finally(function () {
        syncInFlight = false;
        setActionButtonsDisabled(false);
        if (syncBtn) syncBtn.textContent = prevLabel || 'Sync ServiceM8';
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

  function severityClass(severity) {
    var s = (severity || 'low').toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'medium') return 'medium';
    return 'low';
  }

  function renderFounderAttention(events, metaText) {
    var listEl = $('fa-list');
    var metaEl = $('fa-panel-meta');
    if (metaEl && metaText) metaEl.textContent = metaText;
    if (!listEl) return;

    if (!events || !events.length) {
      listEl.innerHTML =
        '<div class="fa-empty">No open attention items. Run <code>job:operational-detectors</code> after sync, or everything is clear.</div>';
      return;
    }

    listEl.innerHTML = events
      .slice(0, FA_DISPLAY_LIMIT)
      .map(function (ev) {
        var sev = severityClass(ev.severity);
        var score = ev.effective_attention_score != null ? ev.effective_attention_score : ev.attention_score;
        var payloadJson = JSON.stringify(ev.payload || {}, null, 2);
        return (
          '<article class="fa-item fa-sev-' +
          sev +
          '" data-event-id="' +
          escHtml(ev.id) +
          '">' +
          '<div class="fa-item-head" role="button" tabindex="0" aria-expanded="false">' +
          '<span class="fa-score">[' +
          escHtml(String(score != null ? score : '—')) +
          ']</span>' +
          '<span class="fa-sev-badge ' +
          sev +
          '">' +
          escHtml((ev.severity || 'low').toUpperCase()) +
          '</span>' +
          '<div class="fa-item-main">' +
          '<div class="fa-item-title">' +
          escHtml(ev.title || '—') +
          '</div>' +
          (ev.summary
            ? '<div class="fa-item-summary">' + escHtml(ev.summary) + '</div>'
            : '') +
          '<div class="fa-item-detected">Detected ' +
          escHtml(fmtDateTime(ev.detected_at)) +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="fa-item-detail">' +
          '<div class="fa-suggested-title">Suggested Actions</div>' +
          '<div class="fa-suggested-actions" data-event-id="' +
          escHtml(ev.id) +
          '"><div class="fa-empty">Expand to load actions…</div></div>' +
          '<pre class="fa-payload">' +
          escHtml(payloadJson) +
          '</pre>' +
          '<div class="fa-actions">' +
          '<button type="button" class="btn btn-sm btn-primary fa-btn-resolve" data-event-id="' +
          escHtml(ev.id) +
          '">Resolve</button>' +
          '<button type="button" class="btn btn-sm fa-btn-dismiss" data-event-id="' +
          escHtml(ev.id) +
          '">Dismiss</button>' +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function loadFounderAttention() {
    var listEl = $('fa-list');
    var metaEl = $('fa-panel-meta');
    if (listEl) {
      listEl.innerHTML = '<div class="fa-empty">Loading attention events…</div>';
    }
    return fetchJson('/api/operational-events/attention?status=open&limit=' + FA_FETCH_LIMIT)
      .then(function (data) {
        var events = data.events || [];
        var meta =
          events.length > 0
            ? 'Top ' +
              Math.min(FA_DISPLAY_LIMIT, events.length) +
              ' of ' +
              events.length +
              ' open (ranked by effective score)'
            : 'No open operational events';
        renderFounderAttention(events, meta);
        return events;
      })
      .catch(function (e) {
        if (listEl) {
          listEl.innerHTML =
            '<div class="fa-empty">' +
            escHtml(e.message || 'Could not load attention events') +
            '</div>';
        }
        if (metaEl) metaEl.textContent = 'Unavailable';
      });
  }

  function actionStatusLabel(status) {
    return (status || 'pending').toUpperCase();
  }

  function renderEventActions(container, actions) {
    if (!container) return;
    if (!actions || !actions.length) {
      container.innerHTML =
        '<div class="fa-empty">No suggested actions for this event type.</div>';
      return;
    }
    container.innerHTML =
      '<ul class="fa-action-list">' +
      actions
        .map(function (a) {
          var terminal =
            a.status === 'completed' || a.status === 'dismissed' || a.status === 'approved';
          var rowClass = 'fa-action-row' + (terminal ? ' done' : '');
          var btns = '';
          if (a.status === 'pending') {
            btns =
              '<button type="button" class="btn btn-sm btn-primary fa-btn-action-approve" data-action-id="' +
              escHtml(a.id) +
              '">Approve</button>' +
              '<button type="button" class="btn btn-sm fa-btn-action-complete" data-action-id="' +
              escHtml(a.id) +
              '">Complete</button>' +
              '<button type="button" class="btn btn-sm fa-btn-action-dismiss" data-action-id="' +
              escHtml(a.id) +
              '">Dismiss</button>';
          } else if (a.status === 'approved') {
            btns =
              '<button type="button" class="btn btn-sm fa-btn-action-complete" data-action-id="' +
              escHtml(a.id) +
              '">Complete</button>' +
              '<button type="button" class="btn btn-sm fa-btn-action-dismiss" data-action-id="' +
              escHtml(a.id) +
              '">Dismiss</button>';
          }
          return (
            '<li class="' +
            rowClass +
            '" data-action-id="' +
            escHtml(a.id) +
            '">' +
            '<div class="fa-action-title">' +
            escHtml(a.title) +
            '<span class="fa-action-status ' +
            escHtml(a.status) +
            '">' +
            escHtml(actionStatusLabel(a.status)) +
            '</span></div>' +
            (a.description ? '<div class="fa-action-desc">' + escHtml(a.description) + '</div>' : '') +
            '<div class="fa-action-meta">Priority ' +
            escHtml(String(a.priority)) +
            ' · ' +
            escHtml(a.action_type) +
            '</div>' +
            (btns ? '<div class="fa-action-btns">' + btns + '</div>' : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul>';
  }

  function loadEventActions(eventId, container, forceRefresh) {
    if (!eventId || !container) return Promise.resolve();
    container.innerHTML = '<div class="fa-empty">Loading suggested actions…</div>';
    var url =
      '/api/operational-actions/' +
      encodeURIComponent(eventId) +
      (forceRefresh ? '?refresh=1' : '');
    return fetchJson(url)
      .then(function (data) {
        renderEventActions(container, data.actions || []);
      })
      .catch(function (e) {
        container.innerHTML =
          '<div class="fa-empty">' + escHtml(e.message || 'Could not load actions') + '</div>';
      });
  }

  function updateActionStatus(actionId, status, eventId) {
    if (!actionId) return Promise.resolve();
    var secretInput = $('ceo-secret');
    if (secretInput) setSecret(secretInput.value.trim());
    return fetchJson('/api/operational-actions/' + encodeURIComponent(actionId) + '/status', {
      method: 'POST',
      body: JSON.stringify({ status: status }),
    })
      .then(function () {
        showMsg('Action marked ' + status + '.', false);
        if (eventId) {
          var article = document.querySelector('.fa-item[data-event-id="' + eventId + '"]');
          var container = article ? article.querySelector('.fa-suggested-actions') : null;
          if (container) return loadEventActions(eventId, container, false);
        }
      })
      .catch(function (e) {
        showMsg(e.message || 'Could not update action', true);
      });
  }

  function toggleAttentionItem(article) {
    if (!article) return;
    var expanded = article.classList.toggle('expanded');
    var head = article.querySelector('.fa-item-head');
    if (head) head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) {
      var eventId = article.getAttribute('data-event-id');
      var container = article.querySelector('.fa-suggested-actions');
      var loaded = article.getAttribute('data-actions-loaded') === '1';
      loadEventActions(eventId, container, !loaded).then(function () {
        article.setAttribute('data-actions-loaded', '1');
      });
    }
  }

  function resolveAttentionEvent(eventId, status) {
    if (!eventId) return Promise.resolve();
    var secretInput = $('ceo-secret');
    if (secretInput) setSecret(secretInput.value.trim());
    return fetchJson('/api/operational-events/' + encodeURIComponent(eventId) + '/resolve', {
      method: 'POST',
      body: JSON.stringify({ status: status }),
    })
      .then(function () {
        showMsg('Event ' + status + '.', false);
        return loadFounderAttention();
      })
      .catch(function (e) {
        showMsg(e.message || 'Could not update event', true);
      });
  }

  function bindFounderAttentionEvents() {
    var listEl = $('fa-list');
    if (!listEl || listEl._faBound) return;
    listEl._faBound = true;

    listEl.addEventListener('click', function (e) {
      var approveBtn = e.target.closest('.fa-btn-action-approve');
      var completeBtn = e.target.closest('.fa-btn-action-complete');
      var actionDismissBtn = e.target.closest('.fa-btn-action-dismiss');
      if (approveBtn || completeBtn || actionDismissBtn) {
        e.stopPropagation();
        var actionId = (approveBtn || completeBtn || actionDismissBtn).getAttribute('data-action-id');
        var article = e.target.closest('.fa-item');
        var eventId = article ? article.getAttribute('data-event-id') : null;
        var st = approveBtn ? 'approved' : completeBtn ? 'completed' : 'dismissed';
        updateActionStatus(actionId, st, eventId);
        return;
      }
      var resolveBtn = e.target.closest('.fa-btn-resolve');
      var dismissBtn = e.target.closest('.fa-btn-dismiss');
      if (resolveBtn) {
        e.stopPropagation();
        resolveAttentionEvent(resolveBtn.getAttribute('data-event-id'), 'resolved');
        return;
      }
      if (dismissBtn) {
        e.stopPropagation();
        resolveAttentionEvent(dismissBtn.getAttribute('data-event-id'), 'dismissed');
        return;
      }
      var head = e.target.closest('.fa-item-head');
      if (head) {
        toggleAttentionItem(head.closest('.fa-item'));
      }
    });

    listEl.addEventListener('keydown', function (e) {
      var head = e.target.closest('.fa-item-head');
      if (!head) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAttentionItem(head.closest('.fa-item'));
      }
    });
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
          '<th>Job #</th><th>Customer</th><th>Amount</th><th>Due</th><th>Overdue</th>' +
          '<th>Site / address</th>' +
          '</tr></thead><tbody>' +
          data.invoices
            .map(function (inv) {
              var dueCell = inv.due_date || '—';
              if (inv.due_date_is_invoice_date && inv.due_date) {
                dueCell = inv.due_date + ' (inv.)';
              }
              var ref = inv.job_number || inv.invoice_number || '—';
              return (
                '<tr>' +
                '<td><strong>' + escHtml(ref) + '</strong></td>' +
                '<td>' + escHtml(inv.customer || '—') + '</td>' +
                '<td>' + escHtml(fmtMoney(inv.amount)) + '</td>' +
                '<td>' + escHtml(dueCell) + '</td>' +
                '<td>' +
                escHtml(inv.days_overdue != null ? inv.days_overdue + 'd' : '—') +
                '</td>' +
                '<td>' + escHtml(inv.job_site || inv.job_label || '—') + '</td>' +
                '</tr>'
              );
            })
            .join('') +
          '</tbody></table>' +
          '<p class="cf-empty-hint" style="margin-top:0.75rem;">Job # matches ServiceM8 invoice reference. Run Sync ServiceM8 if blank.</p>';
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

  function loadDashboard(silent) {
    if (!silent) showMsg('');
    return Promise.all([
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
    }).then(function () {
      return loadCashflowIntelligence();
    });
  }

  function load() {
    loadFounderAttention();
    loadDashboard(false);
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
    var secretInput = $('ceo-secret');
    if (secretInput) {
      secretInput.value = getSecret();
      secretInput.addEventListener('change', function () {
        setSecret(secretInput.value.trim());
      });
      secretInput.addEventListener('blur', function () {
        setSecret(secretInput.value.trim());
      });
    }

    var refreshBtn = $('ceo-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        load();
      });
    }

    var syncBtn = $('ceo-sync-sm8');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        if (secretInput) setSecret(secretInput.value.trim());
        syncServiceM8();
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
    bindFounderAttentionEvents();
    load();
  });
})();
