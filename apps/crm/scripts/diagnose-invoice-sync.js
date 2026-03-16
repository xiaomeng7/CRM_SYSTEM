#!/usr/bin/env node
/**
 * Invoice Sync 诊断：打印 getInvoices() 与 getJobs() 的响应形态，便于确认 API 是否返回发票数据、job 是否带财务字段。
 * Usage: node scripts/diagnose-invoice-sync.js
 */

require('../lib/load-env');
const { ServiceM8Client } = require('@bht/integrations');

function toArray(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.data) ? raw.data : raw != null ? [raw] : [];
}

function sampleKeys(obj, prefix = '') {
  if (obj == null || typeof obj !== 'object') return prefix + String(obj);
  const keys = Object.keys(obj).slice(0, 25);
  return keys.map((k) => `${k}: ${typeof obj[k]}`).join(', ');
}

async function main() {
  console.log('--- Invoice Sync Diagnostic ---\n');
  let client;
  try {
    client = new ServiceM8Client();
  } catch (e) {
    console.error('ServiceM8 client init failed (missing SERVICEM8_API_KEY?):', e.message);
    process.exit(1);
  }

  // 1. getInvoices()
  console.log('1. GET invoice.json');
  try {
    const raw = await client.getInvoices('');
    const arr = toArray(raw);
    console.log('   Response type:', Array.isArray(raw) ? 'array' : typeof raw);
    console.log('   toArray length:', arr.length);
    if (arr.length > 0) {
      console.log('   First item keys:', sampleKeys(arr[0]));
    } else {
      console.log('   First item keys: (empty)');
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        console.log('   Raw keys:', Object.keys(raw).join(', '));
      }
    }
  } catch (e) {
    console.log('   Error:', e.message);
    console.log('   (invoice.json may not exist or not authorised)');
  }

  // 2. getJobs()
  console.log('\n2. GET job.json');
  try {
    const raw = await client.getJobs('');
    const arr = toArray(raw);
    console.log('   Response type:', Array.isArray(raw) ? 'array' : typeof raw);
    console.log('   toArray length:', arr.length);
    if (arr.length > 0) {
      const first = arr[0];
      console.log('   First item keys:', sampleKeys(first));
      const invoiceLike = ['total_invoice_amount', 'invoice_total', 'invoice_number', 'date_invoiced', 'invoice_date', 'amount', 'total', 'invoice_status'];
      const found = invoiceLike.filter((k) => first[k] !== undefined);
      if (found.length) console.log('   Invoice-like fields on job:', found.join(', '));
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n--- Done ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
