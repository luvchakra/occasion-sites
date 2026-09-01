const express = require('express');
const multer = require('multer');
const gh = require('../lib/github');
const { supabase, orThrow, mapOrder } = require('../lib/db');
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
  let query = supabase.from('orders').select('*');
  if (req.query.customerId) query = query.eq('customer_id', req.query.customerId);
  const { data, error } = await query;
  orThrow(error);
  res.json(data.map(mapOrder));
}));

router.get('/:id', ah(async (req, res) => {
  const { data, error } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Order not found' });
  res.json(mapOrder(data));
}));

router.post('/', ah(async (req, res) => {
  const { customerId, title, templateId, occasionDate, slug } = req.body;
  if (!customerId || !title || !templateId) {
    return res.status(400).json({ error: 'customerId, title and templateId are required' });
  }
  const template = await getTemplate(templateId);
  if (!template) return res.status(400).json({ error: `Unknown template: ${templateId}` });

  const { data: customer, error: cErr } = await supabase.from('customers').select('id').eq('id', customerId).maybeSingle();
  orThrow(cErr);
  if (!customer) return res.status(400).json({ error: 'Unknown customerId' });

  const { data: existingSlugs, error: sErr } = await supabase.from('orders').select('slug');
  orThrow(sErr);
  const taken = new Set(existingSlugs.map((o) => o.slug));
  const baseSlug = slugify(slug || title);
  let finalSlug = baseSlug;
  let n = 2;
  while (taken.has(finalSlug)) finalSlug = `${baseSlug}-${n++}`;

  const { data: orderNumber, error: nErr } = await supabase.rpc('next_order_number');
  orThrow(nErr);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .insert({
      id: newId('order'),
      order_number: orderNumber,
      customer_id: customerId,
      title,
      occasion_type: template.schema.occasionType,
      template_id: templateId,
      slug: finalSlug,
      occasion_date: occasionDate || null,
      status: 'draft',
      published_path: '',
      public_url: '',
      config: structuredClone(template.schema.defaultConfig || {}),
      created_at: now,
      updated_at: now
    })
    .select()
    .single();
  orThrow(error);
  res.status(201).json(mapOrder(data));
}));

router.put('/:id', ah(async (req, res) => {
  const { title, occasionDate, config } = req.body;
  const patch = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title;
  if (occasionDate !== undefined) patch.occasion_date = occasionDate || null;
  if (config !== undefined) patch.config = config;
  const { data, error } = await supabase.from('orders').update(patch).eq('id', req.params.id).select().maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Order not found' });
  res.json(mapOrder(data));
}));

router.delete('/:id', ah(async (req, res) => {
  const { data: deleted, error } = await supabase.from('orders').delete().eq('id', req.params.id).select();
  orThrow(error);
  if (!deleted.length) return res.status(404).json({ error: 'Order not found' });
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
  const { data, error } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Order not found' });
  const order = mapOrder(data);
  const result = await publishOrder(order);
  const publicUrl = `${process.env.PUBLIC_BASE_URL || ''}/${order.slug}/`;
  const { error: uErr } = await supabase
    .from('orders')
    .update({ status: 'published', published_path: result.path || order.publishedPath, public_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  orThrow(uErr);
  res.json({ ...result, publicUrl });
}));

module.exports = router;
