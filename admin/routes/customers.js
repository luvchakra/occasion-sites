const express = require('express');
const gh = require('../lib/github');
const { withDb } = require('../lib/store');
const { newId } = require('../lib/id');

const router = express.Router();
const UPLOADS_PREFIX = 'admin-data/uploads';

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

router.get('/', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const withCounts = db.customers.map((c) => ({
    ...c,
    orderCount: db.orders.filter((o) => o.customerId === c.id).length
  }));
  res.json(withCounts);
}));

router.get('/:id', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.post('/', ah(async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const customer = await withDb((db) => {
    const record = {
      id: newId('cust'),
      name,
      email: email || '',
      phone: phone || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.customers.push(record);
    return record;
  });

  res.status(201).json(customer);
}));

router.put('/:id', ah(async (req, res) => {
  const { name, email, phone } = req.body;
  const customer = await withDb((db) => {
    const c = db.customers.find((x) => x.id === req.params.id);
    if (!c) return null;
    if (name !== undefined) c.name = name;
    if (email !== undefined) c.email = email;
    if (phone !== undefined) c.phone = phone;
    c.updatedAt = new Date().toISOString();
    return c;
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

// Deletes the customer AND every order they have (plus those orders'
// invoices and uploaded photos) — a customer with no orders left behind
// would just be dead weight.
router.delete('/:id', ah(async (req, res) => {
  const removedOrderIds = await withDb((db) => {
    const idx = db.customers.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return null;
    db.customers.splice(idx, 1);
    const orderIds = db.orders.filter((o) => o.customerId === req.params.id).map((o) => o.id);
    db.orders = db.orders.filter((o) => o.customerId !== req.params.id);
    db.invoices = db.invoices.filter((inv) => !orderIds.includes(inv.orderId));
    return orderIds;
  });
  if (removedOrderIds === null) return res.status(404).json({ error: 'Customer not found' });
  for (const orderId of removedOrderIds) {
    await gh.deleteDir(`${UPLOADS_PREFIX}/${orderId}`, `Remove uploads for deleted order ${orderId}`);
  }
  res.status(204).end();
}));

module.exports = router;
