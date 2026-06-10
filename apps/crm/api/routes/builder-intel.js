/**
 * Builder Intelligence API (PR8A–PR8C) — builder prospects on b2b_prospects.
 *
 * GET    /api/builder-intel/prospects
 * POST   /api/builder-intel/prospects
 * GET    /api/builder-intel/prospects/:id
 * PUT    /api/builder-intel/prospects/:id
 * POST   /api/builder-intel/prospects/:id/notes
 * GET    /api/builder-intel/prospects/:id/profile
 * PUT    /api/builder-intel/prospects/:id/profile
 * GET    /api/builder-intel/prospects/:id/research-runs
 * POST   /api/builder-intel/prospects/:id/research-runs/manual
 * POST   /api/builder-intel/prospects/:id/research/run
 * GET    /api/builder-intel/targets
 * POST   /api/builder-intel/targets/recalculate
 */

const router = require('express').Router();
const {
  listBuilderProspects,
  getBuilderProspectById,
  createBuilderProspect,
  updateBuilderProspect,
  addBuilderProspectNote,
} = require('../../services/builder/builderProspectService');
const {
  getBuilderProfile,
  upsertBuilderProfile,
  listResearchRuns,
  createManualResearchRun,
} = require('../../services/builder/builderProfileService');
const {
  BUILDER_TYPES,
  PROJECT_FOCUS,
  FIT_PRIORITIES,
  RESEARCH_STATUSES,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_STRENGTHS,
  OPPORTUNITY_POTENTIALS,
  TIMING_STATUSES,
  BUILDER_STATUSES,
  DISCOVERY_CREATE_DEFAULTS,
  FOUNDER_OPPORTUNITY_POTENTIALS,
} = require('../../services/builder/builderProspectConstants');
const { relationshipLevelOptions } = require('../../services/builder/relationshipLevelMapping');
const { listProviders } = require('../../services/builder/discovery/providers/providerRegistry');
const { isSerpApiConfigured } = require('../../services/builder/discovery/providers/serpApiProvider');
const {
  generateRecommendedSearches,
  generateQuickSearches,
  getDiscoveryStrategyMeta,
  QUICK_SEARCH_CATEGORIES,
} = require('../../services/builder/discovery/discoveryStrategies');
const { FIT_LEVELS } = require('../../services/builder/builderProfileConstants');
const { getTopBuilderTargets } = require('../../services/builder/targetSelection/getTopBuilderTargets');
const { getStrategicPartners } = require('../../services/builder/targetSelection/getStrategicPartners');
const { getActivePartners } = require('../../services/builder/targetSelection/getActivePartners');
const {
  refreshBuilderTargetScores,
  refreshBuilderTargetScoreForProspect,
} = require('../../services/builder/targetSelection/refreshBuilderTargetScores');
const {
  FOUNDER_BUILDER_STATUSES,
  FOUNDER_RELATIONSHIP_STRENGTHS,
} = require('../../services/builder/builderRelationshipDerivation');

