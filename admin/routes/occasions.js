const express = require('express');
const { supabase, orThrow } = require('../lib/db');
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

  const { data: existing, error: eErr } = await supabase.from('occasions').select('*').eq('code', code).maybeSingle();
  orThrow(eErr);
  if (existing) return res.status(201).json({ code: existing.code, label: existing.label });

  const { data, error } = await supabase.from('occasions').insert({ code, label }).select().single();
  orThrow(error);
  res.status(201).json({ code: data.code, label: data.label });
}));

module.exports = router;
