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
} = require('../../services/builder/builderProspectConstants');
const { FIT_LEVELS } = require('../../services/builder/builderProfileConstants');
const { getTopBuilderTargets } = require('../../services/builder/targetSelection/getTopBuilderTargets');
const { getStrategicPartners } = require('../../services/builder/targetSelection/getStrategicPartners');
const { getActivePartners } = require('../../services/builder/targetSelection/getActivePartners');
const {
  refreshBuilderTargetScores,
  refreshBuilderTargetScoreForProspect,
} = require('../../services/builder/targetSelection/refreshBuilderTargetScores');

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
    const prospect = await createBuilderProspect(req.body || {});
    res.status(201).json({ ok: true, prospect });
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

module.exports = router;