function requireAdminSecret(req, res) {
  const secret = process.env.ADMIN_SECRET || process.env.SYNC_SECRET;
  if (!secret) return true;
  const provided =
    req.headers['x-admin-secret'] ||
    req.headers['x-sync-secret'] ||
    req.body?.admin_secret ||
    req.body?.sync_secret;
  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function safeErrorMessage(err) {
  if (!err) return 'Request failed';
  const code = err.code;
  if (code === 'INVALID_INPUT') return err.message;
  if (code === 'NOT_FOUND') return 'Builder prospect not found';
  if (code === 'DISCOVERY_FAILED') return err.message;
  const msg = String(err.message || err);
  if (/relation .* does not exist/i.test(msg)) {
    return 'Database migration required (071_builder_target_scores or earlier)';
  }
  if (code === 'FETCH_FAILED' || code === 'FETCH_TIMEOUT' || code === 'ANALYSIS_FAILED' || code === 'RESEARCH_FAILED') {
    return err.message;
  }
  if (/password|connection|ECONNREFUSED/i.test(msg)) {
    return 'Database unavailable';
  }
  return 'Request failed';
}

function statusFromError(err) {
  if (err.code === 'INVALID_INPUT') return 400;
  if (err.code === 'NOT_FOUND') return 404;
  if (err.code === 'DISCOVERY_FAILED') return 400;
  return 500;
}

router.get('/prospects/enums', (_req, res) => {
  res.json({
    ok: true,
    builder_types: BUILDER_TYPES,
    project_focus: PROJECT_FOCUS,
    fit_priorities: FIT_PRIORITIES,
    research_statuses: RESEARCH_STATUSES,
    relationship_stages: RELATIONSHIP_STAGES,
    relationship_strengths: RELATIONSHIP_STRENGTHS,
    opportunity_potentials: OPPORTUNITY_POTENTIALS,
    timing_statuses: TIMING_STATUSES,
    builder_statuses: BUILDER_STATUSES,
    founder_builder_statuses: FOUNDER_BUILDER_STATUSES,
    founder_relationship_strengths: FOUNDER_RELATIONSHIP_STRENGTHS,
    relationship_levels: relationshipLevelOptions(),
    founder_opportunity_potentials: FOUNDER_OPPORTUNITY_POTENTIALS,
    discovery_sources: [
      { value: 'google_search', label: 'Google Search' },
      { value: 'google_maps', label: 'Google Maps' },
      { value: 'referral', label: 'Referral' },
      { value: 'network', label: 'Network' },
      { value: 'website', label: 'Website' },
      { value: 'manual', label: 'Manual' },
      { value: 'discovery', label: 'Discovery Import' },
    ],
    discovery_run_sources: listProviders()
      .filter((p) => p.value === 'manual_seed' || p.value === 'serpapi')
      .map((p) => ({
        value: p.value,
        label: p.enabled ? p.label : `${p.label} (not configured)`,
        enabled: p.enabled,
      })),
    discovery_providers: listProviders(),
    serpapi_configured: isSerpApiConfigured(),
    fit_levels: FIT_LEVELS,
  });
});

router.get('/strategic-partners', async (req, res) => {
  try {
    const result = await getStrategicPartners({ limit: req.query.limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET strategic-partners]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/active-partners', async (req, res) => {
  try {
    const result = await getActivePartners({ limit: req.query.limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET active-partners]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

/** @deprecated use /strategic-partners */
router.get('/strategic-builders', async (req, res) => {
  try {
    const result = await getStrategicPartners({ limit: req.query.limit });
    res.json({ ok: true, partners: result.partners, builders: result.partners, count: result.count });
  } catch (err) {
    console.error('[builder-intel GET strategic-builders]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/targets', async (req, res) => {
  try {
    const result = await getTopBuilderTargets({
      limit: req.query.limit,
      band: req.query.band,
      suburb: req.query.suburb,
      builder_type: req.query.builder_type,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET targets]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/targets/recalculate', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const stats = await refreshBuilderTargetScores({ log: () => {} });
    const result = await getTopBuilderTargets({ limit: req.query.limit || 20 });
    res.json({ ok: true, stats, ...result });
  } catch (err) {
    console.error('[builder-intel POST targets/recalculate]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/prospects', async (req, res) => {
  try {
    const result = await listBuilderProspects({
      relationship_stage: req.query.relationship_stage,
      builder_type: req.query.builder_type,
      fit_priority: req.query.fit_priority,
      research_status: req.query.research_status,
      search: req.query.search || req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET prospects]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/prospects/:id/profile', async (req, res) => {
  try {
    const profile = await getBuilderProfile(req.params.id);
    res.json({ ok: true, profile });
  } catch (err) {
    console.error('[builder-intel GET profile]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.put('/prospects/:id/profile', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const result = await upsertBuilderProfile(req.params.id, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel PUT profile]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/prospects/:id/research-runs', async (req, res) => {
  try {
    const runs = await listResearchRuns(req.params.id, { limit: req.query.limit });
    res.json({ ok: true, runs });
  } catch (err) {
    console.error('[builder-intel GET research-runs]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/prospects/:id/research-runs/manual', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const run = await createManualResearchRun(req.params.id, req.body || {});
    res.status(201).json({ ok: true, run });
  } catch (err) {
    console.error('[builder-intel POST manual research run]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/prospects/:id/research/run', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const { runBuilderResearch } = require('../../services/builder/runBuilderResearch');
    const force = Boolean(req.body?.force);
    const result = await runBuilderResearch(req.params.id, { force });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel POST research run]', err);
    if (err.run) {
      return res.status(500).json({
        ok: false,
        error: safeErrorMessage(err),
        run: err.run,
      });
    }
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/prospects/:id', async (req, res) => {
  try {
    const prospect = await getBuilderProspectById(req.params.id);
    if (!prospect) {
      return res.status(404).json({ ok: false, error: 'Builder prospect not found' });
    }
    res.json({ ok: true, prospect });
  } catch (err) {
    console.error('[builder-intel GET prospect]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/prospects', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const body = req.body || {};
    const website = body.website != null ? String(body.website).trim() : '';
    if (!website) {
      return res.status(400).json({ ok: false, error: 'website required' });
    }

    const autoResearch =
      body.auto_research !== false &&
      req.query.auto_research !== 'false' &&
      req.query.research !== 'false';

    const prospect = await createBuilderProspect({
      company_name: body.company_name,
      website,
      source: body.source || 'manual',
      research_status: autoResearch ? 'researching' : DISCOVERY_CREATE_DEFAULTS.research_status,
      relationship_stage: DISCOVERY_CREATE_DEFAULTS.relationship_stage,
      builder_status: DISCOVERY_CREATE_DEFAULTS.builder_status,
      relationship_strength: DISCOVERY_CREATE_DEFAULTS.relationship_strength,
      opportunity_potential: DISCOVERY_CREATE_DEFAULTS.opportunity_potential,
      timing_status: DISCOVERY_CREATE_DEFAULTS.timing_status,
    });

    let research = null;
    let research_error = null;
    let target_scores = null;

    if (autoResearch) {
      try {
        const { runBuilderResearch } = require('../../services/builder/runBuilderResearch');
        research = await runBuilderResearch(prospect.id);
        target_scores = await refreshBuilderTargetScoreForProspect(prospect.id);
      } catch (researchErr) {
        console.error('[builder-intel POST prospect] auto-research failed:', researchErr);
        research_error = safeErrorMessage(researchErr);
      }
    }

    const full = await getBuilderProspectById(prospect.id);
    res.status(201).json({
      ok: true,
      prospect: full || prospect,
      research,
      research_error,
      target_scores: target_scores || full?.target_scores || null,
    });
  } catch (err) {
    console.error('[builder-intel POST prospect]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.put('/prospects/:id', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const prospect = await updateBuilderProspect(req.params.id, req.body || {});
    let target_scores = null;
    try {
      target_scores = await refreshBuilderTargetScoreForProspect(prospect.id);
    } catch (refreshErr) {
      console.warn('[builder-intel PUT prospect] score refresh skipped:', refreshErr.message);
    }
    const full = await getBuilderProspectById(prospect.id);
    res.json({
      ok: true,
      prospect: full || prospect,
      target_scores: target_scores || full?.target_scores || null,
    });
  } catch (err) {
    console.error('[builder-intel PUT prospect]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/prospects/:id/notes', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const note = req.body?.note ?? req.body?.text ?? req.body?.notes;
    const prospect = await addBuilderProspectNote(req.params.id, note);
    res.json({ ok: true, prospect });
  } catch (err) {
    console.error('[builder-intel POST note]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

// --- Builder Discovery (PR9A) ---

const {
  createDiscoveryRun,
  listDiscoveryRuns,
  getDiscoveryRunById,
  getDiscoveryDashboard,
  importDiscoveryCandidate,
  importSelectedCandidates,
  dismissDiscoveryCandidate,
  dismissSelectedCandidates,
} = require('../../services/builder/discovery/builderDiscoveryService');
const { isWebDiscoveryEnabled } = require('../../services/builder/discovery/searchEngineDiscovery');

router.get('/discovery/dashboard', async (_req, res) => {
  try {
    const dashboard = await getDiscoveryDashboard();
    res.json({ ok: true, dashboard });
  } catch (err) {
    console.error('[builder-intel GET discovery/dashboard]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/discovery/quick-searches', async (_req, res) => {
  try {
    const providers = listProviders();
    const providerMap = Object.fromEntries(providers.map((p) => [p.value, p.enabled]));
    const quick = generateQuickSearches().map((s) => ({
      ...s,
      provider_enabled: Boolean(providerMap[s.recommended_provider]),
    }));
    const categories = QUICK_SEARCH_CATEGORIES.map((cat) => ({
      ...cat,
      searches: quick.filter((s) => s.category_id === cat.id),
    }));
    res.json({
      ok: true,
      categories,
      suburbs: categories[0]?.searches?.map((s) => s.suburb) || [],
      count: quick.length,
      serpapi_configured: isSerpApiConfigured(),
    });
  } catch (err) {
    console.error('[builder-intel GET discovery/quick-searches]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/discovery/strategies', async (_req, res) => {
  try {
    const providers = listProviders();
    const providerMap = Object.fromEntries(providers.map((p) => [p.value, p.enabled]));
    const searches = generateRecommendedSearches().map((s) => ({
      ...s,
      provider_enabled: Boolean(providerMap[s.recommended_provider]),
    }));
    res.json({
      ok: true,
      strategy: getDiscoveryStrategyMeta(),
      searches,
      count: searches.length,
    });
  } catch (err) {
    console.error('[builder-intel GET discovery/strategies]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/discovery/runs', async (req, res) => {
  try {
    const result = await listDiscoveryRuns({ limit: req.query.limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET discovery/runs]', err);
    res.status(500).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.get('/discovery/runs/:id', async (req, res) => {
  try {
    const result = await getDiscoveryRunById(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel GET discovery/runs/:id]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/discovery/run', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const body = req.body || {};
    const result = await createDiscoveryRun({
      query: body.query,
      location: body.location,
      source: body.source || 'manual_seed',
      seed_candidates: body.seed_candidates || [],
    });
    res.status(201).json({ ok: true, ...result, web_discovery_enabled: isWebDiscoveryEnabled() });
  } catch (err) {
    console.error('[builder-intel POST discovery/run]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/discovery/candidates/:id/import', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const result = await importDiscoveryCandidate(req.params.id);
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel POST discovery/candidates/:id/import]', err);
    const status =
      err.code === 'DUPLICATE' || err.code === 'ALREADY_IMPORTED' || err.code === 'DISMISSED'
        ? 409
        : statusFromError(err);
    res.status(status).json({
      ok: false,
      error: safeErrorMessage(err),
      code: err.code,
      matched_prospect_id: err.matched_prospect_id || null,
    });
  }
});

router.post('/discovery/candidates/import-selected', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const ids = req.body?.candidate_ids || [];
    const result = await importSelectedCandidates(ids);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel POST discovery/candidates/import-selected]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/discovery/candidates/:id/dismiss', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const candidate = await dismissDiscoveryCandidate(req.params.id);
    res.json({ ok: true, candidate });
  } catch (err) {
    console.error('[builder-intel POST discovery/candidates/:id/dismiss]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

router.post('/discovery/candidates/dismiss-selected', async (req, res) => {
  if (!requireAdminSecret(req, res)) return;
  try {
    const ids = req.body?.candidate_ids || [];
    const result = await dismissSelectedCandidates(ids);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[builder-intel POST discovery/candidates/dismiss-selected]', err);
    res.status(statusFromError(err)).json({ ok: false, error: safeErrorMessage(err) });
  }
});

module.exports = router;
