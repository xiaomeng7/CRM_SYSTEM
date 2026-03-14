/**
 * Reply Inbox API
 * GET /api/reactivation/replies - list inbound SMS replies
 * PATCH /api/reactivation/replies/:id/handled - mark activity as handled
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

const SMS_INBOUND_TYPES = ['inbound_sms', 'inbound_sms_unmatched'];
const NEEDS_ATTENTION_KEYWORDS = ['price', 'quote', 'call', 'when', 'urgent'];

function needsAttention(message) {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  if (m.length > 30) return true;
  return NEEDS_ATTENTION_KEYWORDS.some((kw) => m.includes(kw));
}

router.get('/', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayRepliesRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM activities
       WHERE activity_type = ANY($1) AND occurred_at >= $2 AND occurred_at < $3`,
      [SMS_INBOUND_TYPES, todayStart, todayEnd]
    );
    const todayReplies = Number(todayRepliesRes.rows[0]?.cnt || 0);

    const tasksCreatedRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM tasks WHERE created_at >= $1 AND created_at < $2`,
      [todayStart, todayEnd]
    );
    const tasksCreatedToday = Number(tasksCreatedRes.rows[0]?.cnt || 0);

    let repliesRes;
    try {
      repliesRes = await pool.query(
        `SELECT a.id, a.contact_id, a.summary, a.occurred_at,
                COALESCE(a.handled, false) AS handled,
                a.intent, a.intent_confidence, a.intent_source,
                c.name AS contact_name, c.phone, c.account_id, acc.name AS account_name,
                COALESCE(c.do_not_contact, false) AS do_not_contact
         FROM activities a
         LEFT JOIN contacts c ON c.id = a.contact_id
         LEFT JOIN accounts acc ON acc.id = c.account_id
         WHERE a.activity_type = ANY($1)
         ORDER BY a.occurred_at DESC
         LIMIT 100`,
        [SMS_INBOUND_TYPES]
      );
    } catch (e) {
      if (/handled|intent|do_not_contact|column.*does not exist/i.test(e.message)) {
        repliesRes = await pool.query(
          `SELECT a.id, a.contact_id, a.summary, a.occurred_at,
                  c.name AS contact_name, c.phone, c.account_id, acc.name AS account_name
           FROM activities a
           LEFT JOIN contacts c ON c.id = a.contact_id
           LEFT JOIN accounts acc ON acc.id = c.account_id
           WHERE a.activity_type = ANY($1)
           ORDER BY a.occurred_at DESC
           LIMIT 100`,
          [SMS_INBOUND_TYPES]
        );
        repliesRes.rows = repliesRes.rows.map((r) => ({
          ...r,
          handled: false,
          intent: null,
          intent_confidence: null,
          intent_source: null,
          do_not_contact: false,
        }));
      } else {
        throw e;
      }
    }

    const contactIds = [...new Set(repliesRes.rows.map((r) => r.contact_id).filter(Boolean))];
    let hasOpenTask = new Map();
    let hasLeadCreated = new Map();
    if (contactIds.length > 0) {
      const [taskRes, leadRes] = await Promise.all([
        pool.query(
          `SELECT contact_id FROM tasks
           WHERE contact_id = ANY($1) AND COALESCE(status, 'open') IN ('open', 'pending')
           GROUP BY contact_id`,
          [contactIds]
        ),
        pool.query(
          `SELECT contact_id FROM activities
           WHERE contact_id = ANY($1) AND activity_type = 'lead_created'
           GROUP BY contact_id`,
          [contactIds]
        ),
      ]);
      taskRes.rows.forEach((r) => hasOpenTask.set(r.contact_id, true));
      leadRes.rows.forEach((r) => hasLeadCreated.set(r.contact_id, true));
    }

    const replies = repliesRes.rows.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      account_id: r.account_id,
      contact_name: r.contact_name || 'Unknown',
      account_name: r.account_name || '—',
      phone: r.phone || '—',
      message: r.summary || '',
      occurred_at: r.occurred_at,
      handled: !!r.handled,
      has_open_task: hasOpenTask.has(r.contact_id),
      intent: r.intent || null,
      intent_confidence: r.intent_confidence != null ? Number(r.intent_confidence) : null,
      intent_source: r.intent_source || null,
      lead_created: hasLeadCreated.has(r.contact_id),
      do_not_contact: !!r.do_not_contact,
    }));

    let unhandled = 0;
    let needsAttentionCount = 0;
    replies.forEach((r) => {
      if (!r.handled && !r.has_open_task) unhandled++;
      if (needsAttention(r.message)) needsAttentionCount++;
    });

    const stats = {
      todayReplies,
      unhandled,
      needsAttention: needsAttentionCount,
      tasksCreatedToday,
    };

    res.json({ stats, replies });
  } catch (err) {
    console.error('GET /api/reactivation/replies error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/handled', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE activities SET handled = true, updated_at = NOW()
       WHERE id = $1::uuid AND activity_type = ANY($2)
       RETURNING id`,
      [id, SMS_INBOUND_TYPES]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Activity not found or not an inbound SMS' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/reactivation/replies/:id/handled error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
