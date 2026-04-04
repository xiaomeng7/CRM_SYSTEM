/**
 * Lead attribution events — minimal fact writes; failures never block intake.
 */

/**
 * Infer coarse platform from UTM/source (best-effort; not a replacement for click IDs).
 */
function inferPlatformFromIntake({ utmSource, source }) {
  const s = `${utmSource || ''} ${source || ''}`.toLowerCase();
  if (!s.trim()) return null;
  if (/google|adwords|gclid/.test(s)) return 'google';
  if (/facebook|meta|instagram|fbclid/.test(s)) return 'meta';
  if (/organic|seo/.test(s)) return 'organic';
  if (/\bdirect\b|website/.test(s)) return 'direct';
  if (/referral|refer/.test(s)) return 'referral';
  return null;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} params
 */
async function recordLeadCreatedAttribution(db, params) {
  const {
    leadId,
    contactId,
    accountId,
    campaignId,
    creativeId,
    landingVariantId,
    clickId,
    gclid,
    landingPageUrl,
    referrerUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    sourceLabel,
    rawPayload,
  } = params;

  if (!leadId) return { skipped: true, reason: 'no_lead_id' };

  const platform = inferPlatformFromIntake({ utmSource, source: sourceLabel });
  const raw =
    rawPayload && typeof rawPayload === 'object' ? rawPayload : { snapshot: rawPayload };
  const rawJson = JSON.stringify({
    ...raw,
    recorded_by: 'public-lead-intake',
    recorded_at: new Date().toISOString(),
  });

  const dedupeKey = `lead_created:${leadId}`;
  const notes = gclid
    ? 'gclid captured from lead intake payload.'
    : 'No explicit gclid captured at intake; click_id kept as generic identifier.';

  try {
    const ins = await db.query(
      `INSERT INTO lead_attribution_events (
         event_type, source, platform,
         campaign_id, ad_group_id, ad_id, creative_id, landing_variant_id,
         click_id, gclid, session_id, landing_page_url, referrer_url,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         lead_id, contact_id, account_id,
         currency_code, notes, raw_payload_json, dedupe_key
       ) VALUES (
         'lead_created', $1, $2,
         $3, NULL, NULL, $4, $5,
         $6, $7, NULL, $8, $9,
         $10, $11, $12, $13, $14,
         $15, $16, $17,
         'AUD', $18, $19::jsonb, $20
       )
       RETURNING id`,
      [
        sourceLabel || null,
        platform,
        campaignId || null,
        creativeId || null,
        landingVariantId || null,
        clickId || null,
        gclid || null,
        landingPageUrl || null,
        referrerUrl || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null,
        utmTerm || null,
        utmContent || null,
        leadId,
        contactId || null,
        accountId || null,
        notes,
        rawJson,
        dedupeKey,
      ]
    );
    return { ok: true, id: ins.rows[0].id, dedupe_key: dedupeKey };
  } catch (e) {
    if (e.code === '23505') {
      return { ok: true, duplicate: true, dedupe_key: dedupeKey };
    }
    if (/lead_attribution_events/i.test(e.message || '') && /does not exist/i.test(e.message || '')) {
      console.warn('[lead-attribution] table missing; run migration 045:', e.message);
      return { ok: false, skipped: true, reason: 'table_missing' };
    }
    console.error('[lead-attribution] insert failed:', e.message || e);
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Fire-and-forget safe wrapper using pool (never throws to caller).
 */
function scheduleLeadCreatedAttribution(pool, params) {
  setImmediate(async () => {
    try {
      const client = await pool.connect();
      try {
        await recordLeadCreatedAttribution(client, params);
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('[lead-attribution] schedule failed:', e.message || e);
    }
  });
}

module.exports = {
  inferPlatformFromIntake,
  recordLeadCreatedAttribution,
  scheduleLeadCreatedAttribution,
};
