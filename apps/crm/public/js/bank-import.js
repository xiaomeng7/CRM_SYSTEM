/**
 * Bank CSV import page (PR6D). Secret in memory only; no localStorage for bank data.
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showMsg(text, isErr) {
    var el = $('bi-msg');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'bi-msg ' + (isErr ? 'err' : 'ok');
  }

  function renderResult(data) {
    var box = $('bi-result');
    var next = $('bi-next');
    if (!box) return;
    var errs = data.errors || [];
    var errHtml =
      errs.length > 0
        ? '<dt>Row errors</dt><dd>' +
          errs
            .slice(0, 5)
            .map(function (e) {
              return 'Line ' + esc(e.line) + ': ' + esc(e.message);
            })
            .join('<br>') +
          (errs.length > 5 ? '<br>…' : '') +
          '</dd>'
        : '';

    box.style.display = 'block';
    box.className = 'bi-result';
    box.innerHTML =
      '<dl>' +
      '<dt>Imported</dt><dd>' +
      esc(String(data.imported)) +
      '</dd>' +
      '<dt>Skipped (duplicate)</dt><dd>' +
      esc(String(data.skipped)) +
      '</dd>' +
      '<dt>Needs review</dt><dd>' +
      esc(String(data.needs_review)) +
      '</dd>' +
      '<dt>Period</dt><dd>' +
      esc(data.period_start || '—') +
      ' → ' +
      esc(data.period_end || '—') +
      '</dd>' +
      '<dt>Status</dt><dd>' +
      esc(data.status || '—') +
      '</dd>' +
      errHtml +
      '</dl>';

    if (next) next.style.display = data.imported > 0 || data.needs_review > 0 ? 'block' : 'none';
  }

  function doImport() {
    var secret = ($('bi-secret') && $('bi-secret').value) || '';
    var bank = ($('bi-bank') && $('bi-bank').value) || 'anz';
    var fileInput = $('bi-file');
    var btn = $('bi-import');

    if (!secret) {
      showMsg('Enter API secret first.', true);
      return;
    }
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      showMsg('Choose a CSV file.', true);
      return;
    }

    var file = fileInput.files[0];
    var form = new FormData();
    form.append('bank_profile', bank);
    form.append('file', file);

    showMsg('Importing…', false);
    if (btn) btn.disabled = true;
    $('bi-result').style.display = 'none';
    $('bi-next').style.display = 'none';

    fetch('/api/bank/import', {
      method: 'POST',
      headers: { 'X-Admin-Secret': secret },
      body: form,
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || j.ok === false) {
            throw new Error(j.error || r.statusText || 'Import failed');
          }
          return j;
        });
      })
      .then(function (data) {
        showMsg('Import complete.', false);
        renderResult(data);
      })
      .catch(function (e) {
        showMsg(e.message || 'Import failed', true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('bi-import');
    if (btn) btn.addEventListener('click', doImport);
  });
})();
