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
    if (page === 'dashboard') initDashboardPage();
    if (page === 'leads') initLeadsPage();
    if (page === 'lead-detail') initLeadDetailPage();
    if (page === 'contacts') initContactsPage();
    if (page === 'opportunities') initOpportunitiesPage();
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

  function initDashboardPage() {
    fetch('/api/owner-dashboard')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        var cf = d.cashflow || {};
        var el = document.getElementById('dash-jobs-won'); if (el) el.textContent = cf.jobsWonThisWeek != null ? cf.jobsWonThisWeek : '—';
        el = document.getElementById('dash-quotes-sent'); if (el) el.textContent = cf.quotesSent != null ? cf.quotesSent : '—';
        el = document.getElementById('dash-invoices'); if (el) el.textContent = cf.invoicesIssued != null ? cf.invoicesIssued : '—';
        el = document.getElementById('dash-payments'); if (el) el.textContent = formatCurrency(cf.paymentsReceived);
        el = document.getElementById('dash-outstanding'); if (el) el.textContent = formatCurrency(cf.outstanding);

        var pc = document.getElementById('priority-customers');
        if (pc) {
          var list = d.priorityCustomers || [];
          if (!list.length) pc.innerHTML = '<div class="muted">No priority contacts</div>';
          else pc.innerHTML = list.map(function (p) {
            var call = 'tel:' + encodeURIComponent((p.phone || '').replace(/\D/g, ''));
            var sms = '/reply-inbox.html';
            var lead = '/leads.html?contact=' + encodeURIComponent(p.contact_id || '');
            return '<div class="owner-list-item"><span><strong>' + escapeHtml(p.name) + '</strong> ' + escapeHtml(p.phone) + ' <span class="badge">' + escapeHtml(String(p.priority_score || '')) + '</span></span><div class="owner-actions"><a href="' + call + '" class="btn btn-sm">Call</a><a href="' + sms + '" class="btn btn-sm">SMS</a><a href="' + lead + '" class="btn btn-sm">Create Lead</a></div></div>';
          }).join('');
        }

        var tasks = d.tasks || { overdue: [], today: [], upcoming: [] };
        var tasksEl = document.getElementById('owner-tasks');
        if (tasksEl) {
          function taskRow(t) {
            var call = t.phone ? 'tel:' + encodeURIComponent(t.phone.replace(/\D/g, '')) : '#';
            var sms = '/reply-inbox.html';
            var tasksUrl = '/tasks.html';
            return '<div class="owner-task"><span>' + escapeHtml(t.title || 'Task') + ' — ' + escapeHtml(t.contact_name || '—') + '</span><div class="owner-task-actions"><a href="' + call + '" class="btn btn-sm">Call</a><a href="' + sms + '" class="btn btn-sm">SMS</a><a href="' + tasksUrl + '" class="btn btn-sm">Complete</a></div></div>';
          }
          var html = '';
          if (tasks.overdue && tasks.overdue.length) html += '<div class="owner-tasks-group overdue"><h4>Overdue</h4>' + tasks.overdue.map(taskRow).join('') + '</div>';
          if (tasks.today && tasks.today.length) html += '<div class="owner-tasks-group"><h4>Today</h4>' + tasks.today.map(taskRow).join('') + '</div>';
          if (tasks.upcoming && tasks.upcoming.length) html += '<div class="owner-tasks-group"><h4>Upcoming</h4>' + tasks.upcoming.slice(0, 5).map(taskRow).join('') + '</div>';
          if (!html) html = '<div class="muted">No open tasks</div>';
          tasksEl.innerHTML = html;
        }

        var opp = d.opportunities || { stageCounts: {}, totalPotential: 0 };
        var oppEl = document.getElementById('owner-opps');
        if (oppEl) {
          var stages = ['site_visit_booked', 'inspection_done', 'quote_sent', 'decision_pending', 'won'];
          var labels = { site_visit_booked: 'Site Visit', inspection_done: 'Inspection', quote_sent: 'Quote Sent', decision_pending: 'Decision Pending', won: 'Won' };
          oppEl.innerHTML = stages.map(function (s) {
            var n = (opp.stageCounts || {})[s] || 0;
            return '<div class="owner-opps-row"><span>' + (labels[s] || s) + '</span><span>' + n + '</span></div>';
          }).join('');
        }
        var potEl = document.getElementById('owner-potential');
        if (potEl) potEl.textContent = 'Total potential: ' + formatCurrency(opp.totalPotential);

        var replies = d.smsReplies || [];
        var tbody = document.getElementById('owner-sms-tbody');
        if (tbody) {
          if (!replies.length) tbody.innerHTML = '<tr><td colspan="4" class="muted">No recent SMS replies</td></tr>';
          else tbody.innerHTML = replies.map(function (r) {
            var task = '/reply-inbox.html';
            var opp = '/opportunities.html';
            var taskUrl = '/reply-inbox.html';
            var oppUrl = '/opportunities.html';
            return '<tr><td>' + escapeHtml(r.contact) + '</td><td>' + escapeHtml((r.message || '').slice(0, 80)) + '</td><td>' + formatDate(r.received_at) + '</td><td><a href="' + taskUrl + '" class="btn btn-sm">Create Task</a> <a href="' + oppUrl + '" class="btn btn-sm">Create Opportunity</a></td></tr>';
          }).join('');
        }
      })
      .catch(function () {
        var els = ['priority-customers', 'owner-tasks', 'owner-opps', 'owner-sms-tbody'];
        els.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.innerHTML = '<div class="muted">Error loading data</div>';
        });
      });
  }

  function formatCurrency(val) {
    if (val == null) return '—';
    var n = parseFloat(val);
    if (isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
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
          '<tr><td colspan="11" class="muted">Error loading leads.</td></tr>';
        showMessage(stateEl, 'Error loading leads. Please retry.', true);
      });
  }

  var OPPORTUNITY_STAGES = ['new_inquiry', 'site_visit_booked', 'inspection_done', 'quote_sent', 'decision_pending', 'won', 'lost'];
  var STAGE_LEGACY_TO_NEW = { discovery: 'new_inquiry', inspection_booked: 'site_visit_booked', inspection_completed: 'inspection_done', report_sent: 'quote_sent' };
  function normStage(s) { return (s && STAGE_LEGACY_TO_NEW[s]) || (OPPORTUNITY_STAGES.indexOf(s) >= 0 ? s : 'new_inquiry'); }

  function initOpportunitiesPage() {
    var tbody = document.getElementById('opportunities-tbody');
    var stageSelect = document.getElementById('opportunities-stage-select');
    var stageOptions = document.getElementById('opportunities-stage-options');
    var stageApply = document.getElementById('opportunities-stage-apply');
    if (!tbody) return;

    function load() {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
      fetch('/api/opportunities?limit=100')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="muted">No opportunities</td></tr>';
            return;
          }
          tbody.innerHTML = rows.map(function (o) {
            var contactAccount = [o.contact_name, o.account_name].filter(Boolean).join(' / ') || '—';
            var displayStage = normStage(o.stage);
            var stageOpts = OPPORTUNITY_STAGES.map(function (s) {
              return '<option value="' + escapeHtml(s) + '"' + (s === displayStage ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
            }).join('');
            var val = o.value_estimate != null ? '$' + Number(o.value_estimate).toLocaleString() : '—';
            return '<tr data-id="' + escapeHtml(o.id) + '">' +
              '<td>' + escapeHtml(contactAccount) + '</td>' +
              '<td><select class="js-opp-stage">' + stageOpts + '</select></td>' +
              '<td>' + val + '</td>' +
              '<td class="muted">' + formatDate(o.updated_at) + '</td>' +
              '<td><a href="/account-detail.html?id=' + encodeURIComponent(o.account_id || '') + '" class="btn btn-sm">View</a></td>' +
              '</tr>';
          }).join('');
          tbody.querySelectorAll('.js-opp-stage').forEach(function (sel) {
            sel.addEventListener('change', function () {
              var row = sel.closest('tr');
              var id = row && row.getAttribute('data-id');
              var stage = sel.value;
              if (!id) return;
              fetch('/api/opportunities/' + encodeURIComponent(id) + '/stage', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: stage, created_by: 'crm-ui' })
              })
                .then(function (r) {
                  if (!r.ok) throw new Error('Failed');
                  load();
                })
                .catch(function () { window.alert('Failed to update stage.'); });
            });
          });
        })
        .catch(function () {
          tbody.innerHTML = '<tr><td colspan="5" class="muted">Error loading opportunities</td></tr>';
        });
    }
    load();
  }

  var LEAD_PIPELINE_STATUSES = ['new', 'contacted', 'qualified', 'booked', 'completed'];

  function renderLeads(tbody, leads) {
    if (!leads.length) {
      tbody.innerHTML =
        '<tr><td colspan="11" class="muted">No leads found.</td></tr>';
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
        '<td>' + (lead.latest_score != null ? escapeHtml(String(lead.latest_score)) : '—') + '</td>' +
        '<td>' + escapeHtml(lead.latest_tier || '—') + '</td>' +
        '<td>' + escapeHtml(lead.service_type || '—') + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td class="muted">' + formatDate(lead.created_at) + '</td>' +
        '<td class="muted">' + escapeHtml(lead.recent_activity || '—') + '</td>' +
        '<td class="actions">' +
        '<a href="/lead-detail.html?id=' + encodeURIComponent(lead.id) + '" class="btn btn-sm">Details</a>' +
        (isConverted ? '' : '<button type="button" class="btn btn-sm btn-primary js-lead-convert">Convert</button>') +
        '<button type="button" class="btn btn-sm js-lead-task">Task</button>' +
        '<button type="button" class="btn btn-sm btn-danger js-lead-delete" style="background:#dc2626;color:#fff;border-color:#dc2626;">Delete</button>' +
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

      var deleteBtn = tr.querySelector('.js-lead-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          var label = displayName + (displayPhone !== '—' ? ' (' + displayPhone + ')' : '');
          if (!window.confirm('Delete lead "' + label + '"?\n\nThis will also delete linked activities and tasks. This cannot be undone.')) return;
          deleteBtn.disabled = true;
          deleteBtn.textContent = '…';
          fetch('/api/leads/' + encodeURIComponent(lead.id), { method: 'DELETE' })
            .then(function (res) {
              if (!res.ok) throw new Error('Delete failed (' + res.status + ')');
              return res.json();
            })
            .then(function () {
              tr.remove();
            })
            .catch(function (err) {
              console.error(err);
              deleteBtn.disabled = false;
              deleteBtn.textContent = 'Delete';
              window.alert('Failed to delete lead: ' + err.message);
            });
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
        window.location.href = '/contact-detail.html?id=' + encodeURIComponent(c.id);
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
    var scoreEl = document.getElementById('lead-score');
    var tierEl = document.getElementById('lead-tier');
    var expectedValueEl = document.getElementById('lead-expected-value');
    var actionEl = document.getElementById('lead-recommended-action');
    var reasoningEl = document.getElementById('lead-reasoning');
    var scoredAtEl = document.getElementById('lead-scored-at');

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
        if (scoreEl) scoreEl.textContent = lead.latest_score != null ? String(lead.latest_score) : '—';
        if (tierEl) tierEl.textContent = lead.latest_tier || '—';
        if (expectedValueEl) {
          expectedValueEl.textContent = lead.latest_expected_value != null && !isNaN(Number(lead.latest_expected_value))
            ? '$' + Number(lead.latest_expected_value).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : '—';
        }
        if (actionEl) actionEl.textContent = lead.latest_recommended_action || '—';
        if (reasoningEl) reasoningEl.textContent = lead.latest_reasoning || '—';
        if (scoredAtEl) scoredAtEl.textContent = formatDate(lead.latest_scored_at);
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
