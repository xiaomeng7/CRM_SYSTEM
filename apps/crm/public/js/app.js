/**
 * Shared CRM admin UI — nav active state + lightweight page scripts.
 */
(function () {
  // Sidebar active state
  var path = window.location.pathname.replace(/\/$/, '') || '/';
  var navLinks = document.querySelectorAll('.sidebar a[href]');
  navLinks.forEach(function (a) {
    var href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (path === href || (href !== '/' && path.indexOf(href) === 0)) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('.content');
    if (!content) return;
    var page = content.getAttribute('data-page');
    if (page === 'leads') initLeadsPage();
    if (page === 'lead-detail') initLeadDetailPage();
    if (page === 'contacts') initContactsPage();
  });

  function formatDate(value) {
    if (!value) return '—';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString();
    } catch (e) {
      return '—';
    }
  }

  function showMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#dc3545' : '';
  }

  // Contacts list (domain model) + backend search + reactivation
  function initContactsPage() {
    var tbody = document.getElementById('contacts-tbody');
    var stateEl = document.getElementById('contacts-state');
    var searchInput = document.getElementById('contacts-search');
    var searchBtn = document.getElementById('contacts-search-btn');
    if (!tbody) return;

    function loadContacts(query) {
      showMessage(stateEl, 'Loading contacts…');
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading contacts…</td></tr>';

      var url = '/api/contacts?limit=200';
      if (query && (query + '').trim()) {
        url += '&q=' + encodeURIComponent(String(query).trim());
      }
      var detailsEl = document.getElementById('contacts-error-details');
      if (detailsEl) { detailsEl.style.display = 'none'; detailsEl.textContent = ''; }

      fetch(url)
        .then(function (res) {
          return res.text().then(function (text) {
            var data;
            try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
            if (!res.ok) {
              var e = new Error(data.error || text || 'Failed to load contacts (' + res.status + ')');
              e.status = res.status;
              e.responseText = text ? String(text).slice(0, 500) : '';
              throw e;
            }
            return data;
          });
        })
        .then(function (data) {
          var contacts = Array.isArray(data) ? data : [];
          renderContacts(tbody, contacts);
          if (!contacts.length) {
            showMessage(stateEl, 'No contacts found.' + (query ? ' Try a different search.' : ''), false);
          } else {
            showMessage(stateEl, '');
          }
        })
        .catch(function (err) {
          console.error('Contacts load error:', err);
          tbody.innerHTML =
            '<tr><td colspan="6" class="muted">Error loading contacts.</td></tr>';
          var msg = (err && err.message) ? String(err.message) : '';
          if (!msg) msg = 'Error loading contacts. Check details below.';
          if (msg === 'Failed to fetch') msg = 'Cannot reach server. Is the CRM running? Open http://localhost:3000';
          showMessage(stateEl, msg, true);
          if (detailsEl) {
            var lines = ['Status: ' + (err.status != null ? err.status : '—'), 'Message: ' + msg];
            if (err.responseText) lines.push('Response: ' + err.responseText);
            if (err.stack) lines.push('Stack: ' + err.stack);
            detailsEl.textContent = lines.join('\n\n');
            detailsEl.style.display = 'block';
          }
        });
    }

    function doSearch() {
      var q = searchInput ? (searchInput.value || '').trim() : '';
      loadContacts(q);
    }

    loadContacts('');

    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch();
        }
      });
    }
    if (searchBtn) {
      searchBtn.addEventListener('click', doSearch);
    }
  }

  // Leads list
  function initLeadsPage() {
    var tbody = document.getElementById('leads-tbody');
    var stateEl = document.getElementById('leads-state');
    if (!tbody) return;

    showMessage(stateEl, 'Loading leads…');

    fetch('/api/leads')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load leads (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        renderLeads(tbody, data || []);
        if (!data || !data.length) {
          showMessage(stateEl, 'No leads yet.', false);
        } else {
          showMessage(stateEl, '');
        }
      })
      .catch(function (err) {
        console.error(err);
        tbody.innerHTML =
          '<tr><td colspan="9" class="muted">Error loading leads.</td></tr>';
        showMessage(stateEl, 'Error loading leads. Please retry.', true);
      });
  }

  var LEAD_PIPELINE_STATUSES = ['new', 'contacted', 'qualified', 'booked', 'completed'];

  function renderLeads(tbody, leads) {
    if (!leads.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="muted">No leads found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    leads.forEach(function (lead) {
      var displayName = lead.name || lead.contact_name || '—';
      var displayPhone = lead.phone || lead.contact_phone || '—';
      var displaySuburb = lead.suburb || lead.account_suburb || '—';
      var currentStatus = lead.status || 'new';
      var isConverted = currentStatus === 'converted';
      var statusCell = isConverted
        ? '<span class="badge">converted</span>'
        : (function () {
            var opts = LEAD_PIPELINE_STATUSES.map(function (s) {
              return '<option value="' + escapeHtml(s) + '"' + (s === currentStatus ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
            }).join('');
            return '<select class="js-lead-status-select">' + opts + '</select>';
          })();
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(displayName) + '</td>' +
        '<td>' + escapeHtml(displayPhone) + '</td>' +
        '<td>' + escapeHtml(displaySuburb) + '</td>' +
        '<td>' + escapeHtml(lead.source || '—') + '</td>' +
        '<td>' + escapeHtml(lead.service_type || '—') + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td class="muted">' + formatDate(lead.created_at) + '</td>' +
        '<td class="muted">' + escapeHtml(lead.recent_activity || '—') + '</td>' +
        '<td class="actions">' +
        '<a href="/lead-detail.html?id=' + encodeURIComponent(lead.id) + '" class="btn btn-sm">Details</a>' +
        (isConverted ? '' : '<button type="button" class="btn btn-sm btn-primary js-lead-convert">Convert</button>') +
        '<button type="button" class="btn btn-sm js-lead-task">Task</button>' +
        '</td>';

      var selectEl = tr.querySelector('.js-lead-status-select');
      if (selectEl) {
        selectEl.addEventListener('change', function () {
          var next = selectEl.value;
          if (next === currentStatus) return;
          fetch('/api/leads/' + encodeURIComponent(lead.id) + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next })
          })
            .then(function (res) {
              if (!res.ok) throw new Error('Failed to update status');
              lead.status = next;
            })
            .catch(function (err) {
              console.error(err);
              selectEl.value = currentStatus;
              window.alert('Failed to update status.');
            });
        });
      }

      var convertBtn = tr.querySelector('.js-lead-convert');
      if (convertBtn) {
        convertBtn.addEventListener('click', function () {
          if (!window.confirm('Convert this lead to an opportunity?')) return;
          fetch('/api/leads/' + encodeURIComponent(lead.id) + '/convert', {
            method: 'POST'
          })
            .then(function (res) {
              if (!res.ok) throw new Error('Failed to convert lead');
              window.alert('Lead converted to opportunity.');
            })
            .catch(function (err) {
              console.error(err);
              window.alert('Failed to convert lead.');
            });
        });
      }

      var taskBtn = tr.querySelector('.js-lead-task');
      if (taskBtn) {
        taskBtn.addEventListener('click', function () {
          window.alert('Task creation UI coming soon.');
        });
      }

      tbody.appendChild(tr);
    });
  }

  function renderContacts(tbody, contacts) {
    if (!contacts.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="muted">No contacts found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    contacts.forEach(function (c) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(c.name || '—') + '</td>' +
        '<td>' + escapeHtml(c.phone || '—') + '</td>' +
        '<td>' + escapeHtml(c.email || '—') + '</td>' +
        '<td>' + escapeHtml(c.suburb || '—') + '</td>' +
        '<td>' + escapeHtml(c.linked_account_name || '—') + '</td>' +
        '<td class="actions">' +
        '<button type="button" class="btn btn-sm js-contact-create-lead">Create Lead</button>' +
        '<button type="button" class="btn btn-sm js-contact-details">Details</button>' +
        '<button type="button" class="btn btn-sm btn-primary js-contact-reactivate">Send Reactivation SMS</button>' +
        '</td>';

      tr.querySelector('.js-contact-create-lead').addEventListener('click', function () {
        fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'contact_reactivation',
            contact_id: c.id,
            account_id: c.linked_account_id || null
          })
        })
          .then(function (res) {
            if (!res.ok) return res.json().then(function (b) { throw new Error(b.error || 'Failed'); });
            return res.json();
          })
          .then(function () {
            window.alert('Lead created. You can find it on the Leads page.');
          })
          .catch(function (err) {
            console.error(err);
            window.alert(err.message || 'Failed to create lead.');
          });
      });

      tr.querySelector('.js-contact-details').addEventListener('click', function () {
        window.alert('Details view coming soon.');
      });

      tr.querySelector('.js-contact-reactivate').addEventListener('click', function () {
        if (!c.phone) {
          window.alert('No phone number for this contact.');
          return;
        }
        var confirmed = window.confirm(
          'Send reactivation SMS to ' + (c.name || 'this contact') + ' at ' + c.phone + '?'
        );
        if (!confirmed) return;
        fetch('/api/contacts/' + encodeURIComponent(c.id) + '/reactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to send SMS');
            return res.json();
          })
          .then(function () {
            window.alert('Reactivation SMS sent.');
          })
          .catch(function (err) {
            console.error(err);
            window.alert('Failed to send reactivation SMS.');
          });
      });

      tbody.appendChild(tr);
    });
  }

  // Lead detail
  function initLeadDetailPage() {
    var stateEl = document.getElementById('lead-detail-state');
    var nameEl = document.getElementById('lead-name');
    var phoneEl = document.getElementById('lead-phone');
    var suburbEl = document.getElementById('lead-suburb');
    var metaEl = document.getElementById('lead-meta');

    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (!id) {
      showMessage(stateEl, 'Missing lead id in URL.', true);
      return;
    }

    showMessage(stateEl, 'Loading lead…');

    fetch('/api/leads/' + encodeURIComponent(id))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load lead (' + res.status + ')');
        return res.json();
      })
      .then(function (lead) {
        showMessage(stateEl, '');
        if (!lead) {
          showMessage(stateEl, 'Lead not found.', true);
          return;
        }
        nameEl.textContent = lead.name || '—';
        phoneEl.textContent = lead.phone || '—';
        suburbEl.textContent = lead.suburb || '—';
        var parts = [];
        if (lead.source) parts.push('Source: ' + lead.source);
        if (lead.service_type) parts.push('Service: ' + lead.service_type);
        if (lead.status) parts.push('Status: ' + lead.status);
        metaEl.textContent = parts.join(' | ') || '—';
      })
      .catch(function (err) {
        console.error(err);
        showMessage(stateEl, 'Error loading lead. Please retry.', true);
      });
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
