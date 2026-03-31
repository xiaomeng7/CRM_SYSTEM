/**
 * Google Ads Publisher — consumes ad_execution_queue rows with status=ready,
 * creates Responsive Search Ads via REST mutate (no OpenClaw, no queue schema changes).
 */

const { pool } = require('../lib/db');
const {
  completePublishTask,
  mergeExecutionNotes,
} = require('./adExecutionEngine');
const {
  assertGoogleAdsEnv,
  getAdsAccessToken,
  apiVersion,
} = require('./googleAdsSync');

function isDryRun() {
  const v = process.env.GOOGLE_ADS_PUBLISH_DRY_RUN;
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

function normalizeChannel(ch) {
  return String(ch || '').trim().toLowerCase();
}

/**
 * @param {object} row ad_execution_queue row
 * @param {object} payload row.payload
 * @returns {string|null}
 */
function resolveAdGroupResourceName(row, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const execHint = p.execution && typeof p.execution === 'object' ? p.execution : {};
  const explicit =
    (execHint.googleAdsAdGroup && String(execHint.googleAdsAdGroup).trim()) ||
    (p.google_ads_ad_group && String(p.google_ads_ad_group).trim());
  if (explicit) return explicit;

  const fromEnv = (process.env.GOOGLE_ADS_PUBLISH_AD_GROUP_RESOURCE || '').trim();
  if (fromEnv) return fromEnv;

  const mapRaw = (process.env.GOOGLE_ADS_PUBLISH_CAMPAIGN_MAP || '').trim();
  if (mapRaw && row.campaign_id) {
    try {
      const m = JSON.parse(mapRaw);
      const key = String(row.campaign_id);
      if (m && m[key]) return String(m[key]).trim();
    } catch (e) {
      console.warn('[publisher] GOOGLE_ADS_PUBLISH_CAMPAIGN_MAP JSON parse failed:', e.message);
    }
  }

  const agId = (process.env.GOOGLE_ADS_PUBLISH_AD_GROUP_ID || '').replace(/\s/g, '');
  const cid = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  if (agId && /^\d+$/.test(agId) && /^\d{10}$/.test(cid)) {
    return `customers/${cid}/adGroups/${agId}`;
  }

  return null;
}

/**
 * @param {object} payload
 * @returns {string|null}
 */
function resolveFinalUrl(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (p.final_url && String(p.final_url).trim()) return String(p.final_url).trim();
  const lp = p.landing_page && typeof p.landing_page === 'object' ? p.landing_page : {};
  if (lp.final_url && String(lp.final_url).trim()) return String(lp.final_url).trim();
  const def = (process.env.GOOGLE_ADS_PUBLISH_DEFAULT_FINAL_URL || '').trim();
  if (def) return def;
  return null;
}

/**
 * RSA needs ≥3 headlines and ≥2 descriptions (Google Ads constraints).
 * @param {{ headline: string, description: string, cta: string|null }} parts
 */
function buildResponsiveSearchAssets(parts) {
  const headline = String(parts.headline || '').trim();
  const description = String(parts.description || '').trim();
  const cta = parts.cta != null ? String(parts.cta).trim() : '';

  const headlines = [];
  const pushH = (t) => {
    const x = String(t || '').trim().slice(0, 30);
    if (x && !headlines.some((h) => h.text === x)) headlines.push({ text: x });
  };

  pushH(headline);
  pushH(cta);
  const words = headline.split(/\s+/).filter(Boolean);
  if (words.length > 2) {
    pushH(words.slice(0, 3).join(' '));
  }
  pushH(headline.slice(0, 15) + (headline.length > 15 ? '…' : ''));
  while (headlines.length < 3) {
    pushH(headline || cta || 'Learn more');
  }

  const descriptions = [];
  const pushD = (t) => {
    const x = String(t || '').trim().slice(0, 90);
    if (x && !descriptions.some((d) => d.text === x)) descriptions.push({ text: x });
  };

  pushD(description);
  if (description.length > 40) {
    pushD(description.slice(0, 80));
  }
  pushD(cta || description || headline);
  while (descriptions.length < 2) {
    pushD(description || headline || 'Contact us for a free quote.');
  }

  return {
    headlines: headlines.slice(0, 15),
    descriptions: descriptions.slice(0, 4),
  };
}

/**
 * @param {object} row
 * @param {object} payload
 * @returns {{ ok: true, adGroup: string, finalUrl: string, headlines: object[], descriptions: object[] } | { ok: false, error: string }}
 */
function extractPublishPlan(row, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const ad = p.ad && typeof p.ad === 'object' ? p.ad : {};
  const camp = p.campaign && typeof p.campaign === 'object' ? p.campaign : {};
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};

  const hasCampaign =
    row.campaign_id ||
    (row.campaign_key && String(row.campaign_key).trim()) ||
    camp.id ||
    meta.campaign_id ||
    (meta.campaign_key && String(meta.campaign_key).trim());

  if (!hasCampaign) {
    return { ok: false, error: 'missing campaign_id or campaign_key (row or payload)' };
  }

  const headline = ad.headline != null ? String(ad.headline).trim() : '';
  const description = ad.description != null ? String(ad.description).trim() : '';
  if (!headline) {
    return { ok: false, error: 'payload.ad.headline is required' };
  }
  if (!description) {
    return { ok: false, error: 'payload.ad.description is required' };
  }

  const finalUrl = resolveFinalUrl(p);
  if (!finalUrl) {
    return {
      ok: false,
      error: 'final_url required: set payload.final_url, payload.landing_page.final_url, or GOOGLE_ADS_PUBLISH_DEFAULT_FINAL_URL',
    };
  }

  const adGroup = resolveAdGroupResourceName(row, p);
  if (!adGroup) {
    return {
      ok: false,
      error:
        'Google Ads ad group not configured: set GOOGLE_ADS_PUBLISH_AD_GROUP_RESOURCE, GOOGLE_ADS_PUBLISH_AD_GROUP_ID, GOOGLE_ADS_PUBLISH_CAMPAIGN_MAP, or payload.execution.googleAdsAdGroup',
    };
  }

  const { headlines, descriptions } = buildResponsiveSearchAssets({
    headline,
    description,
    cta: ad.cta != null ? ad.cta : null,
  });

  return { ok: true, adGroup, finalUrl, headlines, descriptions };
}

