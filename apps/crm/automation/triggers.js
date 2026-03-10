/**
 * Automation Triggers
 * Defines when each automation should fire. Domain logic lives here; adapters in @bht/integrations.
 */

const { pool } = require('../lib/db');

const TRIGGERS = {
  JOB_COMPLETED_THANKYOU: {
    name: 'JOB_COMPLETED_THANKYOU',
    template: `Hi {{name}},
Thanks for choosing Better Home Technology.
If you ever need electrical upgrades, lighting, or EV charger installation, feel free to reach out.
{{company_phone_line}}

Meng`,
    async evaluate() {
      const result = await pool.query(
        `SELECT c.id, c.name, c.phone
         FROM customers c
         JOIN jobs j ON j.customer_id = c.id
         WHERE j.completed_at IS NOT NULL
           AND j.completed_at >= NOW() - INTERVAL '2 days'
           AND c.phone IS NOT NULL AND c.phone != ''
           AND NOT EXISTS (
             SELECT 1 FROM communications comm
             WHERE comm.customer_id = c.id
               AND comm.template_name = 'JOB_COMPLETED_THANKYOU'
               AND comm.sent_at >= NOW() - INTERVAL '365 days'
           )`
      );
      return result.rows;
    },
  },
  INACTIVE_12_MONTHS: {
    name: 'INACTIVE_12_MONTHS',
    template: `Hi {{name}},
It's been a while since we last helped with electrical work.
If you need help with lighting upgrades, EV chargers or power improvements, feel free to contact us.
{{company_phone_line}}

Meng`,
    async evaluate() {
      const result = await pool.query(
        `SELECT id, name, phone
         FROM customers
         WHERE last_job_date IS NOT NULL
           AND last_job_date < NOW() - INTERVAL '365 days'
           AND phone IS NOT NULL AND phone != ''
           AND NOT EXISTS (
             SELECT 1 FROM communications comm
             WHERE comm.customer_id = customers.id
               AND comm.template_name = 'INACTIVE_12_MONTHS'
               AND comm.sent_at >= NOW() - INTERVAL '365 days'
           )`
      );
      return result.rows;
    },
  },
};

function getTrigger(name) {
  return TRIGGERS[name];
}

function getAllTriggers() {
  return Object.values(TRIGGERS);
}

function renderTemplate(template, data) {
  let result = template;
  for (const [key, val] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val ?? ''));
  }
  return result;
}

module.exports = {
  TRIGGERS,
  getTrigger,
  getAllTriggers,
  renderTemplate,
};
