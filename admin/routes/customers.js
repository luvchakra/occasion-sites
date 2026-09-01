const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { withDb } = require('../lib/store');
const { getTemplate } = require('../lib/templates');
const { newId, slugify } = require('../lib/id');
const { publishCustomer } = require('../lib/publish');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const base = slugify(path.basename(file.originalname, path.extname(file.originalname)));
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are allowed'));
    cb(null, true);
  }
});

router.get('/', (req, res) => {
  const db = withDb((d) => d);
  res.json(db.customers);
});

router.get('/:id', (req, res) => {
  const db = withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

router.post('/', (req, res) => {
  const { name, email, phone, templateId, occasionDate, slug } = req.body;
  if (!name || !templateId) return res.status(400).json({ error: 'name and templateId are required' });
  const template = getTemplate(templateId);
  if (!template) return res.status(400).json({ error: `Unknown template: ${templateId}` });

  const customer = withDb((db) => {
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
});

router.put('/:id', (req, res) => {
  const { name, email, phone, occasionDate, config } = req.body;
  const customer = withDb((db) => {
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
});

router.delete('/:id', (req, res) => {
  const removed = withDb((db) => {
    const idx = db.customers.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return false;
    db.customers.splice(idx, 1);
    db.invoices = db.invoices.filter((inv) => inv.customerId !== req.params.id);
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'Customer not found' });
  const dir = path.join(UPLOADS_DIR, req.params.id);
  fs.rmSync(dir, { recursive: true, force: true });
  res.status(204).end();
});

// Upload a photo for this customer. Returns the relative path ("images/xxx.jpg")
// to store in the customer's config at whichever field the client is editing.
router.post('/:id/photos', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ path: `images/${req.file.filename}` });
});

// List previously uploaded photos for this customer (so the editor can offer
// "reuse an existing upload" instead of re-uploading for every field).
router.get('/:id/photos', (req, res) => {
  const dir = path.join(UPLOADS_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).map((f) => `images/${f}`);
  res.json(files);
});

router.post('/:id/publish', (req, res) => {
  const db = withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  try {
    const result = publishCustomer(customer);
    const publicUrl = `${process.env.PUBLIC_BASE_URL || ''}/${customer.slug}/`;
    withDb((d) => {
      const c = d.customers.find((x) => x.id === req.params.id);
      c.status = 'published';
      c.publishedPath = result.path || c.publishedPath;
      c.publicUrl = publicUrl;
      c.updatedAt = new Date().toISOString();
    });
    res.json({ ...result, publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
