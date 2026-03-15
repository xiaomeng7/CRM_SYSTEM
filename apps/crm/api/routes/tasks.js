/**
 * Tasks API
 * GET /api/tasks - list tasks (open/pending)
 * POST /api/tasks - create a task
 * PATCH /api/tasks/:id - update task
 * POST /api/tasks/:id/complete - complete with outcome
 *
 * All opportunity stage changes go through the stage engine (advanceOpportunityStage);
 * no direct UPDATE opportunities.stage from this module.
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const { advanceOpportunityStage } = require('../../services/opportunityStageAutomation');
const { OPPORTUNITY_STAGES } = require('../../lib/stage-constants');

router.get('/', async (req, res) => {
  try {
    const status = req.query.status || 'open,pending';
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    const params = statuses.length ? [statuses] : [['open', 'pending']];
    const res0 = await pool.query(
      `SELECT t.id, t.contact_id, t.lead_id, t.opportunity_id, t.title, t.status, t.due_at, t.created_by AS source,
              c.name AS contact_name, c.phone,
              a.suburb
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       LEFT JOIN accounts a ON a.id = c.account_id
       WHERE t.status = ANY($1)
       ORDER BY t.due_at ASC NULLS LAST, t.created_at ASC`,
      [params[0]]
    );
    const tasks = res0.rows.map((r) => ({
      id: r.id,
      contact_id: r.contact_id,
      lead_id: r.lead_id,
      opportunity_id: r.opportunity_id,
      title: r.title,
      status: r.status,
      due_at: r.due_at,
      due: formatDue(r.due_at),
      source: r.source,
      contact_name: r.contact_name,
      phone: r.phone,
      suburb: r.suburb,
    }));
    res.json({ tasks });
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

function formatDue(dueAt) {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (t < today) return 'Overdue';
  if (t.getTime() === today.getTime()) return 'Today';
  return d.toLocaleDateString();
}

router.post('/', async (req, res) => {
  try {
    const { contact_id, account_id, title, source } = req.body;
    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }

    const t = title || 'Follow up SMS reply';
    const createdBy = source || 'reply_inbox';

    const result = await pool.query(
      `INSERT INTO tasks (contact_id, lead_id, opportunity_id, title, status, due_at, created_by)
       VALUES ($1, NULL, NULL, $2, 'open', NOW(), $3)
       RETURNING id, contact_id, title, status, due_at, created_by`,
      [contact_id, t, createdBy]
    );

    const row = result.rows[0];
    res.status(201).json({
      ok: true,
      task: {
        id: row.id,
        contact_id: row.contact_id,
        title: row.title,
        status: row.status,
        due_at: row.due_at,
      },
    });
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status || !['open', 'pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'status must be open, pending, completed, or cancelled' });
    }
    const r = await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
      [status, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ id, status: r.rows[0].status });
  } catch (err) {
    console.error('PATCH /api/tasks/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, follow_up_delay } = req.body || {};
    const taskRes = await pool.query(
      `SELECT t.id, t.contact_id, t.title, c.name AS contact_name
       FROM tasks t
       LEFT JOIN contacts c ON c.id = t.contact_id
       WHERE t.id = $1`,
      [id]
    );
    if (taskRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskRes.rows[0];
    const contactId = task.contact_id;
    const contactName = task.contact_name || 'Contact';

    const isCallTask = (task.title || '').trim().toLowerCase().startsWith('call');

    if (isCallTask) {
      if (!outcome || !['interested', 'needs_quote', 'book_inspection', 'call_later', 'no_answer', 'not_interested'].includes(outcome)) {
        return res.status(400).json({
          error: 'Call tasks require outcome: interested, needs_quote, book_inspection, call_later, no_answer, not_interested',
        });
      }
      if (outcome === 'call_later' && !follow_up_delay) {
        return res.status(400).json({ error: 'call_later requires follow_up_delay: 1_week, 1_month, or 3_months' });
      }
    } else {
      // non-Call tasks: complete without outcome
    }

    await pool.query(`UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1`, [id]);

    const created = [];

    if (isCallTask) {
      if (outcome === 'interested') {
        const opp = await pool.query(
          `INSERT INTO opportunities (contact_id, account_id, stage, status, created_by)
           SELECT $1, account_id, $2, 'open', 'task_complete'
           FROM contacts WHERE id = $1
           RETURNING id`,
          [contactId, OPPORTUNITY_STAGES.NEW_INQUIRY]
        );
        if (opp.rows.length > 0) created.push({ type: 'opportunity', id: opp.rows[0].id });
      } else if (outcome === 'needs_quote') {
        const t2 = await pool.query(
          `INSERT INTO tasks (contact_id, title, status, due_at, created_by)
           VALUES ($1, $2, 'open', CURRENT_DATE, 'task_complete')
           RETURNING id`,
          [contactId, `Prepare quote for ${contactName}`]
        );
        if (t2.rows.length > 0) created.push({ type: 'task', id: t2.rows[0].id, title: t2.rows[0].title || '' });
      } else if (outcome === 'book_inspection') {
        const t2 = await pool.query(
          `INSERT INTO tasks (contact_id, title, status, due_at, created_by)
           VALUES ($1, $2, 'open', CURRENT_DATE, 'task_complete')
           RETURNING id`,
          [contactId, `Schedule inspection for ${contactName}`]
        );
        if (t2.rows.length > 0) created.push({ type: 'task', id: t2.rows[0].id });
      } else if (outcome === 'call_later') {
        let due = new Date();
        if (follow_up_delay === '1_week') due.setDate(due.getDate() + 7);
        else if (follow_up_delay === '1_month') due.setMonth(due.getMonth() + 1);
        else if (follow_up_delay === '3_months') due.setMonth(due.getMonth() + 3);
        else due.setDate(due.getDate() + 7);
        const t2 = await pool.query(
          `INSERT INTO tasks (contact_id, title, status, due_at, created_by)
           VALUES ($1, $2, 'open', $3, 'task_complete')
           RETURNING id`,
          [contactId, `Follow up with ${contactName}`, due]
        );
        if (t2.rows.length > 0) created.push({ type: 'task', id: t2.rows[0].id });
      } else if (outcome === 'no_answer') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const t2 = await pool.query(
          `INSERT INTO tasks (contact_id, title, status, due_at, created_by)
           VALUES ($1, $2, 'open', $3, 'task_complete')
           RETURNING id`,
          [contactId, `Call ${contactName} again`, tomorrow]
        );
        if (t2.rows.length > 0) created.push({ type: 'task', id: t2.rows[0].id });
      } else if (outcome === 'not_interested') {
        if (contactId) {
          await pool.query(
            `UPDATE contacts SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
            [contactId]
          );
          // All stage updates via stage engine: respect stage_locked, closed stages, audit log
          const opps = await pool.query(
            `SELECT id FROM opportunities WHERE contact_id = $1`,
            [contactId]
          );
          for (const o of opps.rows) {
            await advanceOpportunityStage(o.id, 'not_interested', {
              created_by: 'task_complete',
              lost_reason: 'not_interested',
            });
          }
        }
      }
    }

    res.json({ ok: true, task_id: id, created });
  } catch (err) {
    console.error('POST /api/tasks/:id/complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
