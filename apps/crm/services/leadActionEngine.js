/**
 * Lead Action Engine v1.1 — post-scoring actions (tasks / SMS). Failures are logged only.
 * Triggered from leadScoring after a lead_scores row is inserted.
 *
 * v1.1+: features.lead_action_engine_v1 — vip_action_triggered, vip_action_at,
 * medium_sms_sent (fallback dedupe without crm_communications).
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');

const CREATED_BY = 'lead-action-engine';

const TITLE_VIP = 'Owner follow-up — VIP scored lead';
const TITLE_HIGH = 'Call lead — scored high (today)';
const SMS_TEMPLATE = 'lead_score_medium_followup_v1';

function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return 'there';
  return n.split(/\s+/)[0] || n;
}

function renderMediumSms(name) {
  const who = firstName(name);
  return (
    'Hi ' +
    who +
    ', this is Meng from Better Home Technology.\n\n' +
    'I saw your enquiry — happy to help with your electrical or energy needs.\n\n' +
    'If you like, I can give you a quick call to point you in the right direction.\n\n' +
    "Just reply YES and I'll call you 👍"
  );
}

async function getTaskColumns() {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tasks'`
  );
  return new Set(r.rows.map((x) => x.column_name));
}

async function getLeadContact(leadId) {
  const r = await pool.query(
    `SELECT l.id AS lead_id, l.contact_id, c.name AS contact_name, c.phone AS contact_phone
     FROM leads l
     LEFT JOIN contacts c ON c.id = l.contact_id
     WHERE l.id = $1`,
    [leadId]
  );
  return r.rows[0] || null;
}

async function hasOpenTaskByLeadAndTitle(leadId, title) {
  const r = await pool.query(
    `SELECT id FROM tasks
     WHERE lead_id = $1 AND title = $2 AND COALESCE(status, 'open') IN ('open', 'pending')
     LIMIT 1`,
    [leadId, title]
  );
  return Boolean(r.rows[0]);
}

/** Any SMS to this lead in the last 24h (throttle; table missing → false, warn). */
async function hasRecentSmsToLead(leadId) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM crm_communications
       WHERE lead_id = $1
         AND channel = 'sms'
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [leadId]
    );
    return Boolean(r.rows[0]);
  } catch (e) {
    if (/crm_communications|does not exist/i.test(e.message || '')) {
      console.warn('[lead-action-engine] crm_communications unavailable; skipping 24h SMS throttle');
      return false;
    }
    console.warn('[lead-action-engine] recent SMS check failed:', e.message);
    return false;
  }
}

/** Fallback dedupe: any score row for this lead marked medium SMS sent (no comm table required). */
async function hasMediumSmsSentFlag(leadId) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM lead_scores
       WHERE lead_id = $1
         AND (
           features->'lead_action_engine_v1'->'medium_sms_sent' = 'true'::jsonb
           OR (features->'lead_action_engine_v1'->>'medium_sms_sent') = 'true'
         )
       LIMIT 1`,
      [leadId]
    );
    return Boolean(r.rows[0]);
  } catch (e) {
    console.warn('[lead-action-engine] medium_sms_sent flag lookup failed:', e.message);
    return false;
  }
}

async function markMediumSmsSentForLead(leadId) {
  try {
    await pool.query(
      `UPDATE lead_scores
       SET features = jsonb_set(
         COALESCE(features, '{}'::jsonb),
         '{lead_action_engine_v1,medium_sms_sent}',
         'true'::jsonb,
         true
       )
       WHERE lead_id = $1`,
      [leadId]
    );
  } catch (e) {
    console.warn('[lead-action-engine] medium_sms_sent flag failed:', e.message);
  }
}

async function hasMediumSmsSent(leadId) {
  try {
    const r = await pool.query(
      `SELECT id FROM crm_communications
       WHERE lead_id = $1 AND channel = 'sms' AND template_name = $2
       LIMIT 1`,
      [leadId, SMS_TEMPLATE]
    );
    return Boolean(r.rows[0]);
  } catch (e) {
    if (/crm_communications|does not exist/i.test(e.message || '')) {
      return false;
    }
    console.warn('[lead-action-engine] template SMS lookup failed:', e.message);
    return false;
  }
}

/** Business dedupe: any prior VIP action for this lead (features flag on any score row). */
async function hasVipActionTriggered(leadId) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM lead_scores
       WHERE lead_id = $1
         AND (
           features->'lead_action_engine_v1'->'vip_action_triggered' = 'true'::jsonb
           OR (features->'lead_action_engine_v1'->>'vip_action_triggered') = 'true'
         )
       LIMIT 1`,
      [leadId]
    );
    return Boolean(r.rows[0]);
  } catch (e) {
    console.warn('[lead-action-engine] vip_action_triggered lookup failed:', e.message);
    return false;
  }
}

