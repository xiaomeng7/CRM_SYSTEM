/**
 * Re-sale follow-up SMS scheduler — all three product lines
 *
 * Sequences triggered from inspection sent_at / lead created_at:
 *
 * Pre-Purchase (sent report):
 *   D+7  — Check in: any questions about the report?
 *   D+30 — Upsell: we can quote the remediation work
 *   D+90 — Cross-sell: considering a rental property? / energy audit
 *
 * Rental (sent report):
 *   D+7  — Check in: any questions?
 *   D+30 — Annual re-inspection reminder
 *   D+90 — Upsell: pre-purchase inspection if buying?
 *
 * Energy Lite (paid purchase):
 *   D+7  — Check in: did the report help?
 *   D+30 — Upsell: on-site energy audit
 *   D+90 — Cross-sell: pre-purchase or rental inspection
 *
 * Run: every 24h via setInterval in api/index.js
 * Guarded by: resale_followup_log table (prevents duplicate sends)
 */

'use strict';

const { pool } = require('../lib/db');
const { sendSMS } = require('@bht/integrations');

const BHT_PHONE = '0410 323 034';

const SEQUENCES = {
  pre_purchase: [
    {
      day: 7,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''}, following up on your BHT electrical inspection report. ` +
        `Any questions about the findings? We're happy to walk you through the options. Call us on ${BHT_PHONE}.`,
    },
    {
      day: 30,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''}, it's been a month since your pre-purchase electrical inspection. ` +
        `If you've decided to proceed, we can quote and carry out any recommended electrical work. ` +
        `Call ${BHT_PHONE} to get a fixed-price quote.`,
    },
    {
      day: 90,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''} from Better Home Technology. ` +
        `If you own investment properties, our rental electrical safety inspections start from $199. ` +
        `We also offer energy efficiency assessments to reduce your bills. Reply STOP to opt out. Call ${BHT_PHONE}.`,
    },
  ],
  rental: [
    {
      day: 7,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''}, following up on your BHT rental electrical inspection. ` +
        `Any questions about the report or items flagged? We can quote repairs quickly. Call ${BHT_PHONE}.`,
    },
    {
      day: 30,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''} from BHT. A reminder that rental electrical safety inspections ` +
        `are recommended annually. Book your next one early — we're often 2-3 weeks out. Call ${BHT_PHONE}.`,
    },
    {
      day: 90,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''} from Better Home Technology. Thinking of buying a property? ` +
        `Our pre-purchase electrical inspections protect buyers from hidden costs. From $299. ` +
        `Reply STOP to opt out. Call ${BHT_PHONE}.`,
    },
  ],
  energy_lite: [
    {
      day: 7,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''}, following up on your BHT energy report. ` +
        `Did the recommendations help? We can arrange an on-site energy audit for a personalised plan. Call ${BHT_PHONE}.`,
    },
    {
      day: 30,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''} from BHT. Our on-site energy audits give you a full solar, battery ` +
        `and efficiency plan tailored to your home. Government rebates may apply. Call ${BHT_PHONE} to learn more.`,
    },
    {
      day: 90,
      msg: (name) =>
        `Hi${name ? ' ' + name : ''} from Better Home Technology. ` +
        `We also offer pre-purchase and rental electrical safety inspections across SA. ` +
        `Reply STOP to opt out. Call ${BHT_PHONE}.`,
    },
  ],
};

async function ensureLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resale_followup_log (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type   VARCHAR(30) NOT NULL,  -- pre_purchase | rental | energy_lite
      source_id     UUID NOT NULL,         -- inspection or lead id
      sequence_day  INTEGER NOT NULL,
      phone         VARCHAR(50),
      sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_type, source_id, sequence_day)
    )
  `);
}

async function alreadySent(sourceType, sourceId, day) {
  const r = await pool.query(
    `SELECT 1 FROM resale_followup_log WHERE source_type=$1 AND source_id=$2 AND sequence_day=$3`,
    [sourceType, sourceId, day]
  );
  return r.rows.length > 0;
}

