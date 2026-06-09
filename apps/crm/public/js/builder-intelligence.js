/**
 * Builder Intelligence UI — discovery-first workflow (PR8F).
 */
(function () {
  var enums = null;
  var prospects = [];
  var currentProspect = null;
  var currentProfile = null;
  var debounceTimer = null;
  var discoveryCandidates = [];
  var currentDiscoveryRunId = null;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    if (s == null || s === '') return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function labelize(v) {
    if (!v) return '—';
    return String(v).replace(/_/g, ' ');
  }

  function relationshipLevelLabel(level) {
    if (!level) return 'Never contacted';
    return String(level).replace(/_/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short', hour12: false });
    } catch (_) {
      return '—';
    }
  }

  function secretHeaders() {
    var secret = ($('bi-secret') && $('bi-secret').value) || '';
    var h = { 'Content-Type': 'application/json' };
    if (secret) h['x-admin-secret'] = secret;
    return h;
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

  function bandClass(b) {
    return b || 'D';
  }

  function isPartnerStatus(status) {
    return status === 'strategic_partner' || status === 'active_partner';
  }

  function suggestedActionForProspect(p) {
    if (p.suggested_action) return p.suggested_action;
    if (p.recommended_founder_action) return p.recommended_founder_action;
    if (p.research_status === 'researched') return 'Research Contact';
    if (p.research_status === 'researching') return 'Research in progress…';
    return 'Save & Research';
  }

  function focusLineForProspect(p) {
    if (p.builder_focus) return p.builder_focus;
    if (p.project_focus && p.project_focus !== 'unknown') return labelize(p.project_focus);
    if (p.builder_type && p.builder_type !== 'unknown') return labelize(p.builder_type);
    return 'Not researched yet';
  }

  function renderRecommendedAction(prospect, profile) {
    if (!prospect) return;
    $('bi-panel-title').textContent = prospect.company_name || 'Builder';

    var action =
      (prospect.target_scores && prospect.target_scores.next_best_action) ||
      (profile && profile.recommended_founder_action) ||
      prospect.suggested_action ||
      suggestedActionForProspect(prospect);
    $('bi-action-next').textContent = action;

    var status = prospect.builder_status || 'prospect';
    var isPartner = isPartnerStatus(status);
    var scores = prospect.target_scores;
    var scoreLabel = $('bi-action-score-label');
    if (scoreLabel) {
      scoreLabel.textContent = isPartner ? 'Partner value score' : 'Priority score';
    }

    var score = null;
    var band = null;
    if (scores) {
      if (isPartner) {
        score = scores.partner_value_score != null ? scores.partner_value_score : scores.target_score;
        band = scores.partner_value_band || scores.target_band;
      } else {
        score =
          scores.founder_priority_score != null ? scores.founder_priority_score : scores.target_score;
        band = scores.founder_priority_band || scores.target_band;
      }
    }

    $('bi-action-score').textContent = score != null ? String(score) : '—';
    var bandEl = $('bi-action-band');
    bandEl.textContent = band || '—';
    bandEl.className = 'bi-band ' + bandClass(band === '—' ? 'D' : band);
  }

  function renderSignalTags(elId, items, kind) {
    var el = $(elId);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<span class="bi-empty-inline">None yet</span>';
      return;
    }
    el.innerHTML = items
      .map(function (s) {
        return '<span class="bi-signal-tag ' + kind + '">' + esc(s) + '</span>';
      })
      .join('');
  }

  function renderResearchResults(prospect, profile) {
    $('bi-ro-builder_type').textContent = labelize(prospect.builder_type);
    $('bi-ro-project_focus').textContent = labelize(prospect.project_focus);
    var fit = profile && profile.estimated_fit_score != null ? profile.estimated_fit_score : '—';
    $('bi-ro-fit_score').textContent = fit !== '—' ? String(fit) : '—';
    $('bi-ro-target_suburbs').textContent =
      prospect.target_suburbs || (profile && arrayToInput(profile.target_suburbs)) || '—';
    renderSignalTags('bi-ro-quality_signals', profile && profile.quality_signals, 'quality');
    renderSignalTags('bi-ro-risk_signals', profile && profile.risk_signals, 'risk');
  }

  function renderResearchRuns(runs) {
    var el = $('bi-research-runs');
    if (!el) return;
    if (!runs || !runs.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<h4 class="bi-runs-heading">Research runs</h4>' +
      runs
        .map(function (run) {
          return (
            '<div class="bi-research-run-item"><strong>' +
            esc(labelize(run.status)) +
            '</strong> · ' +
            esc(fmtDate(run.started_at)) +
            (run.summary ? '<br>' + esc(run.summary) : '') +
            '</div>'
          );
        })
        .join('');
  }

  function fillDetailForm(p) {
    $('bi-id').value = p.id || '';
    $('bi-company_name').value = p.company_name || '';
    $('bi-website').value = p.website || '';
    $('bi-contact_name').value = p.contact_name || p.decision_maker_name || '';
    $('bi-decision_maker_name').value = p.decision_maker_name || p.contact_name || '';
    $('bi-decision_maker_role').value = p.decision_maker_role || '';
    $('bi-phone').value = p.phone || '';
    $('bi-email').value = p.email || '';
    $('bi-founder_notes').value = p.founder_notes || '';
    $('bi-relationship_level').value = p.relationship_level || 'never_contacted';
    $('bi-timing_status').value = p.timing_status || 'unknown';
    $('bi-opportunity_potential').value = p.opportunity_potential || 'medium';
    $('bi-source').value = p.source || 'manual';
    $('bi-suburb').value = p.suburb || '';
    $('bi-notes').value = p.notes || '';
    $('bi-builder_status').value = p.builder_status || 'prospect';
    $('bi-relationship_strength').value = p.relationship_strength || 'unknown';
    $('bi-target_suburbs').value = p.target_suburbs || '';
    $('bi-builder_type').value = p.builder_type || 'unknown';
    $('bi-project_focus').value = p.project_focus || 'unknown';
    $('bi-fit_priority').value = p.fit_priority || 'unknown';
    $('bi-research_status').value = p.research_status || 'not_started';
    $('bi-relationship_stage').value = p.relationship_stage || 'discovered';
  }

  function detailSavePayload() {
    var contactName = $('bi-contact_name').value;
    return {
      company_name: $('bi-company_name').value,
      website: $('bi-website').value,
      contact_name: contactName,
      decision_maker_name: contactName,
      decision_maker_role: $('bi-decision_maker_role').value,
      phone: $('bi-phone').value,
      email: $('bi-email').value,
      source: $('bi-source').value,
      founder_notes: $('bi-founder_notes').value,
      relationship_level: $('bi-relationship_level').value,
      timing_status: $('bi-timing_status').value,
      opportunity_potential: $('bi-opportunity_potential').value,
    };
  }

  function reloadDashboardSections() {
    return Promise.all([loadTargets(), loadStrategicPartners(), loadActivePartners()]);
  }

  function loadTargets() {
    var band = ($('bi-target-band') && $('bi-target-band').value) || '';
    var p = new URLSearchParams();
    p.set('limit', '10');
    if (band) p.set('band', band);
    var listEl = $('bi-targets-list');
    if (listEl) listEl.innerHTML = '<p class="bi-empty">Loading…</p>';
    return fetch('/api/builder-intel/targets?' + p.toString())
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed');
        renderTargets(j.targets || []);
      })
      .catch(function (e) {
        if (listEl) listEl.innerHTML = '<p class="bi-empty">' + esc(e.message) + '</p>';
      });
  }

  function renderTargets(targets) {
    var listEl = $('bi-targets-list');
    if (!listEl) return;
    if (!targets.length) {
      listEl.innerHTML = '<p class="bi-empty">No prospect priorities yet.</p>';
      return;
    }
    listEl.innerHTML = targets
      .map(function (t) {
        var score = t.founder_priority_score != null ? t.founder_priority_score : t.target_score;
        var band = t.founder_priority_band || t.target_band;
        return (
          '<div class="bi-target-card" data-id="' +
          esc(t.prospect_id) +
          '"><div class="bi-target-rank">#' +
          esc(String(t.rank)) +
          '</div><div><div class="bi-target-name">' +
          esc(t.company_name) +
          '</div><div class="bi-target-action">' +
          esc(t.next_best_action || '—') +
          '</div></div><div class="bi-target-scorebox"><div class="bi-target-score-label">Prospect Priority</div><div class="bi-target-score">' +
          esc(String(score)) +
          '</div><span class="bi-band ' +
          bandClass(band) +
          '">' +
          esc(band) +
          '</span></div></div>'
        );
      })
      .join('');
    bindCardClicks(listEl);
  }

  function loadStrategicPartners() {
    var listEl = $('bi-strategic-list');
    if (listEl) listEl.innerHTML = '<p class="bi-empty">Loading…</p>';
    return fetch('/api/builder-intel/strategic-partners?limit=10')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed');
        renderPartnerCards(j.partners || [], 'bi-strategic-list', 'strategic');
      })
      .catch(function (e) {
        if (listEl) listEl.innerHTML = '<p class="bi-empty">' + esc(e.message) + '</p>';
      });
  }

  function loadActivePartners() {
    var listEl = $('bi-active-list');
    if (listEl) listEl.innerHTML = '<p class="bi-empty">Loading…</p>';
    return fetch('/api/builder-intel/active-partners?limit=10')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed');
        renderPartnerCards(j.partners || [], 'bi-active-list', 'active');
      })
      .catch(function (e) {
        if (listEl) listEl.innerHTML = '<p class="bi-empty">' + esc(e.message) + '</p>';
      });
  }

  function renderPartnerCards(partners, listId, kind) {
    var listEl = $(listId);
    if (!listEl) return;
    if (!partners.length) {
      listEl.innerHTML =
        '<p class="bi-empty">' +
        (kind === 'strategic' ? 'No strategic partners yet.' : 'No active partners yet.') +
        '</p>';
      return;
    }
    listEl.innerHTML = partners
      .map(function (p) {
        var score = p.partner_value_score != null ? p.partner_value_score : '—';
        var band = p.partner_value_band || '—';
        return (
          '<div class="bi-target-card bi-partner-card" data-id="' +
          esc(p.prospect_id) +
          '"><div class="bi-target-rank">' +
          (kind === 'strategic' ? '★' : '◆') +
          '</div><div><div class="bi-target-name">' +
          esc(p.company_name) +
          '</div><div class="bi-target-action">' +
          esc(p.next_best_action || 'Review Partner') +
          '</div></div><div class="bi-target-scorebox"><div class="bi-target-score-label">Partner Value</div><div class="bi-target-score">' +
          esc(String(score)) +
          '</div><span class="bi-band ' +
          bandClass(band) +
          '">' +
          esc(band) +
          '</span></div></div>'
        );
      })
      .join('');
    bindCardClicks(listEl);
  }

  function bindCardClicks(container) {
    container.querySelectorAll('[data-id]').forEach(function (card) {
      card.addEventListener('click', function () {
        openDetail(card.getAttribute('data-id'));
      });
    });
  }

  function recalculateTargets() {
    fetch('/api/builder-intel/targets/recalculate?limit=10', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({}),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Recalculate failed');
        renderTargets(j.targets || []);
        showMsg('Scores recalculated.', false);
        return Promise.all([loadList(), reloadDashboardSections()]);
      })
      .catch(function (e) {
        showMsg(e.message || 'Recalculate failed.', true);
      });
  }

  function fillSelect(id, options, placeholder, labelMap) {
    var el = $(id);
    if (!el || !options) return;
    var current = el.value;
    el.innerHTML = '';
    if (placeholder) {
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = placeholder;
      el.appendChild(opt0);
    }
    options.forEach(function (v) {
      var opt = document.createElement('option');
      var value = typeof v === 'object' ? v.value : v;
      var label = typeof v === 'object' ? v.label : labelMap && labelMap[v] ? labelMap[v] : labelize(v);
      opt.value = value;
      opt.textContent = label;
      el.appendChild(opt);
    });
    if (current) el.value = current;
  }

  function loadEnums() {
    return fetch('/api/builder-intel/prospects/enums')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed to load enums');
        enums = j;
        fillSelect('bi-filter-priority', j.fit_priorities, 'All priorities');
        fillSelect('bi-filter-research', j.research_statuses, 'All research');
        fillSelect('bi-add-source', j.discovery_sources || [], null);
        fillSelect('bi-source', j.discovery_sources || [], null);
        fillSelect('bi-relationship_level', j.relationship_levels || [], null);
        fillSelect('bi-timing_status', j.timing_statuses);
        fillSelect('bi-opportunity_potential', j.founder_opportunity_potentials || j.opportunity_potentials);
        fillSelect('bi-disc-source', j.discovery_run_sources || [], null);
        if ($('bi-disc-source') && !$('bi-disc-source').value) {
          $('bi-disc-source').value = 'manual_seed';
        }
        if ($('bi-add-source') && !$('bi-add-source').value) {
          $('bi-add-source').value = 'google_search';
        }
      });
  }

  function buildQuery() {
    var p = new URLSearchParams();
    var search = ($('bi-search') && $('bi-search').value) || '';
    var priority = ($('bi-filter-priority') && $('bi-filter-priority').value) || '';
    var research = ($('bi-filter-research') && $('bi-filter-research').value) || '';
    if (search.trim()) p.set('search', search.trim());
    if (priority) p.set('fit_priority', priority);
    if (research) p.set('research_status', research);
    p.set('limit', '200');
    return p.toString();
  }

  function renderBuilderCards() {
    var el = $('bi-builder-cards');
    var totalEl = $('bi-total');
    if (!el) return;
    if (!prospects.length) {
      el.innerHTML = '<p class="bi-empty">No builders yet. Add one to start discovery.</p>';
      if (totalEl) totalEl.textContent = '0 builders';
      return;
    }
    el.innerHTML = prospects
      .map(function (p) {
        var fit = p.estimated_fit_score != null ? 'Fit Score ' + p.estimated_fit_score : 'Not researched';
        return (
          '<article class="bi-builder-card" data-id="' +
          esc(p.id) +
          '"><h3 class="bi-card-company">' +
          esc(p.company_name) +
          '</h3><p class="bi-card-focus">' +
          esc(focusLineForProspect(p)) +
          '</p><p class="bi-card-fit">' +
          esc(fit) +
          '</p><p class="bi-card-action"><span>Suggested:</span> <strong>' +
          esc(suggestedActionForProspect(p)) +
          '</strong></p><p class="bi-card-status"><span>Relationship:</span> <strong>' +
          esc(relationshipLevelLabel(p.relationship_level)) +
          '</strong></p></article>'
        );
      })
      .join('');
    if (totalEl) totalEl.textContent = prospects.length + ' builder(s)';
    bindCardClicks(el);
  }

  function loadList() {
    var el = $('bi-builder-cards');
    if (el) el.innerHTML = '<p class="bi-empty">Loading…</p>';
    return fetch('/api/builder-intel/prospects?' + buildQuery())
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Load failed');
        prospects = j.prospects || [];
        renderBuilderCards();
      })
      .catch(function (e) {
        showMsg(e.message || 'Failed to load builders', true);
        if (el) el.innerHTML = '<p class="bi-empty">Error loading data</p>';
      });
  }

  function arrayToInput(arr) {
    if (!arr || !arr.length) return '';
    return arr.join(', ');
  }

  function loadProfileAndRuns(id) {
    showProfileError('');
    return Promise.all([
      fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/profile').then(function (r) {
        return r.json();
      }),
      fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/research-runs').then(function (r) {
        return r.json();
      }),
    ])
      .then(function (results) {
        var profileRes = results[0];
        var runsRes = results[1];
        currentProfile = profileRes.ok ? profileRes.profile : null;
        if (!profileRes.ok) {
          showProfileError(profileRes.error || 'Could not load research profile.');
        }
        if (currentProspect && currentProspect.id === id) {
          renderResearchResults(currentProspect, currentProfile);
          renderRecommendedAction(currentProspect, currentProfile);
        }
        renderResearchRuns(runsRes.ok ? runsRes.runs : []);
      })
      .catch(function (e) {
        showProfileError(e.message || 'Failed to load profile.');
        currentProfile = null;
      });
  }

  function showProfileError(text) {
    var el = $('bi-profile-error');
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
  }

  function openAddModal() {
    var overlay = $('bi-add-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    $('bi-add-form').reset();
    if ($('bi-add-source')) $('bi-add-source').value = 'google_search';
    var statusEl = $('bi-add-status');
    if (statusEl) statusEl.style.display = 'none';
  }

  function closeAddModal() {
    var overlay = $('bi-add-overlay');
    if (overlay) overlay.hidden = true;
  }

  function saveAddAndResearch(e) {
    e.preventDefault();
    var btn = $('bi-btn-save-research');
    var statusEl = $('bi-add-status');
    var company = ($('bi-add-company_name') && $('bi-add-company_name').value) || '';
    var website = ($('bi-add-website') && $('bi-add-website').value) || '';
    if (!company.trim() || !website.trim()) {
      showMsg('Company name and website are required.', true);
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Researching…';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Saving builder and running website research…';
    }
    fetch('/api/builder-intel/prospects', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({
        company_name: company.trim(),
        website: website.trim(),
        source: ($('bi-add-source') && $('bi-add-source').value) || 'google_search',
        auto_research: true,
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (!res.body.ok) throw new Error(res.body.error || 'Save failed');
        closeAddModal();
        if (res.body.research_error) {
          showMsg('Builder saved but research failed: ' + res.body.research_error, true);
        } else {
          showMsg('Builder added and researched.', false);
        }
        return Promise.all([loadList(), reloadDashboardSections()]).then(function () {
          if (res.body.prospect && res.body.prospect.id) {
            openDetail(res.body.prospect.id);
          }
        });
      })
      .catch(function (err) {
        showMsg(err.message || 'Save failed — check API secret.', true);
        if (statusEl) statusEl.textContent = err.message || 'Failed';
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save & Research';
        }
      });
  }

  function openDetail(id) {
    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id))
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok || !j.prospect) throw new Error(j.error || 'Not found');
        var panel = $('bi-panel');
        if (panel) panel.hidden = false;
        currentProspect = j.prospect;
        fillDetailForm(j.prospect);
        renderResearchResults(j.prospect, null);
        renderRecommendedAction(j.prospect, null);
        renderOutreach(j.prospect.outreach_log);
        $('bi-new-note').value = '';
        return loadProfileAndRuns(id);
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function closeDetail() {
    var panel = $('bi-panel');
    if (panel) panel.hidden = true;
    currentProspect = null;
    currentProfile = null;
  }

  function saveDetail() {
    var id = $('bi-id').value;
    if (!id) return;
    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: secretHeaders(),
      body: JSON.stringify(detailSavePayload()),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Save failed');
        showMsg('Saved.', false);
        if (j.prospect) {
          currentProspect = j.prospect;
          fillDetailForm(j.prospect);
          renderRecommendedAction(j.prospect, currentProfile);
        }
        return Promise.all([loadList(), reloadDashboardSections()]);
      })
      .catch(function (e) {
        showMsg(e.message || 'Save failed.', true);
      });
  }

  function runWebsiteResearch() {
    var id = $('bi-id').value;
    var btn = $('bi-btn-run-research');
    var statusEl = $('bi-research-status');
    if (!id) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Researching…';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Fetching website…';
    }
    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/research/run', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({ force: true }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (!res.body.ok) throw new Error(res.body.error || 'Research failed');
        showMsg('Research completed.', false);
        return Promise.all([loadList(), loadProfileAndRuns(id), reloadDashboardSections()]);
      })
      .catch(function (e) {
        showMsg(e.message || 'Research failed.', true);
        if (statusEl) statusEl.textContent = e.message;
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Re-run Website Research';
        }
      });
  }

  function renderOutreach(log) {
    var el = $('bi-outreach');
    if (!el) return;
    if (!log || !log.length) {
      el.innerHTML = '<p class="bi-empty-inline">No outreach logged yet.</p>';
      return;
    }
    el.innerHTML = log
      .map(function (o) {
        return (
          '<div class="bi-outreach-item">' +
          esc(fmtDate(o.sent_at)) +
          ' · ' +
          esc(o.channel) +
          ' · ' +
          esc(o.status) +
          '</div>'
        );
      })
      .join('');
  }

  function addNote() {
    var id = $('bi-id').value;
    var note = ($('bi-new-note') && $('bi-new-note').value) || '';
    if (!id || !note.trim()) {
      showMsg('Enter a note first.', true);
      return;
    }
    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/notes', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({ note: note.trim() }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed');
        $('bi-notes').value = j.prospect.notes || '';
        $('bi-new-note').value = '';
        showMsg('Note added.', false);
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function parseSeedJson() {
    var raw = ($('bi-disc-seed-json') && $('bi-disc-seed-json').value) || '';
    if (!raw.trim()) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Seed JSON must be an array');
      return parsed;
    } catch (e) {
      throw new Error('Invalid seed JSON: ' + (e.message || 'parse error'));
    }
  }

  function setDiscoveryStatus(text) {
    var el = $('bi-disc-run-status');
    if (el) el.textContent = text || '';
  }

  function renderDiscoveryRunMeta(run, extra) {
    var el = $('bi-disc-run-meta');
    if (!el || !run) {
      if (el) el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<strong>Run:</strong> ' +
      esc(run.query) +
      (run.location ? ' · ' + esc(run.location) : '') +
      ' · ' +
      esc(run.status) +
      ' · ' +
      String(run.total_found || 0) +
      ' found · ' +
      String(run.imported_count || 0) +
      ' imported' +
      (extra ? ' · ' + esc(extra) : '');
  }

  function discoveryStatusClass(status) {
    return 'bi-disc-status-tag ' + (status || 'candidate');
  }

  function canSelectCandidate(c) {
    return c.status === 'candidate';
  }

  function renderDiscoveryCandidates(candidates) {
    discoveryCandidates = candidates || [];
    var tbody = $('bi-disc-candidates');
    var toolbar = $('bi-disc-toolbar');
    if (!tbody) return;

    if (!discoveryCandidates.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="bi-empty-cell">No candidates in this run.</td></tr>';
      if (toolbar) toolbar.hidden = true;
      return;
    }

    if (toolbar) toolbar.hidden = false;
    tbody.innerHTML = discoveryCandidates
      .map(function (c) {
        var selectable = canSelectCandidate(c);
        return (
          '<tr data-candidate-id="' +
          esc(c.id) +
          '"><td>' +
          (selectable
            ? '<input type="checkbox" class="bi-disc-check" data-id="' + esc(c.id) + '" />'
            : '') +
          '</td><td>' +
          esc(c.company_name) +
          '</td><td>' +
          (c.website
            ? '<a href="' + esc(c.website) + '" target="_blank" rel="noopener">' + esc(c.website) + '</a>'
            : '—') +
          '</td><td>' +
          esc(c.phone || '—') +
          '</td><td>' +
          esc(c.location || c.suburb || '—') +
          '</td><td>' +
          String(c.confidence_score != null ? c.confidence_score : '—') +
          '</td><td>' +
          esc(labelize(c.suggested_builder_type)) +
          '</td><td><span class="' +
          discoveryStatusClass(c.status) +
          '">' +
          esc(c.status) +
          '</span></td><td class="bi-disc-actions">' +
          (selectable
            ? '<button type="button" class="bi-btn bi-disc-import-one" data-id="' +
              esc(c.id) +
              '">Import</button><button type="button" class="bi-btn bi-disc-dismiss-one" data-id="' +
              esc(c.id) +
              '">Dismiss</button>'
            : '—') +
          '</td></tr>'
        );
      })
      .join('');

    bindDiscoveryRowActions(tbody);
  }

  function bindDiscoveryRowActions(container) {
    container.querySelectorAll('.bi-disc-import-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        importDiscoveryCandidates([btn.getAttribute('data-id')]);
      });
    });
    container.querySelectorAll('.bi-disc-dismiss-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        dismissDiscoveryCandidates([btn.getAttribute('data-id')]);
      });
    });
  }

  function getSelectedDiscoveryIds() {
    return Array.prototype.slice
      .call(document.querySelectorAll('.bi-disc-check:checked'))
      .map(function (el) {
        return el.getAttribute('data-id');
      })
      .filter(Boolean);
  }

  function reloadDiscoveryRun() {
    if (!currentDiscoveryRunId) return Promise.resolve();
    return fetch('/api/builder-intel/discovery/runs/' + encodeURIComponent(currentDiscoveryRunId))
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed to load run');
        renderDiscoveryRunMeta(j.run);
        renderDiscoveryCandidates(j.candidates || []);
      });
  }

  function runDiscovery() {
    var query = ($('bi-disc-query') && $('bi-disc-query').value) || '';
    var location = ($('bi-disc-location') && $('bi-disc-location').value) || '';
    var source = ($('bi-disc-source') && $('bi-disc-source').value) || 'manual_seed';
    var btn = $('bi-btn-disc-run');

    if (!query.trim()) {
      showMsg('Enter a search query.', true);
      return;
    }

    var seedCandidates = [];
    if (source === 'manual_seed') {
      try {
        seedCandidates = parseSeedJson();
      } catch (e) {
        showMsg(e.message, true);
        return;
      }
      if (!seedCandidates.length) {
        showMsg('Paste seed candidates JSON for manual seed discovery.', true);
        return;
      }
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running…';
    }
    setDiscoveryStatus('Creating discovery run…');

    fetch('/api/builder-intel/discovery/run', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({
        query: query.trim(),
        location: location.trim(),
        source: source,
        seed_candidates: seedCandidates,
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, body: j };
        });
      })
      .then(function (res) {
        if (!res.body.ok) throw new Error(res.body.error || 'Discovery failed');
        currentDiscoveryRunId = res.body.run && res.body.run.id;
        var extra = res.body.web_discovery_disabled ? 'web search disabled' : null;
        renderDiscoveryRunMeta(res.body.run, extra);
        renderDiscoveryCandidates(res.body.candidates || []);
        setDiscoveryStatus('Discovery complete.');
        showMsg('Discovery run completed.', false);
      })
      .catch(function (e) {
        setDiscoveryStatus('');
        showMsg(e.message || 'Discovery failed.', true);
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Discovery';
        }
      });
  }

  function importDiscoveryCandidates(ids) {
    if (!ids || !ids.length) {
      showMsg('Select candidates to import.', true);
      return Promise.resolve();
    }
    return fetch('/api/builder-intel/discovery/candidates/import-selected', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({ candidate_ids: ids }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Import failed');
        var imported = j.imported_count || 0;
        var failed = (j.errors && j.errors.length) || 0;
        showMsg('Imported ' + imported + ' builder(s)' + (failed ? ' · ' + failed + ' skipped' : '') + '.', false);
        return Promise.all([reloadDiscoveryRun(), loadList()]);
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function dismissDiscoveryCandidates(ids) {
    if (!ids || !ids.length) {
      showMsg('Select candidates to dismiss.', true);
      return Promise.resolve();
    }
    return fetch('/api/builder-intel/discovery/candidates/dismiss-selected', {
      method: 'POST',
      headers: secretHeaders(),
      body: JSON.stringify({ candidate_ids: ids }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Dismiss failed');
        showMsg('Dismissed ' + (j.count || 0) + ' candidate(s).', false);
        return reloadDiscoveryRun();
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function bindEvents() {
    $('bi-btn-refresh').addEventListener('click', function () {
      loadList();
      reloadDashboardSections();
    });
    $('bi-btn-recalc-targets').addEventListener('click', recalculateTargets);
    $('bi-target-band').addEventListener('change', loadTargets);
    $('bi-btn-add').addEventListener('click', openAddModal);
    $('bi-add-close').addEventListener('click', closeAddModal);
    $('bi-add-form').addEventListener('submit', saveAddAndResearch);
    $('bi-panel-close').addEventListener('click', closeDetail);
    $('bi-btn-save').addEventListener('click', saveDetail);
    $('bi-btn-run-research').addEventListener('click', runWebsiteResearch);
    $('bi-btn-add-note').addEventListener('click', addNote);
    $('bi-panel').addEventListener('click', function (e) {
      if (e.target === $('bi-panel')) closeDetail();
    });
    $('bi-add-overlay').addEventListener('click', function (e) {
      if (e.target === $('bi-add-overlay')) closeAddModal();
    });
    var addDialog = document.querySelector('.bi-add-dialog');
    if (addDialog) {
      addDialog.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    ['bi-filter-priority', 'bi-filter-research'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', loadList);
    });
    var searchEl = $('bi-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadList, 300);
      });
    }
    var discRunBtn = $('bi-btn-disc-run');
    if (discRunBtn) discRunBtn.addEventListener('click', runDiscovery);
    var discImportBtn = $('bi-btn-disc-import-selected');
    if (discImportBtn) {
      discImportBtn.addEventListener('click', function () {
        importDiscoveryCandidates(getSelectedDiscoveryIds());
      });
    }
    var discDismissBtn = $('bi-btn-disc-dismiss-selected');
    if (discDismissBtn) {
      discDismissBtn.addEventListener('click', function () {
        dismissDiscoveryCandidates(getSelectedDiscoveryIds());
      });
    }
    var discSelectAll = $('bi-disc-select-all');
    if (discSelectAll) {
      discSelectAll.addEventListener('change', function () {
        var checked = discSelectAll.checked;
        document.querySelectorAll('.bi-disc-check').forEach(function (el) {
          el.checked = checked;
        });
      });
    }
  }

  loadEnums()
    .then(function () {
      return Promise.all([loadList(), loadTargets(), loadStrategicPartners(), loadActivePartners()]);
    })
    .then(bindEvents)
    .catch(function (e) {
      showMsg(e.message || 'Failed to initialise', true);
    });
})();
