#!/usr/bin/env node
/**
 * Backfill CRM contacts.phone from ServiceM8 for contacts whose account has a ServiceM8 link.
 * Only updates when CRM phone is empty but ServiceM8 has mobile/phone.
 * Usage: node scripts/backfill-contact-phone-from-servicem8.js
 * DRY_RUN=true: preview only, no updates
 */

require('../lib/load-env');
const { pool } = require('../lib/db');
const { ServiceM8Client } = require('@bht/integrations');
const { normalizePhone } = require('../lib/crm/cleaning');

function toArray(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.data) ? raw.data : [raw].filter(Boolean);
}

function normalizeNameForMatch(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  const stats = { scanned: 0, updated: 0, still_no_phone: 0, skipped_no_match: 0, skipped_invalid: 0, errors: 0 };

  try {
    const client = new ServiceM8Client();
    let companyContactsRaw;
    try {
      companyContactsRaw = await client.getCompanyContacts();
    } catch (err) {
      console.error('ServiceM8 getCompanyContacts failed:', err.message);
      process.exitCode = 1;
      return;
    }
    const companyContacts = toArray(companyContactsRaw);

    const byCompany = new Map();
    for (const cc of companyContacts) {
      const companyUuid = cc.company_uuid || cc.companyUUID || cc.company;
      if (!companyUuid) continue;
      const first = (cc.first || cc.first_name || cc.firstName || '').trim();
      const last = (cc.last || cc.last_name || cc.lastName || '').trim();
      const name = [first, last].filter(Boolean).join(' ') || (cc.name || '').trim() || null;
      const raw = {
        company_uuid: companyUuid,
        name,
        email: (cc.email || '').trim().toLowerCase() || null,
        mobile: (cc.mobile || cc.Mobile || '').trim() || null,
        phone: (cc.phone || cc.Phone || cc.phone_number || '').trim() || null,
      };
      raw.bestPhone = raw.mobile || raw.phone || null;
      if (!byCompany.has(companyUuid)) byCompany.set(companyUuid, []);
      byCompany.get(companyUuid).push(raw);
    }

    const companyToAccount = await pool.query(
      `SELECT external_id AS company_uuid, entity_id AS account_id FROM external_links WHERE system = 'servicem8' AND external_entity_type = 'company' AND entity_type = 'account'`
    );
    const uuidToAccount = new Map();
    for (const r of companyToAccount.rows) uuidToAccount.set(r.company_uuid, r.account_id);

    const crmContacts = await pool.query(
      `SELECT c.id, c.account_id, c.name, c.email, c.phone FROM contacts c WHERE c.account_id IS NOT NULL`
    );

    for (const row of crmContacts.rows) {
      const crmPhone = (row.phone || '').trim();
      if (crmPhone) continue;

      const accountId = row.account_id;
      const companyUuid = [...uuidToAccount.entries()].find(([, aid]) => String(aid) === String(accountId))?.[0];
      if (!companyUuid) continue;

      stats.scanned++;
      const sm8List = byCompany.get(companyUuid) || [];
      const crmNameNorm = normalizeNameForMatch(row.name);
      const crmEmailNorm = (row.email || '').trim().toLowerCase();

      let matched = null;
      for (const sm of sm8List) {
        if (sm.bestPhone && (normalizeNameForMatch(sm.name) === crmNameNorm || (crmEmailNorm && sm.email === crmEmailNorm))) {
          matched = sm;
          break;
        }
      }
      if (!matched) {
        if (sm8List.length === 1 && sm8List[0].bestPhone) matched = sm8List[0];
      }
      if (!matched || !matched.bestPhone) {
        stats.skipped_no_match++;
        continue;
      }

      const normalized = normalizePhone(matched.bestPhone);
      if (!normalized) {
        stats.skipped_invalid++;
        continue;
      }

      if (!dryRun) {
        try {
          await pool.query(
            `UPDATE contacts SET phone = $1, updated_at = NOW() WHERE id = $2`,
            [normalized, row.id]
          );
          stats.updated++;
        } catch (err) {
          stats.errors++;
          console.error('Update error for contact', row.id, err.message);
        }
      } else {
        stats.updated++;
      }
    }

    const stillNoPhone = await pool.query(
      `SELECT COUNT(*) AS cnt FROM contacts c JOIN accounts a ON a.id = c.account_id
       WHERE (c.phone IS NULL OR TRIM(COALESCE(c.phone,'')) = '')
         AND EXISTS (SELECT 1 FROM external_links el WHERE el.system = 'servicem8' AND el.external_entity_type = 'company' AND el.entity_type = 'account' AND el.entity_id = a.id)`
    );
    stats.still_no_phone = Number(stillNoPhone.rows[0]?.cnt ?? 0);

    console.log('Backfill contact phone from ServiceM8' + (dryRun ? ' (DRY_RUN)' : ''));
    console.log('Contacts scanned (CRM empty phone, account has ServiceM8 link):', stats.scanned);
    console.log('Contacts updated:', stats.updated);
    console.log('Contacts still without phone:', stats.still_no_phone);
    console.log('Skipped (no ServiceM8 match):', stats.skipped_no_match);
    console.log('Skipped (invalid phone):', stats.skipped_invalid);
    if (stats.errors) console.log('Errors:', stats.errors);
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  }
}

main();