async function markVipActionTriggeredForLead(leadId) {
  try {
    await pool.query(
      `UPDATE lead_scores
       SET features = jsonb_set(
         jsonb_set(
           COALESCE(features, '{}'::jsonb),
           '{lead_action_engine_v1,vip_action_triggered}',
           'true'::jsonb,
           true
         ),
         '{lead_action_engine_v1,vip_action_at}',
         to_jsonb(NOW()),
         true
       )
       WHERE lead_id = $1`,
      [leadId]
    );
  } catch (e) {
    console.warn('[lead-action-engine] vip_action_triggered flag failed:', e.message);
  }
}

async function insertTask(leadId, contactId, title, dueAt, taskType) {
  const cols = await getTaskColumns();
  const useType = taskType && cols.has('task_type');
  if (useType) {
    const ins = await pool.query(
      `INSERT INTO tasks (contact_id, lead_id, title, status, due_at, task_type, created_by)
       VALUES ($1, $2, $3, 'open', $4, $5, $6)
       RETURNING id`,
      [contactId, leadId, title, dueAt, taskType, CREATED_BY]
    );
    return ins.rows[0]?.id;
  }
  const ins = await pool.query(
    `INSERT INTO tasks (contact_id, lead_id, title, status, due_at, created_by)
     VALUES ($1, $2, $3, 'open', $4, $5)
     RETURNING id`,
    [contactId, leadId, title, dueAt, CREATED_BY]
  );
  return ins.rows[0]?.id;
}

async function insertCrmCommunication(leadId, contactId, message) {
  await pool.query(
    `INSERT INTO crm_communications (contact_id, lead_id, channel, template_name, message_content, delivery_status, status, created_by)
     VALUES ($1, $2, 'sms', $3, $4, 'sent', 'sent', $5)`,
    [contactId, leadId, SMS_TEMPLATE, message, CREATED_BY]
  );
}

async function logActivity(leadId, contactId, summary) {
  try {
    await pool.query(
      `INSERT INTO activities (contact_id, lead_id, activity_type, summary, created_by)
       VALUES ($1, $2, 'note', $3, $4)`,
      [contactId, leadId, summary, CREATED_BY]
    );
  } catch (e) {
    console.warn('[lead-action-engine] activity log skipped:', e.message);
  }
}

