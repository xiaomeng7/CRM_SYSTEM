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

  // Contacts (customers) list + reactivation
  function initContactsPage() {
    var tbody = document.getElementById('contacts-tbody');
    var stateEl = document.getElementById('contacts-state');
    var searchInput = document.getElementById('contacts-search');
    var dormantCheckbox = document.getElementById('contacts-filter-dormant');
    if (!tbody) return;

    var allContacts = [];

    showMessage(stateEl, 'Loading contacts…');

    fetch('/api/customers?limit=200')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load contacts (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        allContacts = Array.isArray(data) ? data : [];
        applyContactsFilters();
        if (!allContacts.length) {
          showMessage(stateEl, 'No contacts yet.', false);
        } else {
          showMessage(stateEl, '');
        }
      })
      .catch(function (err) {
        console.error(err);
        tbody.innerHTML =
          '<tr><td colspan="7" class="muted">Error loading contacts.</td></tr>';
        showMessage(stateEl, 'Error loading contacts. Please retry.', true);
      });

    function applyContactsFilters() {
      var term = (searchInput && searchInput.value || '').toLowerCase();
      var onlyDormant = dormantCheckbox && dormantCheckbox.checked;
      var now = new Date();
      var sixMonthsAgo = new Date(now.getTime());
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      var filtered = allContacts.filter(function (c) {
        var matchesSearch =
          !term ||
          (c.name && c.name.toLowerCase().indexOf(term) !== -1) ||
          (c.phone && c.phone.toLowerCase().indexOf(term) !== -1) ||
          (c.email && c.email.toLowerCase().indexOf(term) !== -1) ||
          (c.suburb && c.suburb.toLowerCase().indexOf(term) !== -1);

        if (!matchesSearch) return false;

        if (!onlyDormant) return true;

        if (!c.last_job_date) return false;
        var d = new Date(c.last_job_date);
        if (isNaN(d.getTime())) return false;
        return d < sixMonthsAgo;
      });

      renderContacts(tbody, filtered);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        applyContactsFilters();
      });
    }
    if (dormantCheckbox) {
      dormantCheckbox.addEventListener('change', function () {
        applyContactsFilters();
      });
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

  function renderLeads(tbody, leads) {
    if (!leads.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="muted">No leads found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    leads.forEach(function (lead) {
      // Map backend fields (contact_name/contact_phone/account_suburb) to UI-friendly names.
      var displayName = lead.name || lead.contact_name || '—';
      var displayPhone = lead.phone || lead.contact_phone || '—';
      var displaySuburb = lead.suburb || lead.account_suburb || '—';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(displayName) + '</td>' +
        '<td>' + escapeHtml(displayPhone) + '</td>' +
        '<td>' + escapeHtml(displaySuburb) + '</td>' +
        '<td>' + escapeHtml(lead.source || '—') + '</td>' +
        '<td>' + escapeHtml(lead.service_type || '—') + '</td>' +
        '<td><span class="badge">' + escapeHtml(lead.status || 'new') + '</span></td>' +
        '<td class="muted">' + formatDate(lead.created_at) + '</td>' +
        '<td class="muted">' + escapeHtml(lead.recent_activity || '—') + '</td>' +
        '<td class="actions">' +
        '<button type="button" class="btn btn-sm js-lead-status">Status</button>' +
        '<a href="/lead-detail.html?id=' + encodeURIComponent(lead.id) + '" class="btn btn-sm">Details</a>' +
        '<button type="button" class="btn btn-sm btn-primary js-lead-convert">Convert</button>' +
        '<button type="button" class="btn btn-sm js-lead-task">Task</button>' +
        '</td>';

      // Attach events
      tr.querySelector('.js-lead-status').addEventListener('click', function () {
        var current = lead.status || '';
        var next = window.prompt('Update status', current);
        if (!next || next === current) return;
        fetch('/api/leads/' + encodeURIComponent(lead.id) + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next })
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to update status');
            tr.querySelector('.badge').textContent = next;
            lead.status = next;
          })
          .catch(function (err) {
            console.error(err);
            window.alert('Failed to update status.');
          });
      });

      tr.querySelector('.js-lead-convert').addEventListener('click', function () {
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

      tr.querySelector('.js-lead-task').addEventListener('click', function () {
        window.alert('Task creation UI coming soon.');
      });

      tbody.appendChild(tr);
    });
  }

  function renderContacts(tbody, contacts) {
    if (!contacts.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="muted">No contacts found.</td></tr>';
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
        '<td>' + (typeof c.total_jobs === 'number' ? String(c.total_jobs) : '—') + '</td>' +
        '<td class="muted">' + formatDate(c.last_job_date) + '</td>' +
        '<td class="actions">' +
        '<button type="button" class="btn btn-sm js-contact-details">Details</button>' +
        '<button type="button" class="btn btn-sm btn-primary js-contact-reactivate">Send Reactivation SMS</button>' +
        '</td>';

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
        fetch('/api/customers/' + encodeURIComponent(c.id) + '/reactivate', {
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
