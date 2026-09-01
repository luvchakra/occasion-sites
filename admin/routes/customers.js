const express = require('express');
const multer = require('multer');
const gh = require('../lib/github');
const { withDb } = require('../lib/store');
const { getTemplate } = require('../lib/templates');
const { newId, slugify } = require('../lib/id');
const { publishCustomer } = require('../lib/publish');

const router = express.Router();
const UPLOADS_PREFIX = 'admin-data/uploads';

// Vercel functions have no persistent local disk, so uploads are held in
// memory just long enough to be committed straight to the GitHub repo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

// Wraps an async route handler so a rejected promise becomes a proper
// 500 response instead of an unhandled rejection (Express 4 doesn't do
// this automatically).
const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

router.get('/', ah(async (req, res) => {
  const db = await withDb((d) => d);
  res.json(db.customers);
}));

router.get('/:id', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.post('/', ah(async (req, res) => {
  const { name, email, phone, templateId, occasionDate, slug } = req.body;
  if (!name || !templateId) return res.status(400).json({ error: 'name and templateId are required' });
  const template = getTemplate(templateId);
  if (!template) return res.status(400).json({ error: `Unknown template: ${templateId}` });

  const customer = await withDb((db) => {
    const baseSlug = slugify(slug || name);
    let finalSlug = baseSlug;
    let n = 2;
    while (db.customers.some((c) => c.slug === finalSlug)) finalSlug = `${baseSlug}-${n++}`;

    const record = {
      id: newId('cust'),
      name,
      email: email || '',
      phone: phone || '',
      occasionType: template.schema.occasionType,
      templateId,
      slug: finalSlug,
      occasionDate: occasionDate || '',
      status: 'draft',
      publishedPath: '',
      config: structuredClone(template.schema.defaultConfig || {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.customers.push(record);
    return record;
  });

  res.status(201).json(customer);
}));

router.put('/:id', ah(async (req, res) => {
  const { name, email, phone, occasionDate, config } = req.body;
  const customer = await withDb((db) => {
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) return null;
    if (name !== undefined) c.name = name;
    if (email !== undefined) c.email = email;
    if (phone !== undefined) c.phone = phone;
    if (occasionDate !== undefined) c.occasionDate = occasionDate;
    if (config !== undefined) c.config = config;
    c.updatedAt = new Date().toISOString();
    return c;
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.delete('/:id', ah(async (req, res) => {
  const removed = await withDb((db) => {
    const idx = db.customers.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return false;
    db.customers.splice(idx, 1);
    db.invoices = db.invoices.filter((inv) => inv.customerId !== req.params.id);
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'Customer not found' });
  await gh.deleteDir(`${UPLOADS_PREFIX}/${req.params.id}`, `Remove uploads for deleted customer ${req.params.id}`);
  res.status(204).end();
}));

// Upload a photo for this customer. Returns the relative path ("images/xxx.jpg")
// to store in the customer's config at whichever field the client is editing.
router.post('/:id/photos', upload.single('photo'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
  const base = slugify(req.file.originalname.replace(/\.[a-z0-9]+$/i, ''));
  const filename = `${base}-${Date.now()}${ext}`;
  await gh.putFile(`${UPLOADS_PREFIX}/${req.params.id}/${filename}`, req.file.buffer, `Upload photo for customer ${req.params.id}`);
  res.json({ path: `images/${filename}` });
}));

// List previously uploaded photos for this customer (so the editor can offer
// "reuse an existing upload" instead of re-uploading for every field).
router.get('/:id/photos', ah(async (req, res) => {
  const files = await gh.listDir(`${UPLOADS_PREFIX}/${req.params.id}`);
  res.json(files.map((f) => `images/${f.name}`));
}));

router.post('/:id/publish', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const result = await publishCustomer(customer);
  const publicUrl = `${process.env.PUBLIC_BASE_URL || ''}/${customer.slug}/`;
  await withDb((d) => {
    const c = d.customers.find((x) => x.id === req.params.id);
    c.status = 'published';
    c.publishedPath = result.path || c.publishedPath;
    c.publicUrl = publicUrl;
    c.updatedAt = new Date().toISOString();
  });
  res.json({ ...result, publicUrl });
}));

module.exports = router;
