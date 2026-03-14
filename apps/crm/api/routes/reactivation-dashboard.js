/**
 * Reactivation Dashboard API — read-only.
 * GET /api/reactivation/dashboard
 * Returns summary, pipeline, candidates, replies, tasks for the client activation dashboard.
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');

// activity_type: outbound = 'sms' (manual reactivate), 'outbound_sms' (reactivation-engine); inbound = 'inbound_sms', 'inbound_sms_unmatched'
const SMS_OUTBOUND_TYPES = ['sms', 'outbound_sms'];
const SMS_INBOUND_TYPES = ['inbound_sms', 'inbound_sms_unmatched'];

router.get('/', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // 1. Candidates from crm_account_reactivation_contacts (or fallback to crm_account_reactivation_candidates)
    let candidates = [];
    try {
      const candRes = await pool.query(`
        SELECT
          account_id,
          account_name,
          contact_id,
          contact_name,
          phone,
          suburb,
          jobs_count,
          last_job_date,
          months_since_last_job,
          priority_score
        FROM crm_account_reactivation_contacts
        ORDER BY priority_score DESC
        LIMIT 200
      `);
      candidates = candRes.rows.map((r) => ({
        account_id: r.account_id,
        account_name: r.account_name,
        contact_id: r.contact_id,
        contact_name: r.contact_name,
        phone: r.phone,
        suburb: r.suburb,
        jobs_count: Number(r.jobs_count || 0),
        total_revenue: 0,
        last_job_date: r.last_job_date,
        months_since_last_job: r.months_since_last_job,
        priority_score: Number(r.priority_score || 0),
      }));
    } catch (e) {
      if (!/crm_account_reactivation_contacts/i.test(e.message)) throw e;
      const fallback = await pool.query(`
        SELECT account_id, account_name, suburb, contact_with_phone_count, jobs_count, last_job_date, months_since_last_job, priority_score
        FROM crm_account_reactivation_candidates
        ORDER BY priority_score DESC
        LIMIT 200
      `);
      candidates = fallback.rows.map((r) => ({
        account_id: r.account_id,
        account_name: r.account_name,
        contact_id: null,
        contact_name: null,
        phone: null,
        suburb: r.suburb,
        jobs_count: Number(r.jobs_count || 0),
        total_revenue: 0,
        last_job_date: r.last_job_date,
        months_since_last_job: r.months_since_last_job,
        priority_score: Number(r.priority_score || 0),
      }));
    }

    const contactIds = candidates.map((c) => c.contact_id).filter(Boolean);

    // 2. Activity stats for status derivation and counts
    const smsTodayRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM activities
       WHERE activity_type = ANY($1) AND occurred_at >= $2 AND occurred_at < $3`,
      [SMS_OUTBOUND_TYPES, todayStart, todayEnd]
    );
    const smsSentToday = Number(smsTodayRes.rows[0]?.cnt || 0);

    const inboundCnt = await pool.query(
      `SELECT COUNT(*) AS cnt FROM activities
       WHERE activity_type = ANY($1) AND occurred_at >= NOW() - INTERVAL '30 days'`,
      [SMS_INBOUND_TYPES]
    );
    const replied = Number(inboundCnt.rows[0]?.cnt || 0);

    // 3. Tasks: open/pending, today due first
    const tasksRes = await pool.query(`
      SELECT t.id, t.title, t.due_at, t.assigned_to AS owner, t.created_by, t.contact_id
      FROM tasks t
      WHERE COALESCE(t.status, 'open') IN ('open', 'pending')
        AND (t.due_at IS NULL OR t.due_at::date <= CURRENT_DATE + INTERVAL '1 day')
      ORDER BY
        CASE WHEN t.created_by = 'twilio-webhook' THEN 0 ELSE 1 END,
        t.due_at ASC NULLS LAST
      LIMIT 50
    `);
    const tasks = tasksRes.rows.map((t) => ({
      id: t.id,
      task: t.title,
      due_at: t.due_at,
      due: formatDue(t.due_at),
      owner: t.assigned_to || t.created_by || null,
      priority: inferPriority(t.due_at),
      contact_id: t.contact_id,
    }));

    // Queue stats: preview/queued count from reactivation_sms_queue
    let queuePreview = 0;
    try {
      const qRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM reactivation_sms_queue WHERE status IN ('preview', 'queued')`
      );
      queuePreview = Number(qRes.rows[0]?.cnt || 0);
    } catch (_) {}

    const followUpTodayRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM tasks
       WHERE COALESCE(status, 'open') IN ('open', 'pending')
         AND due_at IS NOT NULL
         AND due_at::date = CURRENT_DATE`
    );
    const followUpToday = Number(followUpTodayRes.rows[0]?.cnt || 0);

    // 4. Replies (inbound_sms activities)
    const repliesRes = await pool.query(
      `SELECT a.id, a.contact_id, a.summary, a.occurred_at, c.name AS contact_name, c.phone
       FROM activities a
       LEFT JOIN contacts c ON c.id = a.contact_id
       WHERE a.activity_type = ANY($1)
       ORDER BY a.occurred_at DESC
       LIMIT 30`,
      [SMS_INBOUND_TYPES]
    );
    const replies = repliesRes.rows.map((r) => ({
      contact_id: r.contact_id,
      contact_name: r.contact_name || 'Unknown Contact',
      phone: r.phone || null,
      occurred_at: r.occurred_at,
      time: formatTime(r.occurred_at),
      content: r.summary || '',
      sentiment: '待处理',
      nextAction: '创建跟进任务 / 打开客户档案',
    }));

    // 5. Derive status for each candidate
    const contactOutbound = contactIds.length
      ? await pool.query(
          `SELECT contact_id FROM activities
           WHERE contact_id = ANY($1) AND activity_type = ANY($2)
           GROUP BY contact_id`,
          [contactIds, SMS_OUTBOUND_TYPES]
        )
      : { rows: [] };
    const contactInbound = contactIds.length
      ? await pool.query(
          `SELECT contact_id FROM activities
           WHERE contact_id = ANY($1) AND activity_type = ANY($2)
           GROUP BY contact_id`,
          [contactIds, SMS_INBOUND_TYPES]
        )
      : { rows: [] };
    const contactTasks = contactIds.length
      ? await pool.query(
          `SELECT contact_id FROM tasks
           WHERE contact_id = ANY($1) AND COALESCE(status, 'open') IN ('open', 'pending')
           GROUP BY contact_id`,
          [contactIds]
        )
      : { rows: [] };
    const hasOutbound = new Set((contactOutbound.rows || []).map((r) => r.contact_id));
    const hasInbound = new Set((contactInbound.rows || []).map((r) => r.contact_id));
    const hasOpenTask = new Set((contactTasks.rows || []).map((r) => r.contact_id));

    candidates = candidates.map((c) => {
      const cid = c.contact_id;
      let status = '待发送';
      if (cid && hasInbound.has(cid)) status = '已回复';
      else if (cid && hasOpenTask.has(cid)) status = '待跟进';
      else if (cid && hasOutbound.has(cid)) status = '已发送';
      return { ...c, status };
    });

    const smsQueued = candidates.filter((c) => c.status === '待发送').length;
    const sent = candidates.filter((c) => c.status === '已发送').length;
    const repliedCand = candidates.filter((c) => c.status === '已回复').length;
    const followCand = candidates.filter((c) => c.status === '待跟进').length;

    const summary = {
      candidates: candidates.length,
      smsQueued,
      queuePreview,
      smsSentToday,
      replied: replied,
      followUpToday,
      doNotContact: 0,
    };

    const pipeline = [
      { label: '待筛选', value: candidates.length },
      { label: '待发送', value: smsQueued },
      { label: '已发送', value: sent },
      { label: '已回复', value: repliedCand },
      { label: '待跟进', value: followCand },
    ];

    res.json({
      summary,
      pipeline,
      candidates,
      replies,
      tasks,
    });
  } catch (err) {
    console.error('reactivation dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

function formatDue(dueAt) {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString();
}

function inferPriority(dueAt) {
  if (!dueAt) return 'Medium';
  const d = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  if (day.getTime() <= today.getTime()) return 'High';
  if (day.getTime() <= tomorrow.getTime()) return 'Medium';
  return 'Medium';
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (t.getTime() === today.getTime()) return `Today ${timeStr}`;
  if (t.getTime() === yesterday.getTime()) return `Yesterday ${timeStr}`;
  return d.toLocaleDateString() + ' ' + timeStr;
}

module.exports = router;
