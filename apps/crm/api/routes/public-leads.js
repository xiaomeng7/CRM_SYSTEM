/**
 * Public lead intake API
 * POST /api/public/leads
 */

const router = require('express').Router();
const publicLeads = require('../../services/public-leads');

router.post('/', async (req, res) => {
  try {
    const payload = {
      ...(req.body || {}),
      _request_referrer: req.headers.referer || req.headers.referrer || null,
    };
    const result = await publicLeads.createFromPublic(payload);
    res.status(201).json({
      ok: true,
      lead_id: result.lead.id,
      contact_id: result.contact_id,
      account_id: result.account_id,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : 'Failed to create lead';
    const status = msg.startsWith('Missing required fields') ? 400 : 500;
    res.status(status).json({ ok: false, error: msg });
  }
});

module.exports = router;

