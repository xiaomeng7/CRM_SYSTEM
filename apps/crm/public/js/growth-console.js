/**
 * Growth Ops Console — tabs for ROI, plans, ad/LP review, execution queue.
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function showMsg(text, isErr) {
    var el = $('growth-msg');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'growth-msg';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'growth-msg ' + (isErr ? 'err' : 'ok');
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || j.message || r.statusText || String(r.status));
        return j;
      });
    });
  }

  function fmtMoney(n) {
    if (n == null || n === '') return '—';
    var x = Number(n);
    if (isNaN(x)) return '—';
    return '$' + x.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtConv(v) {
    if (v == null || v === '') return '—';
    var x = Number(v);
    if (isNaN(x)) return '—';
    if (x <= 1 && x >= 0) return (x * 100).toFixed(2) + '%';
    return String(x);
  }

  function fmtTs(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString();
    } catch (e) {
      return '—';
    }
  }

  function campaignLabel(row) {
    var p = row.payload;
    if (p && typeof p === 'object' && p.campaign) {
      var c = p.campaign;
      if (c.name) return String(c.name);
      if (c.code) return String(c.code);
      if (c.id) return String(c.id);
    }
    if (row.campaign_key) return String(row.campaign_key);
    if (row.campaign_id) return String(row.campaign_id);
    return '—';
  }

  function loadRoi() {
    var tbody = $('growth-roi-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="muted">Loading…</td></tr>';
    return fetchJson('/api/dashboard/campaign-roi')
      .then(function (data) {
        var rows = data.rows || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="8" class="muted">No rows</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (row) {
            var uc = row.utm_campaign != null ? String(row.utm_campaign) : '—';
            return (
              '<tr>' +
              '<td>' +
              escapeHtml(uc) +
              '</td>' +
              '<td>' +
              escapeHtml(String(row.leads ?? '—')) +
              '</td>' +
              '<td>' +
              escapeHtml(String(row.wins ?? '—')) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtMoney(row.revenue)) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtMoney(row.cost)) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtMoney(row.profit)) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtConv(row.conversion_rate)) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtMoney(row.revenue_per_lead)) +
              '</td>' +
              '</tr>'
            );
          })
          .join('');
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted">' + escapeHtml(e.message) + '</td></tr>';
        throw e;
      });
  }

  function planReview(tr, status) {
    if (!tr) return;
    var key = tr.getAttribute('data-campaign-key');
    var action = tr.getAttribute('data-action');
    var notes = window.prompt('Optional notes for review', '') || '';
    return fetchJson('/api/dashboard/campaign-action-plans/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_key: key,
        action: action,
        status: status,
        notes: notes || undefined,
      }),
    })
      .then(function () {
        showMsg('Plan review saved.', false);
        return loadPlans();
      })
      .catch(function (e) {
        showMsg(e.message || String(e), true);
      });
  }

  function loadPlans() {
    var tbody = $('growth-plans-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
    return fetchJson('/api/dashboard/campaign-action-plans')
      .then(function (data) {
        var plans = data.plans || [];
        if (!plans.length) {
          tbody.innerHTML =
            '<tr><td colspan="6" class="muted">No plans (eligible campaigns / min leads may apply)</td></tr>';
          return;
        }
        tbody.innerHTML = plans
          .map(function (p) {
            var key = escAttr(p.campaign_key || '');
            var act = escAttr(p.action || '');
            var conf =
              p.confidence != null ? escapeHtml(String(Math.round(Number(p.confidence) * 1000) / 1000)) : '—';
            var reason = escapeHtml((p.reason || '').slice(0, 240));
            var met = escapeHtml(JSON.stringify(p.metrics || {}));
            return (
              '<tr data-campaign-key="' +
              key +
              '" data-action="' +
              act +
              '">' +
              '<td>' +
              escapeHtml(p.campaign || '') +
              '</td>' +
              '<td>' +
              escapeHtml(p.action || '') +
              '</td>' +
              '<td>' +
              conf +
              '</td>' +
              '<td style="max-width:14rem;">' +
              reason +
              '</td>' +
              '<td><pre class="growth-json">' +
              met +
              '</pre></td>' +
              '<td class="actions">' +
              '<button type="button" class="btn btn-sm btn-primary growth-plan-approve">Approve</button> ' +
              '<button type="button" class="btn btn-sm growth-plan-reject">Reject</button>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        tbody.querySelectorAll('.growth-plan-approve').forEach(function (btn) {
          btn.addEventListener('click', function () {
            planReview(btn.closest('tr'), 'approved');
          });
        });
        tbody.querySelectorAll('.growth-plan-reject').forEach(function (btn) {
          btn.addEventListener('click', function () {
            planReview(btn.closest('tr'), 'rejected');
          });
        });
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">' + escapeHtml(e.message) + '</td></tr>';
        throw e;
      });
  }

  function variantReview(url, id, status) {
    var notes = window.prompt('Optional notes', '') || '';
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, status: status, notes: notes || undefined }),
    });
  }

  function loadAds() {
    var tbody = $('growth-ads-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
    return fetchJson('/api/ad-variants/review?status=draft&limit=100')
      .then(function (data) {
        var rows = data.rows || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="muted">No draft ad variants</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (r) {
            var id = escAttr(r.id);
            return (
              '<tr>' +
              '<td><input type="checkbox" class="growth-ad-cb" value="' +
              id +
              '" /></td>' +
              '<td style="max-width:10rem;">' +
              escapeHtml((r.headline || '').slice(0, 120)) +
              '</td>' +
              '<td style="max-width:14rem;">' +
              escapeHtml((r.body_text || '').slice(0, 160)) +
              '</td>' +
              '<td>' +
              escapeHtml(r.status || '') +
              '</td>' +
              '<td>' +
              escapeHtml(r.channel || '') +
              '</td>' +
              '<td class="actions">' +
              '<button type="button" class="btn btn-sm btn-primary growth-ad-appr" data-id="' +
              id +
              '">Approve</button> ' +
              '<button type="button" class="btn btn-sm growth-ad-rej" data-id="' +
              id +
              '">Reject</button>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        tbody.querySelectorAll('.growth-ad-appr').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            variantReview('/api/ad-variants/review', id, 'approved')
              .then(function () {
                showMsg('Ad variant updated.', false);
                return loadAds();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
        tbody.querySelectorAll('.growth-ad-rej').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            variantReview('/api/ad-variants/review', id, 'rejected')
              .then(function () {
                showMsg('Ad variant updated.', false);
                return loadAds();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">' + escapeHtml(e.message) + '</td></tr>';
        throw e;
      });
  }

  function loadLp() {
    var tbody = $('growth-lp-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
    return fetchJson('/api/landing-variants/review?status=draft&limit=100')
      .then(function (data) {
        var rows = data.rows || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="muted">No draft landing variants</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (r) {
            var id = escAttr(r.id);
            return (
              '<tr>' +
              '<td><input type="checkbox" class="growth-lp-cb" value="' +
              id +
              '" /></td>' +
              '<td>' +
              escapeHtml(r.page_key || '') +
              '</td>' +
              '<td style="max-width:8rem;">' +
              escapeHtml((r.headline || '').slice(0, 80)) +
              '</td>' +
              '<td style="max-width:8rem;">' +
              escapeHtml((r.subheadline || '').slice(0, 80)) +
              '</td>' +
              '<td style="max-width:8rem;">' +
              escapeHtml((r.cta_text || '').slice(0, 60)) +
              '</td>' +
              '<td>' +
              escapeHtml(r.status || '') +
              '</td>' +
              '<td class="actions">' +
              '<button type="button" class="btn btn-sm btn-primary growth-lp-appr" data-id="' +
              id +
              '">Approve</button> ' +
              '<button type="button" class="btn btn-sm growth-lp-rej" data-id="' +
              id +
              '">Reject</button>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        tbody.querySelectorAll('.growth-lp-appr').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            variantReview('/api/landing-variants/review', id, 'approved')
              .then(function () {
                showMsg('Landing variant updated.', false);
                return loadLp();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
        tbody.querySelectorAll('.growth-lp-rej').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            variantReview('/api/landing-variants/review', id, 'rejected')
              .then(function () {
                showMsg('Landing variant updated.', false);
                return loadLp();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted">' + escapeHtml(e.message) + '</td></tr>';
        throw e;
      });
  }

  function bulkApproveAds() {
    var cbs = document.querySelectorAll('.growth-ad-cb:checked');
    var ids = Array.prototype.map.call(cbs, function (c) {
      return c.value;
    });
    if (!ids.length) {
      showMsg('Select at least one ad variant.', true);
      return;
    }
    return fetchJson('/api/ad-variants/bulk-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids, status: 'approved' }),
    })
      .then(function (d) {
        showMsg('Bulk approved: ' + (d.count != null ? d.count : ids.length) + ' row(s).', false);
        return loadAds();
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function bulkApproveLp() {
    var cbs = document.querySelectorAll('.growth-lp-cb:checked');
    var ids = Array.prototype.map.call(cbs, function (c) {
      return c.value;
    });
    if (!ids.length) {
      showMsg('Select at least one landing variant.', true);
      return;
    }
    return fetchJson('/api/landing-variants/bulk-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids, status: 'approved' }),
    })
      .then(function (d) {
        showMsg('Bulk approved: ' + (d.count != null ? d.count : ids.length) + ' row(s).', false);
        return loadLp();
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function loadQueue() {
    var tbody = $('growth-queue-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
    return fetchJson('/api/ad-execution/queue?limit=100')
      .then(function (data) {
        var rows = data.queue || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="muted">No pending/ready items</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (r) {
            var id = escAttr(r.id);
            var st = r.status || '';
            var readyBtn =
              st === 'pending'
                ? '<button type="button" class="btn btn-sm btn-primary growth-q-ready" data-id="' +
                  id +
                  '">Mark Ready</button> '
                : '';
            var pendBtn =
              st === 'ready'
                ? '<button type="button" class="btn btn-sm growth-q-pend" data-id="' +
                  id +
                  '">Mark Pending</button>'
                : '';
            return (
              '<tr>' +
              '<td>' +
              escapeHtml(campaignLabel(r)) +
              '</td>' +
              '<td>' +
              escapeHtml(r.channel || '') +
              '</td>' +
              '<td>' +
              escapeHtml(st) +
              '</td>' +
              '<td>' +
              escapeHtml(fmtTs(r.created_at)) +
              '</td>' +
              '<td style="max-width:12rem;">' +
              escapeHtml((r.execution_notes || '').slice(0, 200)) +
              '</td>' +
              '<td class="actions">' +
              readyBtn +
              pendBtn +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        tbody.querySelectorAll('.growth-q-ready').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            var notes = window.prompt('Optional notes', '') || '';
            fetchJson('/api/ad-execution/mark-ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: id, notes: notes || undefined }),
            })
              .then(function () {
                showMsg('Marked ready.', false);
                return loadQueue();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
        tbody.querySelectorAll('.growth-q-pend').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            var notes = window.prompt('Optional notes', '') || '';
            fetchJson('/api/ad-execution/mark-pending', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: id, notes: notes || undefined }),
            })
              .then(function () {
                showMsg('Marked pending.', false);
                return loadQueue();
              })
              .catch(function (e) {
                showMsg(e.message, true);
              });
          });
        });
      })
      .catch(function (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">' + escapeHtml(e.message) + '</td></tr>';
        throw e;
      });
  }

  // ---- Generate Ads Modal ----
  var modal = document.getElementById('growth-generate-modal');

  function openGenerateModal() {
    if (modal) modal.style.display = 'flex';
  }

  function closeGenerateModal() {
    if (modal) modal.style.display = 'none';
  }

  function handleGenerate() {
    var channel = document.getElementById('gen-channel').value;
    var product = document.getElementById('gen-product').value;
    var audience = document.getElementById('gen-audience').value;
    var submitBtn = document.getElementById('gen-submit');

    function resetBtn() {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Generate'; }
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Generating…'; }

    fetchJson('/api/ad-generation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channel,
        product_focus: product,
        audience_segment: audience,
        campaign_key: product + '_' + channel,
      }),
    }).then(function (d) {
      resetBtn();
      closeGenerateModal();
      var adCount = (d.ad_variants || []).length;
      var lpCount = (d.landing_page_variants || []).length;
      showMsg('Generated ' + adCount + ' ad variant(s) and ' + lpCount + ' landing page variant(s). See "Ad & LP Review" tab.', false);
      return loadAds();
    }).catch(function (e) {
      resetBtn();
      showMsg(e.message || String(e), true);
    });
  }

  function handleEnqueue() {
    var btn = $('growth-enqueue-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enqueueing…'; }

    function resetBtn() {
      if (btn) { btn.disabled = false; btn.textContent = 'Enqueue Approved →'; }
    }

    fetchJson('/api/ad-execution/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(function (d) {
      resetBtn();
      showMsg('Enqueued: ' + (d.enqueued || 0) + ' variant(s). Skipped: ' + (d.skipped || 0) + '.', false);
      return loadQueue();
    }).catch(function (e) {
      resetBtn();
      showMsg(e.message || String(e), true);
    });
  }

  function switchTab(name) {
    document.querySelectorAll('.growth-tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.growth-panel').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-panel') === name);
    });
  }

  function refreshAll() {
    showMsg('');
    return Promise.all([loadRoi(), loadPlans(), loadAds(), loadLp(), loadQueue()]).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.growth-tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    var refreshAllBtn = $('growth-refresh-all');
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener('click', function () {
        refreshAll().catch(function () {});
      });
    }

    document.querySelectorAll('[data-refresh]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-refresh');
        showMsg('');
        var p = Promise.resolve();
        if (k === 'roi') p = loadRoi();
        else if (k === 'plans') p = loadPlans();
        else if (k === 'ads') p = loadAds();
        else if (k === 'lp') p = loadLp();
        else if (k === 'queue') p = loadQueue();
        p.catch(function (e) {
          showMsg(e.message, true);
        });
      });
    });

    var selAds = $('growth-ads-select-all');
    if (selAds) {
      selAds.addEventListener('change', function () {
        document.querySelectorAll('.growth-ad-cb').forEach(function (c) {
          c.checked = selAds.checked;
        });
      });
    }
    var selLp = $('growth-lp-select-all');
    if (selLp) {
      selLp.addEventListener('change', function () {
        document.querySelectorAll('.growth-lp-cb').forEach(function (c) {
          c.checked = selLp.checked;
        });
      });
    }

    var bulkAds = $('growth-bulk-ads');
    if (bulkAds) bulkAds.addEventListener('click', bulkApproveAds);
    var bulkLp = $('growth-bulk-lp');
    if (bulkLp) bulkLp.addEventListener('click', bulkApproveLp);

    var generateBtn = $('growth-generate-btn');
    if (generateBtn) generateBtn.addEventListener('click', openGenerateModal);

    var cancelBtn = document.getElementById('gen-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeGenerateModal);

    var genSubmitBtn = document.getElementById('gen-submit');
    if (genSubmitBtn) genSubmitBtn.addEventListener('click', handleGenerate);

    var enqueueBtn = $('growth-enqueue-btn');
    if (enqueueBtn) enqueueBtn.addEventListener('click', handleEnqueue);

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeGenerateModal();
      });
    }

    refreshAll().catch(function () {});
  });
})();
