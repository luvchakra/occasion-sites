const express = require('express');
const gh = require('../lib/github');
const { supabase, orThrow, mapCustomer } = require('../lib/db');
const { newId } = require('../lib/id');

const router = express.Router();
const UPLOADS_PREFIX = 'admin-data/uploads';

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

router.get('/', ah(async (req, res) => {
  const { data: customers, error } = await supabase.from('customers').select('*');
  orThrow(error);
  const { data: orders, error: oErr } = await supabase.from('orders').select('customer_id');
  orThrow(oErr);
  const counts = new Map();
  for (const o of orders) counts.set(o.customer_id, (counts.get(o.customer_id) || 0) + 1);
  res.json(customers.map((c) => ({ ...mapCustomer(c), orderCount: counts.get(c.id) || 0 })));
}));

router.get('/:id', ah(async (req, res) => {
  const { data, error } = await supabase.from('customers').select('*').eq('id', req.params.id).maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Customer not found' });
  res.json(mapCustomer(data));
}));

router.post('/', ah(async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('customers')
    .insert({ id: newId('cust'), name, email: email || '', phone: phone || '', created_at: now, updated_at: now })
    .select()
    .single();
  orThrow(error);
  res.status(201).json(mapCustomer(data));
}));

router.put('/:id', ah(async (req, res) => {
  const { name, email, phone } = req.body;
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (email !== undefined) patch.email = email;
  if (phone !== undefined) patch.phone = phone;
  const { data, error } = await supabase.from('customers').update(patch).eq('id', req.params.id).select().maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Customer not found' });
  res.json(mapCustomer(data));
}));

// Deletes the customer AND every order they have (plus those orders'
// invoices, via ON DELETE CASCADE, and their uploaded photos) — a customer
// with no orders left behind would just be dead weight.
router.delete('/:id', ah(async (req, res) => {
  const { data: orders, error: oErr } = await supabase.from('orders').select('id').eq('customer_id', req.params.id);
  orThrow(oErr);
  const { data: deleted, error } = await supabase.from('customers').delete().eq('id', req.params.id).select();
  orThrow(error);
  if (!deleted.length) return res.status(404).json({ error: 'Customer not found' });
  for (const o of orders) {
    await gh.deleteDir(`${UPLOADS_PREFIX}/${o.id}`, `Remove uploads for deleted order ${o.id}`);
  }
  res.status(204).end();
}));

module.exports = router;
