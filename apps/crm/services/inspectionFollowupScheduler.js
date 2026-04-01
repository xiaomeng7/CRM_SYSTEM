/**
 * Inspection Follow-up SMS Scheduler
 * Sends automated follow-ups at D+1, D+7, D+14 after report is sent to client.
 * Triggered daily via AUTO_INSPECTION_FOLLOWUP=true in api/index.js.
 */

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');

const SEQUENCE = [
  {
    day: 1,
    template: (name) =>
      `Hi ${name}, just checking in — did you get a chance to review your electrical inspection report? ` +
      `Happy to walk you through the findings. Call 0410 323 034 or reply here. – Meng, Better Home Technology`,
  },
  {
    day: 7,
    template: (name) =>
      `Hi ${name}, following up on your electrical inspection from last week. ` +
      `Have you had a chance to discuss it with your conveyancer? We can provide a written quote for any remediation work. ` +
      `Call 0410 323 034. – Meng, Better Home Technology`,
  },
  {
    day: 14,
    template: (name) =>
      `Hi ${name}, it's been two weeks since your pre-purchase inspection. ` +
      `If you've settled and need any electrical work done, we'd love to help. ` +
      `Call 0410 323 034 or reply here. – Meng, Better Home Technology`,
  },
];

async function runFollowupSequence({ log = console.log, dryRun = false } = {}) {
  const results = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  for (const seq of SEQUENCE) {
    try {
      const targetRows = await pool.query(
        `SELECT p.id, p.contact_phone, p.sent_at, p.job_number,
                c.name AS contact_name
         FROM pre_purchase_inspections p
         LEFT JOIN contacts c
           ON c.phone ILIKE '%' || RIGHT(REGEXP_REPLACE(p.contact_phone, '[^0-9]', '', 'g'), 8) || '%'
         WHERE p.status = 'sent'
           AND p.sent_at IS NOT NULL
           AND p.sent_at::date = CURRENT_DATE - INTERVAL '${seq.day} days'
           AND p.contact_phone IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM inspection_sms_log l
             WHERE l.inspection_id = p.id AND l.sequence_day = ${seq.day}
           )`
      );

      for (const row of targetRows.rows) {
        results.processed++;
        try {
          const firstName = (row.contact_name || '').split(' ')[0] || 'there';
          const body = seq.template(firstName);

          if (!dryRun) {
            await sendSMS(row.contact_phone, body);
            await pool.query(
              `INSERT INTO inspection_sms_log (inspection_id, sequence_day, message_body, status, sent_at)
               VALUES ($1, $2, $3, 'sent', NOW())`,
              [row.id, seq.day, body]
            );
          }

          log(`[followup] D+${seq.day} SMS → ${row.contact_phone} (${row.job_number || row.id})`);
          results.sent++;
        } catch (err) {
          log(`[followup] ERROR for ${row.id}: ${err.message}`);
          results.errors++;
          if (!dryRun) {
            await pool.query(
              `INSERT INTO inspection_sms_log (inspection_id, sequence_day, message_body, status, sent_at)
               VALUES ($1, $2, $3, 'failed', NOW())`,
              [row.id, seq.day, err.message]
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      log(`[followup] Query error D+${seq.day}: ${err.message}`);
      results.errors++;
    }
  }

  return results;
}

module.exports = { runFollowupSequence };
