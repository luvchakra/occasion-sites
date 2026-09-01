const path = require('path');
const fs = require('fs');
const express = require('express');

loadEnvFile(path.join(__dirname, '.env'));

const gh = require('./lib/github');
const { supabase, orThrow, mapSettings } = require('./lib/db');
const { getTemplate, getTemplateHtml } = require('./lib/templates');
const { renderSite } = require('./lib/render');

const templatesRouter = require('./routes/templates');
const customersRouter = require('./routes/customers');
const ordersRouter = require('./routes/orders');
const invoicesRouter = require('./routes/invoices');
const occasionsRouter = require('./routes/occasions');

const app = express();
const PORT = process.env.PORT || 4000;
const UPLOADS_PREFIX = 'admin-data/uploads';

const MIME_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4' };

// This tool can create/publish customer sites and holds customer contact
// info — it's worth protecting once it's reachable at a public URL. Set
// ADMIN_USER + ADMIN_PASSWORD (e.g. as Vercel env vars) to require a login;
// left unset, it runs open (fine for local-only use on your own machine).
app.use((req, res, next) => {
  const { ADMIN_USER, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USER || !ADMIN_PASSWORD) return next();

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    if (user === ADMIN_USER && pass === ADMIN_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Occasion Sites Admin"');
  res.status(401).send('Authentication required');
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/templates', templatesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/occasions', occasionsRouter);
app.use('/api/invoices', invoicesRouter);

const ah = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(err.status === 404 ? 404 : 500).send(err.message);
});

// Business profile shown on invoices (name/address/contact for the letterhead).
app.get('/api/settings', ah(async (req, res) => {
  const { data, error } = await supabase.from('settings').select('*').eq('id', true).maybeSingle();
  orThrow(error);
  res.json(mapSettings(data));
}));
app.put('/api/settings', ah(async (req, res) => {
  const { businessName, address, email, phone, paymentDetails } = req.body;
  const patch = {};
  if (businessName !== undefined) patch.business_name = businessName;
  if (address !== undefined) patch.address = address;
  if (email !== undefined) patch.email = email;
  if (phone !== undefined) patch.phone = phone;
  if (paymentDetails !== undefined) patch.payment_details = paymentDetails;
  const { data, error } = await supabase.from('settings').update(patch).eq('id', true).select().single();
  orThrow(error);
  res.json(mapSettings(data));
}));

// Serves the photo thumbnails shown while editing an order's form: this
// order's uploads first, falling back to the template's own
// default/backdrop assets.
app.get('/preview-assets/:orderId/:type/:filename', ah(async (req, res) => {
  const { data: order, error } = await supabase.from('orders').select('id, template_id').eq('id', req.params.orderId).maybeSingle();
  orThrow(error);
  if (!order) return res.status(404).end();
  const { type, filename } = req.params;
  const contentType = MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';

  if (type === 'images') {
    try {
      const buf = await gh.getFileBuffer(`${UPLOADS_PREFIX}/${order.id}/${filename}`);
      res.set('Content-Type', contentType);
      return res.send(buf);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  const template = await getTemplate(order.template_id);
  if (!template) return res.status(404).end();
  try {
    const buf = await gh.getFileBuffer(`${template.dir}/assets/${type}/${filename}`);
    res.set('Content-Type', contentType);
    res.send(buf);
  } catch (err) {
    if (err.status !== 404) throw err;
    res.status(404).end();
  }
}));

// Renders a template on its OWN default content — no customer involved.
// Lets you preview a template right after uploading it, or compare
// templates before picking one for a new customer.
app.get('/preview-template/:id', ah(async (req, res) => {
  const template = await getTemplate(req.params.id);
  if (!template) return res.status(404).send('Template not found');
  const html = renderSite(await getTemplateHtml(req.params.id), template.schema, template.schema.defaultConfig);
  const withBase = html.replace('<head>', `<head>\n<base href="/preview-template-assets/${template.id}/">`);
  res.send(withBase);
}));

app.get('/preview-template-assets/:templateId/:type/:filename', ah(async (req, res) => {
  const { templateId, type, filename } = req.params;
  const contentType = MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const template = await getTemplate(templateId);
  if (!template) return res.status(404).end();
  try {
    const buf = await gh.getFileBuffer(`${template.dir}/assets/${type}/${filename}`);
    res.set('Content-Type', contentType);
    res.send(buf);
  } catch (err) {
    if (err.status !== 404) throw err;
    res.status(404).end();
  }
}));

// Vercel imports this file as a serverless function (see api/index.js) and
// calls the exported app directly — it never runs app.listen(). Only
// start a real listener for local/`npm start` use.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Occasion Sites admin running at http://localhost:${PORT}`);
  });
}

module.exports = app;

// Minimal .env loader (KEY=VALUE per line, # comments) — avoids adding a
// dependency just for this. No-op on Vercel (no .env file there; env vars
// come from the platform).
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