async function logSent(sourceType, sourceId, day, phone) {
  await pool.query(
    `INSERT INTO resale_followup_log (source_type, source_id, sequence_day, phone)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [sourceType, sourceId, day, phone]
  );
}

async function runPrePurchaseFollowups() {
  const seq = SEQUENCES.pre_purchase;
  for (const { day, msg } of seq) {
    try {
      const rows = await pool.query(
        `SELECT i.id, i.contact_phone, i.contact_name,
                (SELECT c.name FROM contacts c WHERE c.phone ILIKE '%' || RIGHT(i.contact_phone, 8) || '%' LIMIT 1) AS crm_name
         FROM pre_purchase_inspections i
         WHERE i.status = 'sent'
           AND i.contact_phone IS NOT NULL
           AND i.sent_at::date = CURRENT_DATE - INTERVAL '${day} days'`,
        []
      );
      for (const r of rows.rows) {
        if (await alreadySent('pre_purchase', r.id, day)) continue;
        const name = r.crm_name || r.contact_name || null;
        const firstName = name ? name.split(' ')[0] : null;
        try {
          await sendSMS(r.contact_phone, msg(firstName));
          await logSent('pre_purchase', r.id, day, r.contact_phone);
          console.log(`[resale] pre_purchase D+${day} sent to ${r.contact_phone}`);
        } catch (smsErr) {
          console.warn(`[resale] pre_purchase D+${day} SMS failed:`, smsErr.message);
        }
      }
    } catch (e) {
      console.error(`[resale] pre_purchase D+${day} query failed:`, e.message);
    }
  }
}

async function runRentalFollowups() {
  const seq = SEQUENCES.rental;
  for (const { day, msg } of seq) {
    try {
      const rows = await pool.query(
        `SELECT i.id, i.contact_phone, i.contact_name
         FROM rental_inspections i
         WHERE i.status = 'sent'
           AND i.contact_phone IS NOT NULL
           AND i.sent_at::date = CURRENT_DATE - INTERVAL '${day} days'`,
        []
      );
      for (const r of rows.rows) {
        if (await alreadySent('rental', r.id, day)) continue;
        const firstName = r.contact_name ? r.contact_name.split(' ')[0] : null;
        try {
          await sendSMS(r.contact_phone, msg(firstName));
          await logSent('rental', r.id, day, r.contact_phone);
          console.log(`[resale] rental D+${day} sent to ${r.contact_phone}`);
        } catch (smsErr) {
          console.warn(`[resale] rental D+${day} SMS failed:`, smsErr.message);
        }
      }
    } catch (e) {
      console.error(`[resale] rental D+${day} query failed:`, e.message);
    }
  }
}

async function runEnergyFollowups() {
  const seq = SEQUENCES.energy_lite;
  for (const { day, msg } of seq) {
    try {
      // Energy leads in CRM leads table with product_type = 'energy_lite' and status = 'qualified'
      const rows = await pool.query(
        `SELECT l.id, c.phone, c.name
         FROM leads l
         JOIN contacts c ON c.id = l.contact_id
         WHERE l.product_type = 'energy_lite'
           AND l.status = 'qualified'
           AND c.phone IS NOT NULL
           AND l.created_at::date = CURRENT_DATE - INTERVAL '${day} days'`,
        []
      );
      for (const r of rows.rows) {
        if (await alreadySent('energy_lite', r.id, day)) continue;
        const firstName = r.name ? r.name.split(' ')[0] : null;
        try {
          await sendSMS(r.phone, msg(firstName));
          await logSent('energy_lite', r.id, day, r.phone);
          console.log(`[resale] energy_lite D+${day} sent to ${r.phone}`);
        } catch (smsErr) {
          console.warn(`[resale] energy_lite D+${day} SMS failed:`, smsErr.message);
        }
      }
    } catch (e) {
      console.error(`[resale] energy_lite D+${day} query failed:`, e.message);
    }
  }
}

async function runResaleSequence() {
  console.log('[resale] Running re-sale follow-up sequences…');
  try {
    await ensureLogTable();
    await Promise.all([
      runPrePurchaseFollowups(),
      runRentalFollowups(),
      runEnergyFollowups(),
    ]);
    console.log('[resale] Done.');
  } catch (e) {
    console.error('[resale] Scheduler error:', e.message);
  }
}

module.exports = { runResaleSequence };
