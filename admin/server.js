const path = require('path');
const fs = require('fs');
const express = require('express');

loadEnvFile(path.join(__dirname, '.env'));

const { withDb } = require('./lib/store');
const { getTemplate, getTemplateHtml } = require('./lib/templates');
const { renderSite } = require('./lib/render');

const templatesRouter = require('./routes/templates');
const customersRouter = require('./routes/customers');
const invoicesRouter = require('./routes/invoices');

const app = express();
const PORT = process.env.PORT || 4000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/templates', templatesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/invoices', invoicesRouter);

// Business profile shown on invoices (name/address/contact for the letterhead).
app.get('/api/settings', (req, res) => {
  const db = withDb((d) => d);
  res.json(db.settings || {});
});
app.put('/api/settings', (req, res) => {
  const settings = withDb((db) => {
    db.settings = { ...(db.settings || {}), ...req.body };
    return db.settings;
  });
  res.json(settings);
});

// Renders a customer's site with their current (possibly unpublished) data,
// without touching the git repo — lets you check a draft before publishing.
app.get('/preview/:id', (req, res) => {
  const db = withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).send('Customer not found');
  const template = getTemplate(customer.templateId);
  if (!template) return res.status(404).send('Template not found');
  const html = renderSite(getTemplateHtml(customer.templateId), template.schema, customer.config);
  const withBase = html.replace('<head>', `<head>\n<base href="/preview-assets/${customer.id}/">`);
  res.send(withBase);
});

// Serves the images/videos a preview needs: this customer's uploads first,
// falling back to the template's own default/backdrop assets.
app.get('/preview-assets/:customerId/:type/:filename', (req, res) => {
  const db = withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.customerId);
  if (!customer) return res.status(404).end();
  const { type, filename } = req.params;

  if (type === 'images') {
    const uploaded = path.join(UPLOADS_DIR, customer.id, filename);
    if (fs.existsSync(uploaded)) return res.sendFile(uploaded);
  }
  const template = getTemplate(customer.templateId);
  const fallback = path.join(template.dir, 'assets', type, filename);
  if (fs.existsSync(fallback)) return res.sendFile(fallback);
  res.status(404).end();
});

app.listen(PORT, () => {
  console.log(`Occasion Sites admin running at http://localhost:${PORT}`);
});

// Minimal .env loader (KEY=VALUE per line, # comments) — avoids adding a
// dependency just for this.
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
