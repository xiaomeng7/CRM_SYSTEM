/**
 * Builder Intelligence UI (PR8A) — manual Adelaide builder prospect pipeline.
 */
(function () {
  var enums = null;
  var prospects = [];
  var debounceTimer = null;

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

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-AU', {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false,
      });
    } catch (_) {
      return '—';
    }
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      var pad = function (n) {
        return n < 10 ? '0' + n : String(n);
      };
      return (
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        'T' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes())
      );
    } catch (_) {
      return '';
    }
  }

  function fromLocalInput(val) {
    if (!val) return null;
    var d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function secretHeaders() {
    var secret = ($('bi-secret') && $('bi-secret').value) || '';
    var h = { 'Content-Type': 'application/json' };
    if (secret) {
      h['x-admin-secret'] = secret;
    }
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

  function priorityClass(p) {
    if (p === 'high') return 'high';
    if (p === 'medium') return 'medium';
    if (p === 'low') return 'low';
    return 'unknown';
  }

  function bandClass(b) {
    return b || 'D';
  }

  function loadTargets() {
    var band = ($('bi-target-band') && $('bi-target-band').value) || '';
    var p = new URLSearchParams();
    p.set('limit', '10');
    if (band) p.set('band', band);

    var listEl = $('bi-targets-list');
    if (listEl) listEl.innerHTML = '<p class="bi-empty">Loading targets…</p>';

    return fetch('/api/builder-intel/targets?' + p.toString())
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed to load targets');
        renderTargets(j.targets || []);
      })
      .catch(function (e) {
        if (listEl) {
          listEl.innerHTML =
            '<p class="bi-empty">' + esc(e.message || 'No targets — run Recalculate') + '</p>';
        }
      });
  }

  function renderTargets(targets) {
    var listEl = $('bi-targets-list');
    if (!listEl) return;
    if (!targets.length) {
      listEl.innerHTML =
        '<p class="bi-empty">No targets yet. Add builders, run research, then Recalculate.</p>';
      return;
    }
    listEl.innerHTML = targets
      .map(function (t) {
        return (
          '<div class="bi-target-card" data-id="' +
          esc(t.prospect_id) +
          '">' +
          '<div class="bi-target-rank">#' +
          esc(String(t.rank)) +
          '</div>' +
          '<div>' +
          '<div class="bi-target-name">' +
          esc(t.company_name) +
          '</div>' +
          '<div class="bi-target-meta">' +
          esc(labelize(t.relationship_stage)) +
          (t.estimated_fit_score != null ? ' · Fit ' + esc(String(t.estimated_fit_score)) : '') +
          (t.last_contacted_at ? ' · Last ' + esc(fmtDate(t.last_contacted_at)) : '') +
          '</div>' +
          '<div class="bi-target-action">Next: ' +
          esc(t.next_best_action || '—') +
          '</div>' +
          '</div>' +
          '<div class="bi-target-scorebox">' +
          '<div class="bi-target-score">' +
          esc(String(t.target_score)) +
          '</div>' +
          '<span class="bi-band ' +
          bandClass(t.target_band) +
          '">' +
          esc(t.target_band) +
          '</span>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    listEl.querySelectorAll('.bi-target-card[data-id]').forEach(function (card) {
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
        showMsg('Target scores recalculated.', false);
        return loadList();
      })
      .catch(function (e) {
        showMsg(e.message || 'Recalculate failed — check API secret.', true);
      });
  }

  function fillSelect(id, options, placeholder) {
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
      opt.value = v;
      opt.textContent = labelize(v);
      el.appendChild(opt);
    });
    if (current) el.value = current;
  }

  function fillFitSelects() {
    if (!enums || !enums.fit_levels) return;
    ['bi-smart_home_fit', 'bi-architectural_fit', 'bi-luxury_fit'].forEach(function (id) {
      fillSelect(id, enums.fit_levels);
    });
  }

  function arrayToInput(arr) {
    if (!arr || !arr.length) return '';
    return arr.join(', ');
  }

  function loadEnums() {
    return fetch('/api/builder-intel/prospects/enums')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed to load enums');
        enums = j;
        fillSelect('bi-filter-stage', j.relationship_stages, 'All stages');
        fillSelect('bi-filter-type', j.builder_types, 'All builder types');
        fillSelect('bi-filter-priority', j.fit_priorities, 'All priorities');
        fillSelect('bi-filter-research', j.research_statuses, 'All research');
        fillSelect('bi-builder_type', j.builder_types);
        fillSelect('bi-project_focus', j.project_focus);
        fillSelect('bi-fit_priority', j.fit_priorities);
        fillSelect('bi-research_status', j.research_statuses);
        fillSelect('bi-relationship_stage', j.relationship_stages);
        fillFitSelects();
      });
  }

  function buildQuery() {
    var p = new URLSearchParams();
    var search = ($('bi-search') && $('bi-search').value) || '';
    var stage = ($('bi-filter-stage') && $('bi-filter-stage').value) || '';
    var type = ($('bi-filter-type') && $('bi-filter-type').value) || '';
    var priority = ($('bi-filter-priority') && $('bi-filter-priority').value) || '';
    var research = ($('bi-filter-research') && $('bi-filter-research').value) || '';
    if (search.trim()) p.set('search', search.trim());
    if (stage) p.set('relationship_stage', stage);
    if (type) p.set('builder_type', type);
    if (priority) p.set('fit_priority', priority);
    if (research) p.set('research_status', research);
    p.set('limit', '200');
    return p.toString();
  }

  function renderStats(stageStats) {
    var el = $('bi-stats');
    if (!el) return;
    if (!stageStats || !stageStats.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = stageStats
      .map(function (s) {
        return (
          '<span class="bi-stat-pill"><strong>' +
          esc(String(s.cnt)) +
          '</strong>' +
          esc(labelize(s.relationship_stage)) +
          '</span>'
        );
      })
      .join('');
  }

  function renderTable() {
    var tbody = $('bi-tbody');
    var totalEl = $('bi-total');
    if (!tbody) return;

    if (!prospects.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="bi-empty">No builder prospects yet. Add one to start.</td></tr>';
      if (totalEl) totalEl.textContent = '0 builders';
      return;
    }

    tbody.innerHTML = prospects
      .map(function (p) {
        var web =
          p.website
            ? '<a class="bi-link" href="' +
              esc(p.website.startsWith('http') ? p.website : 'https://' + p.website) +
              '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
              esc(p.website.replace(/^https?:\/\//, '').slice(0, 28)) +
              '</a>'
            : '—';
        return (
          '<tr data-id="' +
          esc(p.id) +
          '">' +
          '<td><strong>' +
          esc(p.company_name) +
          '</strong><br>' +
          web +
          '</td>' +
          '<td>' +
          esc(p.suburb || '—') +
          '</td>' +
          '<td>' +
          esc(labelize(p.builder_type)) +
          '</td>' +
          '<td>' +
          esc(labelize(p.project_focus)) +
          '</td>' +
          '<td><span class="bi-badge ' +
          priorityClass(p.fit_priority) +
          '">' +
          esc(labelize(p.fit_priority)) +
          '</span></td>' +
          '<td>' +
          esc(labelize(p.relationship_stage)) +
          '</td>' +
          '<td>' +
          esc(labelize(p.research_status)) +
          '</td>' +
          '<td>' +
          esc(fmtDate(p.next_followup_at)) +
          '</td>' +
          '<td>' +
          esc(fmtDate(p.last_contacted_at)) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    if (totalEl) totalEl.textContent = prospects.length + ' builder(s) shown';

    tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
      row.addEventListener('click', function () {
        openDetail(row.getAttribute('data-id'));
      });
    });
  }

  function loadList() {
    showMsg('');
    var tbody = $('bi-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="bi-empty">Loading…</td></tr>';

    return fetch('/api/builder-intel/prospects?' + buildQuery())
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Load failed');
        prospects = j.prospects || [];
        renderStats(j.stage_stats);
        renderTable();
      })
      .catch(function (e) {
        showMsg(e.message || 'Failed to load prospects', true);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="bi-empty">Error loading data</td></tr>';
      });
  }

  function setSectionVisible(el, visible) {
    if (!el) return;
    el.classList.toggle('bi-section-hidden', !visible);
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

  function fitBandFromScore(score) {
    if (score == null || score === '') return '—';
    var n = Number(score);
    if (!Number.isFinite(n)) return '—';
    if (n >= 90) return 'A';
    if (n >= 75) return 'B';
    if (n >= 50) return 'C';
    return 'D';
  }

  function renderBulletList(elId, items, emptyText) {
    var el = $(elId);
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<li class="bi-empty-item">' + esc(emptyText || 'None yet') + '</li>';
      return;
    }
    el.innerHTML = items
      .map(function (item) {
        return '<li>' + esc(item) + '</li>';
      })
      .join('');
  }

  function renderScoreBreakdown(breakdown) {
    var listEl = $('bi-score-breakdown-list');
    var detailsEl = $('bi-score-breakdown-details');
    if (!listEl || !detailsEl) return;
    if (!breakdown || !breakdown.details || !breakdown.details.length) {
      listEl.innerHTML = '<li class="bi-empty-item">No breakdown — run website research.</li>';
      return;
    }
    var rows = [];
    if (breakdown.base != null) {
      rows.push({ signal: 'Base score', points: breakdown.base, type: 'base' });
    }
    rows = rows.concat(breakdown.details);
    if (breakdown.synergy) {
      /* synergy already in details */
    }
    if (breakdown.total != null) {
      rows.push({ signal: 'Total fit score', points: breakdown.total, type: 'total' });
    }
    listEl.innerHTML = rows
      .map(function (row) {
        var pts =
          row.type === 'total'
            ? String(row.points)
            : (row.points > 0 ? '+' : '') + String(row.points);
        var cls =
          row.type === 'risk' || row.points < 0
            ? 'down'
            : row.type === 'total'
              ? 'total'
              : 'up';
        return (
          '<li class="bi-breakdown-item ' +
          cls +
          '"><span>' +
          esc(row.signal) +
          '</span><strong>' +
          esc(pts) +
          '</strong></li>'
        );
      })
      .join('');
  }

  function renderFitSnapshot(profile) {
    var snapshot = $('bi-fit-snapshot');
    if (!snapshot) return;

    if (!profile) {
      $('bi-snapshot-score').textContent = '—';
      var bandEl = $('bi-snapshot-band');
      if (bandEl) {
        bandEl.textContent = '—';
        bandEl.className = 'bi-band';
      }
      var founderEl = $('bi-founder-summary');
      if (founderEl) founderEl.textContent = '';
      renderBulletList('bi-why-bht-fit', [], 'Run website research to generate fit analysis.');
      renderBulletList('bi-opportunity-summary', [], 'Opportunities appear after research.');
      $('bi-recommended-action').textContent = 'Research Further';
      renderScoreBreakdown(null);
      return;
    }

    var score = profile.estimated_fit_score;
    var band = fitBandFromScore(score);
    $('bi-snapshot-score').textContent = score != null ? String(score) : '—';
    var bandDisplay = $('bi-snapshot-band');
    if (bandDisplay) {
      bandDisplay.textContent = band;
      bandDisplay.className = 'bi-band ' + bandClass(band === '—' ? 'D' : band);
    }
    var founderSummaryEl = $('bi-founder-summary');
    if (founderSummaryEl) {
      founderSummaryEl.textContent = profile.founder_summary || profile.profile_summary || '';
    }
    renderBulletList('bi-why-bht-fit', profile.why_bht_fit, 'No fit signals yet.');
    renderBulletList('bi-opportunity-summary', profile.opportunity_summary, 'No opportunities identified.');
    $('bi-recommended-action').textContent =
      profile.recommended_founder_action || 'Review Builder';
    renderScoreBreakdown(profile.score_breakdown);
  }

  function updateScoreBanner(profile) {
    var scoreEl = $('bi-score-display');
    var sourceEl = $('bi-research_source_display');
    var lastEl = $('bi-last_researched_display');
    if (scoreEl) {
      scoreEl.textContent =
        profile && profile.estimated_fit_score != null ? String(profile.estimated_fit_score) : '—';
    }
    if (sourceEl) {
      sourceEl.textContent =
        profile && profile.research_source ? labelize(profile.research_source) : '—';
    }
    if (lastEl) {
      lastEl.textContent =
        profile && profile.last_researched_at ? fmtDate(profile.last_researched_at) : '—';
    }
  }

  function openPanel(isNew) {
    var panel = $('bi-panel');
    var noteSection = $('bi-note-section');
    var researchSection = $('bi-research-section');
    if (!panel) return;
    panel.hidden = false;
    setSectionVisible(noteSection, !isNew);
    setSectionVisible(researchSection, !isNew);
    showProfileError('');
    $('bi-panel-title').textContent = isNew ? 'Add Builder Prospect' : 'Edit Builder';
    if (isNew) {
      $('bi-form').reset();
      $('bi-id').value = '';
      fillProfileForm(null);
      renderResearchRuns([]);
      if (enums) {
        $('bi-builder_type').value = 'unknown';
        $('bi-project_focus').value = 'unknown';
        $('bi-fit_priority').value = 'unknown';
        $('bi-research_status').value = 'not_started';
        $('bi-relationship_stage').value = 'discovered';
      }
      $('bi-source').value = 'manual';
    }
  }

  function closePanel() {
    var panel = $('bi-panel');
    if (panel) panel.hidden = true;
  }

  function fillForm(p) {
    $('bi-id').value = p.id || '';
    $('bi-company_name').value = p.company_name || '';
    $('bi-website').value = p.website || '';
    $('bi-suburb').value = p.suburb || '';
    $('bi-target_suburbs').value = p.target_suburbs || '';
    $('bi-builder_type').value = p.builder_type || 'unknown';
    $('bi-project_focus').value = p.project_focus || 'unknown';
    $('bi-fit_priority').value = p.fit_priority || 'unknown';
    $('bi-research_status').value = p.research_status || 'not_started';
    $('bi-relationship_stage').value = p.relationship_stage || 'discovered';
    $('bi-decision_maker_name').value = p.decision_maker_name || '';
    $('bi-decision_maker_role').value = p.decision_maker_role || '';
    $('bi-contact_name').value = p.contact_name || '';
    $('bi-phone').value = p.phone || '';
    $('bi-email').value = p.email || '';
    $('bi-source').value = p.source || 'manual';
    $('bi-source_detail').value = p.source_detail || '';
    $('bi-next_followup_at').value = toLocalInput(p.next_followup_at);
    $('bi-qualification_notes').value = p.qualification_notes || '';
    $('bi-notes').value = p.notes || '';
  }

  function formPayload() {
    return {
      company_name: $('bi-company_name').value,
      website: $('bi-website').value,
      suburb: $('bi-suburb').value,
      target_suburbs: $('bi-target_suburbs').value,
      builder_type: $('bi-builder_type').value,
      project_focus: $('bi-project_focus').value,
      fit_priority: $('bi-fit_priority').value,
      research_status: $('bi-research_status').value,
      relationship_stage: $('bi-relationship_stage').value,
      decision_maker_name: $('bi-decision_maker_name').value,
      decision_maker_role: $('bi-decision_maker_role').value,
      contact_name: $('bi-contact_name').value,
      phone: $('bi-phone').value,
      email: $('bi-email').value,
      source: $('bi-source').value,
      source_detail: $('bi-source_detail').value,
      next_followup_at: fromLocalInput($('bi-next_followup_at').value),
      qualification_notes: $('bi-qualification_notes').value,
      notes: $('bi-notes').value,
    };
  }

  function renderResearchRuns(runs) {
    var el = $('bi-research-runs');
    if (!el) return;
    if (!runs || !runs.length) {
      el.innerHTML = '<h4 class="bi-runs-heading">Research runs</h4><p class="bi-empty-runs">No research runs logged.</p>';
      return;
    }
    el.innerHTML =
      '<h4 class="bi-runs-heading">Research runs</h4>' +
      runs
        .map(function (run) {
          var parts = [
            '<div class="bi-research-run-item">',
            '<div class="bi-run-header">',
            '<strong>' + esc(labelize(run.status || 'unknown')) + '</strong>',
            ' · ' + esc(labelize(run.source || '—')),
            '</div>',
          ];
          if (run.input_url) {
            parts.push('<div class="bi-run-row"><span class="bi-run-label">URL</span> ' + esc(run.input_url) + '</div>');
          }
          if (run.summary) {
            parts.push('<div class="bi-run-row"><span class="bi-run-label">Summary</span> ' + esc(run.summary) + '</div>');
          }
          parts.push(
            '<div class="bi-run-row"><span class="bi-run-label">Started</span> ' + esc(fmtDate(run.started_at)) + '</div>'
          );
          if (run.finished_at) {
            parts.push(
              '<div class="bi-run-row"><span class="bi-run-label">Finished</span> ' + esc(fmtDate(run.finished_at)) + '</div>'
            );
          }
          if (run.error_message) {
            parts.push(
              '<div class="bi-run-row bi-run-error"><span class="bi-run-label">Error</span> ' + esc(run.error_message) + '</div>'
            );
          }
          parts.push('</div>');
          return parts.join('');
        })
        .join('');
  }

  function fillProfileForm(profile) {
    var meta = $('bi-profile-meta');
    updateScoreBanner(profile);
    renderFitSnapshot(profile);
    if (!profile) {
      $('bi-profile_summary').value = '';
      $('bi-builder_focus').value = '';
      $('bi-project_types').value = '';
      $('bi-profile_target_suburbs').value = '';
      $('bi-quality_signals').value = '';
      $('bi-risk_signals').value = '';
      $('bi-ideal_contact_angle').value = '';
      $('bi-smart_home_fit').value = 'unknown';
      $('bi-architectural_fit').value = 'unknown';
      $('bi-luxury_fit').value = 'unknown';
      $('bi-estimated_fit_score').value = '';
      $('bi-last_researched_at').textContent = '—';
      if (meta) meta.textContent = 'No research profile yet — run website research or save manually.';
      renderSignalsDisplay(null);
      return;
    }

    $('bi-profile_summary').value = profile.profile_summary || '';
    $('bi-builder_focus').value = profile.builder_focus || '';
    $('bi-project_types').value = arrayToInput(profile.project_types);
    $('bi-profile_target_suburbs').value = arrayToInput(profile.target_suburbs);
    $('bi-quality_signals').value = arrayToInput(profile.quality_signals);
    $('bi-risk_signals').value = arrayToInput(profile.risk_signals);
    $('bi-ideal_contact_angle').value = profile.ideal_contact_angle || '';
    $('bi-smart_home_fit').value = profile.smart_home_fit || 'unknown';
    $('bi-architectural_fit').value = profile.architectural_fit || 'unknown';
    $('bi-luxury_fit').value = profile.luxury_fit || 'unknown';
    $('bi-estimated_fit_score').value =
      profile.estimated_fit_score != null ? String(profile.estimated_fit_score) : '';
    $('bi-last_researched_at').textContent = fmtDate(profile.last_researched_at);
    if (meta) {
      meta.textContent =
        'Source: ' +
        labelize(profile.research_source || 'manual') +
        (profile.estimated_fit_score != null ? ' · Score: ' + profile.estimated_fit_score : '') +
        (profile.last_researched_at ? ' · Last: ' + fmtDate(profile.last_researched_at) : '');
    }
    renderSignalsDisplay(profile);
  }

  function renderSignalsDisplay(profile) {
    var el = $('bi-signals-display');
    if (!el) return;
    if (!profile) {
      el.innerHTML = '';
      return;
    }
    var q = profile.quality_signals || [];
    var r = profile.risk_signals || [];
    if (!q.length && !r.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      (q.length
        ? '<h4>Quality signals</h4><div class="bi-signal-list">' +
          q.map(function (s) {
            return '<span class="bi-signal-tag quality">' + esc(s) + '</span>';
          }).join('') +
          '</div>'
        : '') +
      (r.length
        ? '<h4>Risk signals</h4><div class="bi-signal-list">' +
          r.map(function (s) {
            return '<span class="bi-signal-tag risk">' + esc(s) + '</span>';
          }).join('') +
          '</div>'
        : '');
  }

  function profileFormPayload(extra) {
    var scoreRaw = $('bi-estimated_fit_score').value;
    var payload = {
      profile_summary: $('bi-profile_summary').value,
      builder_focus: $('bi-builder_focus').value,
      project_types: $('bi-project_types').value,
      target_suburbs: $('bi-profile_target_suburbs').value,
      quality_signals: $('bi-quality_signals').value,
      risk_signals: $('bi-risk_signals').value,
      ideal_contact_angle: $('bi-ideal_contact_angle').value,
      smart_home_fit: $('bi-smart_home_fit').value,
      architectural_fit: $('bi-architectural_fit').value,
      luxury_fit: $('bi-luxury_fit').value,
      estimated_fit_score: scoreRaw === '' ? null : Number(scoreRaw),
      research_source: 'manual',
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        payload[k] = extra[k];
      });
    }
    return payload;
  }

  function loadProfileAndRuns(id) {
    showProfileError('');
    return Promise.all([
      fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/profile').then(function (r) {
        return r.json();
      }),
      fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/research-runs').then(
        function (r) {
          return r.json();
        }
      ),
    ])
      .then(function (results) {
        var profileRes = results[0];
        var runsRes = results[1];
        if (!profileRes.ok) {
          fillProfileForm(null);
          showProfileError(
            profileRes.error ||
              'Could not load research profile — ensure migration 070 is applied.'
          );
        } else {
          fillProfileForm(profileRes.profile);
        }
        renderResearchRuns(runsRes.ok ? runsRes.runs : []);
        var statusEl = $('bi-research-status');
        if (statusEl) statusEl.style.display = 'none';
      })
      .catch(function (e) {
        fillProfileForm(null);
        showProfileError(e.message || 'Failed to load research profile.');
        renderResearchRuns([]);
      });
  }

  function saveProfile(e) {
    if (e) e.preventDefault();
    var id = $('bi-id').value;
    if (!id) return;

    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/profile', {
      method: 'PUT',
      headers: secretHeaders(),
      body: JSON.stringify(profileFormPayload()),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { body: j };
        });
      })
      .then(function (res) {
        if (!res.body.ok) throw new Error(res.body.error || 'Save profile failed');
        fillProfileForm(res.body.profile);
        if (res.body.prospect_research_status) {
          $('bi-research_status').value = res.body.prospect_research_status;
        }
        showMsg('Research profile saved.', false);
        return loadList();
      })
      .catch(function (e) {
        showMsg(e.message || 'Save profile failed — check API secret.', true);
      });
  }

  function markResearched() {
    var id = $('bi-id').value;
    if (!id) return;

    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id) + '/profile', {
      method: 'PUT',
      headers: secretHeaders(),
      body: JSON.stringify(profileFormPayload({ mark_researched: true })),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Failed');
        fillProfileForm(j.profile);
        $('bi-research_status').value = 'researched';
        showMsg('Marked as researched.', false);
        return loadList();
      })
      .catch(function (e) {
        showMsg(e.message, true);
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
      statusEl.textContent = 'Fetching website and analysing…';
      statusEl.className = 'bi-research-meta bi-research-loading';
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
        fillProfileForm(res.body.profile);
        if (res.body.prospect) {
          $('bi-research_status').value = res.body.prospect.research_status || 'researched';
          $('bi-fit_priority').value = res.body.prospect.fit_priority || $('bi-fit_priority').value;
        }
        if (statusEl) {
          statusEl.textContent =
            'Research complete — score ' +
            (res.body.analysis?.estimated_fit_score ?? '—') +
            '/100';
          statusEl.className = 'bi-research-meta';
        }
        showMsg('Website research completed.', false);
        return Promise.all([loadList(), loadProfileAndRuns(id)]);
      })
      .catch(function (e) {
        if (statusEl) {
          statusEl.textContent = e.message || 'Research failed';
          statusEl.className = 'bi-research-meta';
        }
        showMsg(e.message || 'Research failed — check website URL and API secret.', true);
        return loadProfileAndRuns(id);
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Website Research';
        }
      });
  }

  function renderOutreach(log) {
    var el = $('bi-outreach');
    if (!el) return;
    if (!log || !log.length) {
      el.innerHTML = '<p>No outreach logged yet.</p>';
      return;
    }
    el.innerHTML =
      '<h3 style="font-size:0.85rem;margin:0.75rem 0 0.35rem;">Outreach log</h3>' +
      log
        .map(function (o) {
          return (
            '<div class="bi-outreach-item">' +
            esc(fmtDate(o.sent_at)) +
            ' · ' +
            esc(o.channel) +
            ' · ' +
            esc(o.status) +
            (o.message_body ? '<br>' + esc(o.message_body.slice(0, 120)) : '') +
            '</div>'
          );
        })
        .join('');
  }

  function openDetail(id) {
    fetch('/api/builder-intel/prospects/' + encodeURIComponent(id))
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.ok || !j.prospect) throw new Error(j.error || 'Not found');
        openPanel(false);
        fillForm(j.prospect);
        renderOutreach(j.prospect.outreach_log);
        $('bi-new-note').value = '';
        return loadProfileAndRuns(id);
      })
      .catch(function (e) {
        showMsg(e.message, true);
      });
  }

  function saveForm(e) {
    e.preventDefault();
    var id = $('bi-id').value;
    var isNew = !id;
    var url = isNew ? '/api/builder-intel/prospects' : '/api/builder-intel/prospects/' + encodeURIComponent(id);
    var method = isNew ? 'POST' : 'PUT';

    fetch(url, {
      method: method,
      headers: secretHeaders(),
      body: JSON.stringify(formPayload()),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { status: r.status, body: j };
        });
      })
      .then(function (res) {
        if (!res.body.ok) throw new Error(res.body.error || 'Save failed');
        showMsg(isNew ? 'Builder prospect created.' : 'Saved.', false);
        if (isNew && res.body.prospect && res.body.prospect.id) {
          openDetail(res.body.prospect.id);
        } else {
          closePanel();
        }
        return loadList();
      })
      .catch(function (e) {
        showMsg(e.message || 'Save failed — check API secret for writes.', true);
      });
  }

  function addNote() {
    var id = $('bi-id').value;
    var note = ($('bi-new-note') && $('bi-new-note').value) || '';
    if (!id) return;
    if (!note.trim()) {
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

  function bindEvents() {
    $('bi-btn-refresh').addEventListener('click', function () {
      loadList();
      loadTargets();
    });
    $('bi-btn-recalc-targets').addEventListener('click', recalculateTargets);
    var bandFilter = $('bi-target-band');
    if (bandFilter) bandFilter.addEventListener('change', loadTargets);
    $('bi-btn-add').addEventListener('click', function () {
      openPanel(true);
    });
    $('bi-panel-close').addEventListener('click', closePanel);
    $('bi-form').addEventListener('submit', saveForm);
    $('bi-profile-form').addEventListener('submit', saveProfile);
    $('bi-btn-mark-researched').addEventListener('click', markResearched);
    $('bi-btn-run-research').addEventListener('click', runWebsiteResearch);
    $('bi-btn-add-note').addEventListener('click', addNote);
    $('bi-panel').addEventListener('click', function (e) {
      if (e.target === $('bi-panel')) closePanel();
    });

    ['bi-filter-stage', 'bi-filter-type', 'bi-filter-priority', 'bi-filter-research'].forEach(function (id) {
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
  }

  loadEnums()
    .then(function () {
      return Promise.all([loadList(), loadTargets()]);
    })
    .then(bindEvents)
    .catch(function (e) {
      showMsg(e.message || 'Failed to initialise', true);
    });
})();