function publishAdStatus() {
  const s = String(process.env.GOOGLE_ADS_PUBLISH_AD_STATUS || 'PAUSED').trim().toUpperCase();
  if (s === 'ENABLED' || s === 'PAUSED') return s;
  return 'PAUSED';
}

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function callGoogleAdsMutate(opts) {
  const {
    customerId,
    developerToken,
    loginCustomerId,
    accessToken,
    mutateOperations,
  } = opts;

  const ver = apiVersion();
  const url = `https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:mutate`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId && /^\d{10}$/.test(loginCustomerId)) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const body = {
    mutateOperations,
    partialFailure: false,
    validateOnly: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (!res.ok) {
    const msg = json && json.error ? JSON.stringify(json.error) : text.slice(0, 1200);
    throw new Error(`Google Ads mutate HTTP ${res.status}: ${msg}`);
  }

  if (json && json.partialFailureError) {
    throw new Error(`Google Ads partial failure: ${JSON.stringify(json.partialFailureError)}`);
  }

  return json || {};
}

/**
 * Process up to `limit` rows from ad_execution_queue (status=ready), FIFO.
 * Non-Google channels are marked failed with a clear note (so they leave the ready queue).
 *
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ processed: number, success: number, failed: number }>}
 */
async function publishNextReadyAd(opts = {}) {
  const limit = Math.min(Math.max(parseInt(String(opts.limit ?? 1), 10) || 1, 1), 50);
  const summary = { processed: 0, success: 0, failed: 0 };

  const r = await pool.query(
    `SELECT *
     FROM ad_execution_queue
     WHERE status = 'ready'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  const rows = r.rows || [];
  const dry = isDryRun();

  let accessToken = null;
  let developerToken = null;
  let customerId = null;
  let loginCustomerId = null;

  if (!dry && rows.length > 0) {
    try {
      assertGoogleAdsEnv();
    } catch (e) {
      for (const row of rows) {
        summary.processed += 1;
        summary.failed += 1;
        console.warn(`[publisher] failed id=${row.id}`, e.message);
        try {
          await completePublishTask(pool, {
            id: row.id,
            status: 'failed',
            execution_notes: mergeExecutionNotes(
              row.execution_notes,
              `[publisher] ${e.message}`
            ),
          });
        } catch (err2) {
          console.warn('[publisher] completePublishTask error:', err2.message);
        }
      }
      return summary;
    }
  }

  if (!dry && rows.length > 0) {
    developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
    loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');
    accessToken = await getAdsAccessToken();
  }

  for (const row of rows) {
    summary.processed += 1;
    const id = row.id;
    const payload = row.payload;

    if (normalizeChannel(row.channel) !== 'google') {
      const msg = `Publisher only supports channel=google (got ${row.channel || 'empty'})`;
      console.warn(`[publisher] failed id=${id}`, msg);
      summary.failed += 1;
      try {
        await completePublishTask(pool, {
          id,
          status: 'failed',
          execution_notes: mergeExecutionNotes(row.execution_notes, `[publisher] ${msg}`),
        });
      } catch (e) {
        console.warn('[publisher] completePublishTask error:', e.message);
      }
      continue;
    }

    const plan = extractPublishPlan(row, payload);
    if (!plan.ok) {
      console.warn(`[publisher] failed id=${id}`, plan.error);
      summary.failed += 1;
      try {
        await completePublishTask(pool, {
          id,
          status: 'failed',
          execution_notes: mergeExecutionNotes(row.execution_notes, `[publisher] ${plan.error}`),
        });
      } catch (e) {
        console.warn('[publisher] completePublishTask error:', e.message);
      }
      continue;
    }

    console.log(`[publisher] publishing id=${id} adGroup=${plan.adGroup} finalUrl=${plan.finalUrl}`);

    if (dry) {
      console.log(
        '[publisher] dry-run payload:',
        JSON.stringify({
          adGroup: plan.adGroup,
          finalUrl: plan.finalUrl,
          headlines: plan.headlines,
          descriptions: plan.descriptions,
        })
      );
      summary.success += 1;
      try {
        await completePublishTask(pool, {
          id,
          status: 'executed',
          execution_notes: mergeExecutionNotes(
            row.execution_notes,
            'Dry run (GOOGLE_ADS_PUBLISH_DRY_RUN): no Google Ads API call; would publish RSA to ' +
              plan.adGroup
          ),
        });
        console.log(`[publisher] success id=${id} (dry run)`);
      } catch (e) {
        console.warn('[publisher] completePublishTask error:', e.message);
        summary.success -= 1;
        summary.failed += 1;
      }
      continue;
    }

    const mutateOperations = [
      {
        adGroupAdOperation: {
          create: {
            adGroup: plan.adGroup,
            status: publishAdStatus(),
            ad: {
              finalUrls: [plan.finalUrl],
              responsiveSearchAd: {
                headlines: plan.headlines,
                descriptions: plan.descriptions,
              },
            },
          },
        },
      },
    ];

    try {
      await callGoogleAdsMutate({
        customerId,
        developerToken,
        loginCustomerId: loginCustomerId && /^\d{10}$/.test(loginCustomerId) ? loginCustomerId : '',
        accessToken,
        mutateOperations,
      });
      summary.success += 1;
      await completePublishTask(pool, {
        id,
        status: 'executed',
        execution_notes: mergeExecutionNotes(
          row.execution_notes,
          'Published via Google Ads API (Responsive Search Ad)'
        ),
      });
      console.log(`[publisher] success id=${id}`);
    } catch (err) {
      summary.failed += 1;
      const em = err && err.message ? err.message : String(err);
      console.warn(`[publisher] failed id=${id}`, em);
      try {
        await completePublishTask(pool, {
          id,
          status: 'failed',
          execution_notes: mergeExecutionNotes(row.execution_notes, `[publisher] ${em}`),
        });
      } catch (e2) {
        console.warn('[publisher] completePublishTask error:', e2.message);
      }
    }
  }

  return summary;
}

module.exports = {
  publishNextReadyAd,
  resolveAdGroupResourceName,
  resolveFinalUrl,
  extractPublishPlan,
  isDryRun,
};
