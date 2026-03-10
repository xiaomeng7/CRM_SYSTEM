/**
 * CRM API Server
 * REST API for customers, jobs, and internal operations.
 * Deploy target: Railway.
 */

require('../lib/load-env');
const path = require('path');
const express = require('express');
const customers = require('./customers');
const jobs = require('./jobs');
const leadsRouter = require('./routes/leads');
const opportunitiesRouter = require('./routes/opportunities');

const app = express();
app.use(express.json());

// Internal CRM UI (static; dashboard at /)
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/leads', leadsRouter);
app.use('/api/opportunities', opportunitiesRouter);

app.get('/api/customers', async (req, res) => {
  try {
    const rows = await customers.listCustomers({
      suburb: req.query.suburb,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const row = await customers.getCustomerById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    const row = await customers.updateCustomerTags(parseInt(req.params.id, 10), tags);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const rows = await jobs.listJobs({
      customerId: req.query.customer_id ? parseInt(req.query.customer_id, 10) : undefined,
      status: req.query.status,
      fromDate: req.query.from_date,
      toDate: req.query.to_date,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const row = await jobs.getJobById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CRM API running on http://localhost:${PORT}`);
});
