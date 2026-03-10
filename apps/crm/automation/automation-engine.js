/**
 * Automation Engine
 * Runs daily: loads customers, evaluates triggers, sends SMS, logs communications.
 * Entrypoint for cron on Railway.
 */

require('../lib/load-env');
const { getAllTriggers, renderTemplate } = require('./triggers');
const { sendSMS } = require('@bht/integrations');
const { pool } = require('../lib/db');

async function runAutomations() {
  const triggers = getAllTriggers();
  let sent = 0;
  let errors = 0;

  for (const trigger of triggers) {
    try {
      const customers = await trigger.evaluate();
      for (const customer of customers) {
        try {
          const companyPhone = process.env.COMPANY_PHONE || '';
          const message = renderTemplate(trigger.template, {
            name: customer.name || 'there',
            phone: customer.phone,
            company_phone: companyPhone,
            company_phone_line: companyPhone ? `\nCall or text us: ${companyPhone}` : '',
          });

          const { sid, status } = await sendSMS(customer.phone, message);

          await logCommunication(customer.id, 'sms', trigger.name, message, sid, status);
          sent++;
          console.log(`Sent ${trigger.name} to ${customer.name} (${customer.phone})`);
        } catch (err) {
          errors++;
          console.error(`Failed to send ${trigger.name} to ${customer.id}:`, err.message);
          await logCommunication(customer.id, 'sms', trigger.name, null, null, 'failed');
        }
      }
    } catch (err) {
      console.error(`Trigger ${trigger.name} evaluate error:`, err);
      errors++;
    }
  }

  return { sent, errors };
}

async function logCommunication(customerId, channel, templateName, messageContent, externalId, deliveryStatus) {
  const db = await pool.connect();
  try {
    await db.query(
      `INSERT INTO communications (customer_id, channel, template_name, message_content, delivery_status, external_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerId, channel, templateName, messageContent || '', deliveryStatus || 'pending', externalId]
    );
  } finally {
    db.release();
  }
}

async function run() {
  console.log('Starting automation engine...');
  const { sent, errors } = await runAutomations();
  console.log(`Done. Sent: ${sent}, Errors: ${errors}`);
  await pool.end();
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Automation failed:', err);
    process.exit(1);
  });
}

module.exports = { runAutomations, logCommunication };
