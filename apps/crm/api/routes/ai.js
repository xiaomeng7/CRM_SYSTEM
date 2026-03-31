const router = require('express').Router();
const { scoreLeadAndPersist } = require('../../services/lead-scoring');

router.post('/score-lead', async (req, res) => {
  try {
    const leadId = req.body?.lead_id;
    if (!leadId) return res.status(400).json({ ok: false, error: 'lead_id is required' });
    const out = await scoreLeadAndPersist(leadId);
    return res.status(201).json({
      ok: true,
      lead_id: leadId,
      scoring_version: 'v2-hybrid',
      blend: 'final = round(rule_score * 0.3 + ai_score * 0.7); tier from final_score only',
      score: out.score,
      rule_score: out.rule_score,
      ai_score: out.ai_score,
      scoring_method: out.scoring_method,
      tier: out.tier,
      expected_value: out.expected_value,
      conversion_probability: out.conversion_probability,
      recommended_action: out.recommended_action,
      reasoning: out.reasoning,
      created_at: out.row?.created_at || out.row?.scored_at || null,
    });
  } catch (err) {
    if (/lead not found/i.test(err.message)) return res.status(404).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: err.message || 'scoring failed' });
  }
});

module.exports = router;
