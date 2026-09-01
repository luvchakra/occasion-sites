const express = require('express');
const { withDb } = require('../lib/store');
const { listOccasions } = require('../lib/occasions');
const { slugify } = require('../lib/id');

const router = express.Router();

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 400).json({ error: err.message }));

router.get('/', ah(async (req, res) => {
  res.json(await listOccasions());
}));

router.post('/', ah(async (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'label is required' });
  const code = slugify(label);

  const occasion = await withDb((db) => {
    const existing = db.occasions.find((o) => o.code === code);
    if (existing) return existing;
    const record = { code, label };
    db.occasions.push(record);
    return record;
  });

  res.status(201).json(occasion);
}));

module.exports = router;
