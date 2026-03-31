/**
 * Ad Generation Engine v1 — generate + list variants (no publish).
 *
 * POST /api/ad-generation/generate
 * GET  /api/ad-generation/variants?channel=&product_focus=&status=&campaign_id=&limit=
 */

const router = require('express').Router();
const { generateAndPersist, listVariants } = require('../../services/adGenerationEngine');

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

router.post('/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const channel = String(body.channel || '').toLowerCase();
    if (channel !== 'google' && channel !== 'meta') {
      return res.status(400).json({ ok: false, error: 'channel must be "google" or "meta"' });
    }

    if (body.campaign_id != null && String(body.campaign_id).trim() && !isUuid(body.campaign_id)) {
      return res.status(400).json({ ok: false, error: 'campaign_id must be a valid UUID' });
    }

    const input = {
      channel,
      product_focus: body.product_focus != null ? String(body.product_focus).trim() || null : null,
      audience_segment: body.audience_segment != null ? String(body.audience_segment).trim() || null : null,
      campaign_id: body.campaign_id != null && String(body.campaign_id).trim() ? String(body.campaign_id).trim() : null,
      campaign_key: body.campaign_key != null ? String(body.campaign_key).trim() || null : null,
      page_key: body.page_key != null ? String(body.page_key).trim().slice(0, 100) || null : null,
    };

    const { ad_variants, landing_page_variants } = await generateAndPersist(input);
    res.json({ ok: true, ad_variants, landing_page_variants });
  } catch (err) {
    console.error('[ad-generation]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/variants', async (req, res) => {
  try {
    const filters = {
      channel: req.query.channel ? String(req.query.channel) : undefined,
      product_focus: req.query.product_focus ? String(req.query.product_focus) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      campaign_id: req.query.campaign_id ? String(req.query.campaign_id) : undefined,
      limit: req.query.limit,
    };
    if (filters.campaign_id && !isUuid(filters.campaign_id)) {
      return res.status(400).json({ ok: false, error: 'campaign_id must be a valid UUID' });
    }
    const out = await listVariants(filters);
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('[ad-generation]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