/** Deep-merge patch under features.lead_action_engine_v1 (preserves e.g. vip_action_triggered). */
async function mergeScoreFeatures(scoreRowId, patch) {
  if (!scoreRowId) return;
  try {
    await pool.query(
      `UPDATE lead_scores
       SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
         'lead_action_engine_v1',
         COALESCE(features->'lead_action_engine_v1', '{}'::jsonb) || $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(patch), scoreRowId]
    );
  } catch (e) {
    console.warn('[lead-action-engine] features merge skipped:', e.message);
  }
}

/**
 * @param {object} leadScore — merged score row + { tier, recommended_action } from scoring pipeline
 *   Required: lead_id (or from row), tier | score_grade
 */
async function handleLeadAction(leadScore) {
  if (process.env.LEAD_ACTION_ENGINE_DISABLED === 'true' || process.env.LEAD_ACTION_ENGINE_DISABLED === '1') {
    return { skipped: true, reason: 'disabled' };
  }

  try {
    const lead_id = leadScore.lead_id;
    const tier = String(leadScore.tier || leadScore.score_grade || '').toLowerCase().trim();
    const recommended_action = String(leadScore.recommended_action || '').trim();
    const scoreRowId = leadScore.id || null;

    if (!lead_id || !tier) {
      return { skipped: true, reason: 'missing_lead_or_tier' };
    }

    const lc = await getLeadContact(lead_id);
    if (!lc || !lc.contact_id) {
      return { skipped: true, reason: 'no_contact' };
    }

    const contactId = lc.contact_id;
    const phone = lc.contact_phone && String(lc.contact_phone).trim() ? String(lc.contact_phone).trim() : null;

    const endOfLocalDay = new Date();
    endOfLocalDay.setHours(23, 59, 59, 999);

    let result = { tier, recommended_action, actions: [] };

    if (tier === 'vip') {
      if (await hasVipActionTriggered(lead_id)) {
        result.actions.push({ type: 'task_vip', deduped: true, reason: 'vip_action_triggered' });
      } else if (await hasOpenTaskByLeadAndTitle(lead_id, TITLE_VIP)) {
        result.actions.push({ type: 'task_vip', deduped: true, reason: 'open_task' });
      } else {
        try {
          const taskId = await insertTask(lead_id, contactId, TITLE_VIP, new Date(), 'lead_score_vip');
          result.actions.push({ type: 'task_vip', task_id: taskId });
          await markVipActionTriggeredForLead(lead_id);
          await logActivity(
            lead_id,
            contactId,
            'VIP lead from scoring — owner follow-up task created. Recommended: ' + (recommended_action || 'n/a')
          );
        } catch (vipErr) {
          console.warn('[lead-action-engine] VIP task path failed:', vipErr.message);
          result.actions.push({ type: 'task_vip', error: vipErr.message });
        }
      }
    } else if (tier === 'high') {
      if (await hasOpenTaskByLeadAndTitle(lead_id, TITLE_HIGH)) {
        result.actions.push({ type: 'task_high', deduped: true });
      } else {
        const taskId = await insertTask(lead_id, contactId, TITLE_HIGH, endOfLocalDay, 'lead_score_high_call');
        result.actions.push({ type: 'task_high', task_id: taskId });
      }
    } else if (tier === 'medium') {
      if (!phone) {
        result.actions.push({ type: 'sms_medium', skipped: true, reason: 'no_phone' });
      } else {
        let skipSms = false;
        let skipReason = null;
        if (await hasMediumSmsSentFlag(lead_id)) {
          skipSms = true;
          skipReason = 'medium_sms_flag';
        }
        if (!skipSms && (await hasMediumSmsSent(lead_id))) {
          skipSms = true;
          skipReason = 'template_already_sent';
        }
        if (!skipSms && (await hasRecentSmsToLead(lead_id))) {
          skipSms = true;
          skipReason = 'sms_within_24h';
        }

        if (skipSms) {
          result.actions.push({ type: 'sms_medium', deduped: true, reason: skipReason });
        } else {
          const body = renderMediumSms(lc.contact_name);
          try {
            await sendSMS(phone, body);
            await markMediumSmsSentForLead(lead_id);
            try {
              await insertCrmCommunication(lead_id, contactId, body);
            } catch (commErr) {
              console.warn('[lead-action-engine] crm_communications insert failed:', commErr.message);
            }
            result.actions.push({ type: 'sms_medium', sent: true });
          } catch (smsErr) {
            console.warn('[lead-action-engine] SMS failed:', smsErr.message);
            result.actions.push({ type: 'sms_medium', error: smsErr.message });
          }
        }
      }
    } else if (tier === 'low') {
      result.actions.push({ type: 'none' });
    }

    await mergeScoreFeatures(scoreRowId, {
      at: new Date().toISOString(),
      tier,
      actions: result.actions,
    });

    return result;
  } catch (e) {
    console.warn('[lead-action-engine] handleLeadAction error:', e.message || e);
    return { error: e.message || String(e) };
  }
}

module.exports = {
  handleLeadAction,
  CREATED_BY,
  TITLE_VIP,
  TITLE_HIGH,
  SMS_TEMPLATE,
};
