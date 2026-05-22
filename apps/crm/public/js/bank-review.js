/**
 * Bank transaction review — founder operational memory (PR6B).
 * Secret in memory only; no localStorage for bank data; no console logging of rows.
 */
(function () {
  var apiSecret = '';
  var categories = [];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function fmtMoney(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    var sign = x < 0 ? '-' : '';
    return sign + '$' + Math.abs(x).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function secretHeaders() {
    apiSecret = ($('br-secret') && $('br-secret').value) || apiSecret || '';
    var h = { 'Content-Type': 'application/json' };
    if (apiSecret) {
      h['X-Admin-Secret'] = apiSecret;
    }
    return h;
  }

  function showMsg(text, isErr) {
    var el = $('br-msg');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'br-msg ' + (isErr ? 'err' : 'ok');
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: Object.assign(secretHeaders(), opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.ok === false) {
          throw new Error(j.error || r.statusText || 'Request failed');
        }
        return j;
      });
    });
  }

  function fillCategorySelects() {
    var filter = $('br-category-filter');
    var bulk = $('br-bulk-category');
    if (!filter || !bulk) return;

    var opts = '<option value="">All</option>';
    var optsBulk = '';
    categories.forEach(function (c) {
      opts += '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>';
      optsBulk += '<option value="' + esc(c.code) + '">' + esc(c.code) + '</option>';
    });
    filter.innerHTML = opts;
    bulk.innerHTML = optsBulk;
  }

  function loadCategories() {
    return apiFetch('/api/bank/categories').then(function (j) {
      categories = j.categories || [];
      fillCategorySelects();
    });
  }

  function buildReviewQuery() {
    var q = [];
    var limit = $('br-limit') && $('br-limit').value;
    var df = $('br-date-from') && $('br-date-from').value;
    var dt = $('br-date-to') && $('br-date-to').value;
    var cat = $('br-category-filter') && $('br-category-filter').value;
    var cp = $('br-counterparty') && $('br-counterparty').value.trim();
    if (limit) q.push('limit=' + encodeURIComponent(limit));
    if (df) q.push('date_from=' + encodeURIComponent(df));
    if (dt) q.push('date_to=' + encodeURIComponent(dt));
    if (cat) q.push('suggested_category=' + encodeURIComponent(cat));
    if (cp) q.push('counterparty=' + encodeURIComponent(cp));
    return q.length ? '?' + q.join('&') : '';
  }

  function renderRows(rows) {
    var tbody = $('br-tbody');
    var countEl = $('br-count');
    if (!tbody) return;

    if (countEl) {
      countEl.textContent = rows.length ? rows.length + ' suggested transaction(s)' : 'No suggested transactions';
    }

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="br-meta">Queue empty.</td></tr>';
      $('br-bulk-bar').style.display = 'none';
      return;
    }

    var html = '';
    rows.forEach(function (t) {
      var amtClass = Number(t.amount) < 0 ? 'br-amt-out' : 'br-amt-in';
      var catOpts = '';
      categories.forEach(function (c) {
        var sel = c.code === (t.suggested_category_code || 'unknown') ? ' selected' : '';
        catOpts +=
          '<option value="' + c.code.replace(/"/g, '') + '"' + sel + '>' + esc(c.code) + '</option>';
      });
      var conf = t.suggestion_confidence != null ? Number(t.suggestion_confidence).toFixed(2) : '—';

      html +=
        '<tr data-id="' + esc(t.id) + '" data-cp="' + esc(t.counterparty_key || '') + '">' +
        '<td>' + esc(t.txn_date) + '</td>' +
        '<td class="' + amtClass + '">' + fmtMoney(t.amount) + '</td>' +
        '<td><div>' + esc(t.description_norm || t.description_raw || '—') + '</div>' +
        '<div class="br-meta">' + esc(t.counterparty_key || '') + '</div></td>' +
        '<td>' + esc(t.suggested_category_code || 'unknown') + '</td>' +
        '<td class="br-meta">' + esc(t.suggestion_source || '') + ' / ' + conf + '</td>' +
        '<td class="br-actions">' +
        '<select class="br-row-cat">' + catOpts + '</select>' +
        '<label class="br-meta"><input type="checkbox" class="br-row-remember" checked /> Remember</label>' +
        '<button type="button" class="br-btn primary br-confirm">Confirm</button>' +
        '</td></tr>';
    });
    tbody.innerHTML = html;

    tbody.querySelectorAll('.br-confirm').forEach(function (btn) {
      btn.addEventListener('click', onConfirmRow);
    });
  }

  function loadQueue() {
    showMsg('');
    if (!apiSecret && !($('br-secret') && $('br-secret').value)) {
      showMsg('Enter API secret first.', true);
      return;
    }
    apiFetch('/api/bank/transactions/review' + buildReviewQuery())
      .then(function (j) {
        renderRows(j.transactions || []);
        showMsg('Loaded.', false);
        setTimeout(function () {
          showMsg('');
        }, 1500);
      })
      .catch(function (e) {
        showMsg(e.message || 'Load failed', true);
      });
  }

  function onConfirmRow(ev) {
    var tr = ev.target.closest('tr');
    if (!tr) return;
    var id = tr.getAttribute('data-id');
    var sel = tr.querySelector('.br-row-cat');
    var rem = tr.querySelector('.br-row-remember');
    var code = sel && sel.value;
    if (!id || !code) return;

    ev.target.disabled = true;
    apiFetch('/api/bank/transactions/' + id + '/category', {
      method: 'PUT',
      body: { category_code: code, remember: rem ? rem.checked : true },
    })
      .then(function () {
        tr.remove();
        var tbody = $('br-tbody');
        if (tbody && !tbody.querySelector('tr[data-id]')) {
          tbody.innerHTML = '<tr><td colspan="6" class="br-meta">Queue empty.</td></tr>';
        }
        var countEl = $('br-count');
        var left = tbody ? tbody.querySelectorAll('tr[data-id]').length : 0;
        if (countEl) countEl.textContent = left + ' suggested transaction(s)';
        showMsg('Confirmed.', false);
      })
      .catch(function (e) {
        showMsg(e.message || 'Confirm failed', true);
        ev.target.disabled = false;
      });
  }

  function setupBulk(key) {
    var bar = $('br-bulk-bar');
    if (!bar || !key) {
      if (bar) bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    $('br-bulk-key').textContent = key;
    var bulkCat = $('br-bulk-category');
    if (bulkCat && bulkCat.options.length) {
      var row = document.querySelector('tr[data-cp="' + CSS.escape(key) + '"]');
      if (row) {
        var sel = row.querySelector('.br-row-cat');
        if (sel && sel.value) bulkCat.value = sel.value;
      }
    }
  }

  function onBulkConfirm() {
    var key = $('br-bulk-key') && $('br-bulk-key').textContent;
    var code = $('br-bulk-category') && $('br-bulk-category').value;
    var remember = $('br-bulk-remember') && $('br-bulk-remember').checked;
    if (!key || !code) return;

    $('br-bulk-btn').disabled = true;
    apiFetch('/api/bank/transactions/bulk-confirm', {
      method: 'POST',
      body: {
        counterparty_key: key,
        category_code: code,
        remember: remember,
      },
    })
      .then(function (j) {
        showMsg('Bulk confirmed: ' + (j.confirmed_count || 0), false);
        loadQueue();
      })
      .catch(function (e) {
        showMsg(e.message || 'Bulk failed', true);
      })
      .finally(function () {
        $('br-bulk-btn').disabled = false;
      });
  }

  function init() {
    $('br-load').addEventListener('click', loadQueue);
    $('br-bulk-btn').addEventListener('click', onBulkConfirm);

    $('br-tbody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-cp]');
      if (tr && tr.getAttribute('data-cp')) {
        setupBulk(tr.getAttribute('data-cp'));
      }
    });

    loadCategories().catch(function () {
      showMsg('Could not load categories.', true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
