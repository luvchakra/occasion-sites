const express = require('express');
const multer = require('multer');
const gh = require('../lib/github');
const { withDb } = require('../lib/store');
const { getTemplate } = require('../lib/templates');
const { newId, slugify } = require('../lib/id');
const { publishOrder } = require('../lib/publish');

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

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

router.get('/', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const list = req.query.customerId
    ? db.orders.filter((o) => o.customerId === req.query.customerId)
    : db.orders;
  res.json(list);
}));

router.get('/:id', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

router.post('/', ah(async (req, res) => {
  const { customerId, title, templateId, occasionDate, slug } = req.body;
  if (!customerId || !title || !templateId) {
    return res.status(400).json({ error: 'customerId, title and templateId are required' });
  }
  const template = await getTemplate(templateId);
  if (!template) return res.status(400).json({ error: `Unknown template: ${templateId}` });

  const order = await withDb((db) => {
    if (!db.customers.some((c) => c.id === customerId)) return null;

    const baseSlug = slugify(slug || title);
    let finalSlug = baseSlug;
    let n = 2;
    while (db.orders.some((o) => o.slug === finalSlug)) finalSlug = `${baseSlug}-${n++}`;

    db.counters.order += 1;
    const record = {
      id: newId('order'),
      orderNumber: `ORD-${String(db.counters.order).padStart(4, '0')}`,
      customerId,
      title,
      occasionType: template.schema.occasionType,
      templateId,
      slug: finalSlug,
      occasionDate: occasionDate || '',
      status: 'draft',
      publishedPath: '',
      publicUrl: '',
      config: structuredClone(template.schema.defaultConfig || {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.orders.push(record);
    return record;
  });

  if (!order) return res.status(400).json({ error: 'Unknown customerId' });
  res.status(201).json(order);
}));

router.put('/:id', ah(async (req, res) => {
  const { title, occasionDate, config } = req.body;
  const order = await withDb((db) => {
    const o = db.orders.find((x) => x.id === req.params.id);
    if (!o) return null;
    if (title !== undefined) o.title = title;
    if (occasionDate !== undefined) o.occasionDate = occasionDate;
    if (config !== undefined) o.config = config;
    o.updatedAt = new Date().toISOString();
    return o;
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
}));

router.delete('/:id', ah(async (req, res) => {
  const removed = await withDb((db) => {
    const idx = db.orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) return false;
    db.orders.splice(idx, 1);
    db.invoices = db.invoices.filter((inv) => inv.orderId !== req.params.id);
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'Order not found' });
  await gh.deleteDir(`${UPLOADS_PREFIX}/${req.params.id}`, `Remove uploads for deleted order ${req.params.id}`);
  res.status(204).end();
}));

// Upload a photo for this order. Returns the relative path ("images/xxx.jpg")
// to store in the order's config at whichever field the client is editing.
router.post('/:id/photos', upload.single('photo'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
  const base = slugify(req.file.originalname.replace(/\.[a-z0-9]+$/i, ''));
  const filename = `${base}-${Date.now()}${ext}`;
  await gh.putFile(`${UPLOADS_PREFIX}/${req.params.id}/${filename}`, req.file.buffer, `Upload photo for order ${req.params.id}`);
  res.json({ path: `images/${filename}` });
}));

// List previously uploaded photos for this order (so the editor can offer
// "reuse an existing upload" instead of re-uploading for every field).
router.get('/:id/photos', ah(async (req, res) => {
  const files = await gh.listDir(`${UPLOADS_PREFIX}/${req.params.id}`);
  res.json(files.map((f) => `images/${f.name}`));
}));

router.post('/:id/publish', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const result = await publishOrder(order);
  const publicUrl = `${process.env.PUBLIC_BASE_URL || ''}/${order.slug}/`;
  await withDb((d) => {
    const o = d.orders.find((x) => x.id === req.params.id);
    o.status = 'published';
    o.publishedPath = result.path || o.publishedPath;
    o.publicUrl = publicUrl;
    o.updatedAt = new Date().toISOString();
  });
  res.json({ ...result, publicUrl });
}));

module.exports = router;
