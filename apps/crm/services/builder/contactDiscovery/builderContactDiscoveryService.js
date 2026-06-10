/**
 * Builder contact discovery service (PR10B).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('../builderProspectConstants');
const { fetchBuilderWebsite } = require('../research/fetchBuilderWebsite');
const { listResearchRuns } = require('../builderProfileService');
const { transitionPipelineStage } = require('../builderPipelineService');
const { decorateProspectPipelineFields } = require('../builderProspectService');
const {
  extractFromHtml,
  extractFromSnippets,
  rankContactCandidates,
  pickRecommendedContact,
} = require('./extractContactCandidates');
const { searchPublicContacts } = require('./serpApiContactSearch');

const MAX_BATCH = 25;

async function getBuilderProspectForContactDiscovery(prospectId, db) {
  const r = await db.query(
    `SELECT * FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  const prospect = r.rows[0];
  if (!prospect) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return prospect;
}

async function insertDiscoveryRun(prospectId, db) {
  const r = await db.query(
    `INSERT INTO builder_contact_discovery_runs (prospect_id, status, started_at)
     VALUES ($1, 'running', now())
     RETURNING *`,
    [prospectId]
  );
  return r.rows[0];
}

async function finishDiscoveryRun(runId, fields, db) {
  const r = await db.query(
    `UPDATE builder_contact_discovery_runs
     SET status = $2,
         sources_checked = $3::jsonb,
         candidates_found = $4,
         error_message = $5,
         finished_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      runId,
      fields.status,
      JSON.stringify(fields.sources_checked || []),
      fields.candidates_found || 0,
      fields.error_message || null,
    ]
  );
  return r.rows[0];
}

async function clearProspectContacts(prospectId, db) {
  await db.query(`DELETE FROM builder_contacts WHERE prospect_id = $1 AND founder_confirmed = false`, [
    prospectId,
  ]);
}

async function insertContactCandidates(prospectId, discoveryRunId, candidates, db) {
  const ranked = rankContactCandidates(candidates);
  const recommended = pickRecommendedContact(ranked);
  const rows = [];

  for (const candidate of ranked) {
    const r = await db.query(
      `INSERT INTO builder_contacts (
         prospect_id, discovery_run_id, name, role, email, phone, linkedin_url,
         confidence_score, confidence_band, source_type, source_url, reason,
         is_recommended, founder_confirmed
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false
       ) RETURNING *`,
      [
        prospectId,
        discoveryRunId,
        candidate.name,
        candidate.role,
        candidate.email,
        candidate.phone,
        candidate.linkedin_url,
        candidate.confidence_score,
        candidate.confidence_band,
        candidate.source_type,
        candidate.source_url,
        candidate.reason,
        recommended && candidateKey(candidate) === candidateKey(recommended),
      ]
    );
    rows.push(r.rows[0]);
  }

  return rows;
}

function candidateKey(c) {
  return [c.email, c.phone, c.name, c.role].map((v) => String(v || '').toLowerCase()).join('|');
}

async function collectWebsiteCandidates(prospect, options = {}) {
  const sources = [];
  const candidates = [];

  if (prospect.website) {
    try {
      const fetched = await (options.fetchBuilderWebsite || fetchBuilderWebsite)(prospect.website, options);
      for (const page of fetched.pages || []) {
        sources.push({ type: 'website', url: page.url });
        candidates.push(...extractFromHtml(page.html, page.url, 'website'));
      }
    } catch (err) {
      sources.push({ type: 'website', url: prospect.website, error: err.message });
    }
  }

  const runs = await listResearchRuns(prospect.id, { limit: 1, db: options.db });
  const latest = runs[0];
  const snippets = latest?.payload?.snippets;
  if (snippets?.length) {
    sources.push({ type: 'research_snippet', run_id: latest.id, count: snippets.length });
    candidates.push(...extractFromSnippets(snippets));
  }

  return { sources, candidates };
}

async function runContactDiscovery(prospectId, options = {}) {
  const db = options.db || pool;
  const prospect = await getBuilderProspectForContactDiscovery(prospectId, db);
  const run = await insertDiscoveryRun(prospect.id, db);
  const sources = [];

  try {
    const websiteResult = await collectWebsiteCandidates(prospect, { ...options, db });
    sources.push(...websiteResult.sources);

    let candidates = [...websiteResult.candidates];

    const serpCandidates = await searchPublicContacts(
      {
        companyName: prospect.company_name,
        website: prospect.website,
        suburb: prospect.suburb,
      },
      options
    );
    if (serpCandidates.length) {
      sources.push({ type: 'serpapi', count: serpCandidates.length });
      candidates.push(...serpCandidates);
    }

    candidates = rankContactCandidates(candidates);
    await clearProspectContacts(prospect.id, db);
    const contacts = await insertContactCandidates(prospect.id, run.id, candidates, db);
    const recommended = contacts.find((c) => c.is_recommended) || null;

    const completedRun = await finishDiscoveryRun(
      run.id,
      {
        status: 'completed',
        sources_checked: sources,
        candidates_found: contacts.length,
      },
      db
    );

    return {
      ok: true,
      prospect_id: prospect.id,
      run: completedRun,
      contacts,
      recommended_contact: recommended,
      sources_checked: sources,
    };
  } catch (err) {
    await finishDiscoveryRun(
      run.id,
      {
        status: 'failed',
        sources_checked: sources,
        candidates_found: 0,
        error_message: err.message,
      },
      db
    );
    throw err;
  }
}

async function listBuilderContacts(prospectId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT * FROM builder_contacts
     WHERE prospect_id = $1
     ORDER BY is_recommended DESC, confidence_score DESC, created_at DESC`,
    [prospectId]
  );
  return r.rows;
}

async function getRecommendedContact(prospectId, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT * FROM builder_contacts
     WHERE prospect_id = $1
     ORDER BY founder_confirmed DESC, is_recommended DESC, confidence_score DESC, created_at DESC
     LIMIT 1`,
    [prospectId]
  );
  return r.rows[0] || null;
}

async function confirmBuilderContact(prospectId, contactId, options = {}) {
  const db = options.db || pool;
  const prospect = await getBuilderProspectForContactDiscovery(prospectId, db);

  const contactRes = await db.query(
    `SELECT * FROM builder_contacts WHERE id = $1 AND prospect_id = $2`,
    [contactId, prospectId]
  );
  const contact = contactRes.rows[0];
  if (!contact) {
    const err = new Error('Builder contact not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await db.query(
    `UPDATE builder_contacts
     SET founder_confirmed = false, is_recommended = false, updated_at = now()
     WHERE prospect_id = $1`,
    [prospectId]
  );

  await db.query(
    `UPDATE builder_contacts
     SET founder_confirmed = true, is_recommended = true, confirmed_at = now(), updated_at = now()
     WHERE id = $1`,
    [contactId]
  );

  const contactName = contact.name || prospect.contact_name;
  await db.query(
    `UPDATE b2b_prospects
     SET contact_name = $2,
         decision_maker_name = $3,
         decision_maker_role = COALESCE($4, decision_maker_role),
         email = COALESCE($5, email),
         phone = COALESCE($6, phone),
         updated_at = now()
     WHERE id = $1 AND prospect_type = $7`,
    [
      prospectId,
      contactName,
      contact.name || contactName,
      contact.role,
      contact.email,
      contact.phone,
      PROSPECT_TYPE_BUILDER,
    ]
  );

  const transition = await transitionPipelineStage(
    prospectId,
    {
      to_stage: 'contact_ready',
      note: `Founder confirmed contact${contact.name ? `: ${contact.name}` : ''}${contact.role ? ` (${contact.role})` : ''}`,
    },
    { db }
  );

  return {
    contact: { ...contact, founder_confirmed: true, is_recommended: true },
    prospect: transition.prospect,
    pipeline: transition,
  };
}

async function batchContactDiscovery(options = {}) {
  const db = options.db || pool;
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 10, 1), MAX_BATCH);
  const r = await db.query(
    `SELECT id, company_name
     FROM b2b_prospects
     WHERE prospect_type = $1
       AND COALESCE(pipeline_stage, 'target') = 'contact_discovery'
     ORDER BY updated_at DESC
     LIMIT $2`,
    [PROSPECT_TYPE_BUILDER, limit]
  );

  const results = [];
  const errors = [];

  for (const row of r.rows) {
    try {
      const result = await runContactDiscovery(row.id, { ...options, db });
      results.push({
        prospect_id: row.id,
        company_name: row.company_name,
        ok: true,
        candidates_found: result.contacts.length,
        recommended_contact: result.recommended_contact,
      });
    } catch (err) {
      errors.push({
        prospect_id: row.id,
        company_name: row.company_name,
        ok: false,
        error: err.message,
      });
    }
  }

  return {
    processed: results.length + errors.length,
    results,
    errors,
  };
}

async function attachRecommendedContacts(builders, options = {}) {
  const db = options.db || pool;
  if (!builders.length) return builders;

  const ids = builders.map((b) => b.id);
  const r = await db.query(
    `SELECT DISTINCT ON (prospect_id)
       prospect_id, id, name, role, email, phone, linkedin_url,
       confidence_score, confidence_band, source_type, source_url, reason,
       is_recommended, founder_confirmed
     FROM builder_contacts
     WHERE prospect_id = ANY($1::uuid[])
     ORDER BY prospect_id, founder_confirmed DESC, is_recommended DESC, confidence_score DESC, created_at DESC`,
    [ids]
  );

  const byProspect = new Map(r.rows.map((row) => [row.prospect_id, row]));
  return builders.map((builder) => ({
    ...builder,
    recommended_contact: byProspect.get(builder.id) || null,
  }));
}

module.exports = {
  runContactDiscovery,
  batchContactDiscovery,
  listBuilderContacts,
  getRecommendedContact,
  confirmBuilderContact,
  attachRecommendedContacts,
};
