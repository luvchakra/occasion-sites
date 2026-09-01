const express = require('express');
const { withDb } = require('../lib/store');
const { newId } = require('../lib/id');

const router = express.Router();

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

function total(items) {
  return (items || []).reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
}

router.get('/', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const list = req.query.customerId
    ? db.invoices.filter((i) => i.customerId === req.query.customerId)
    : db.invoices;
  res.json(list.map((i) => ({ ...i, total: total(i.items) })));
}));

router.get('/:id', ah(async (req, res) => {
  const db = await withDb((d) => d);
  const invoice = db.invoices.find((i) => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const customer = db.customers.find((c) => c.id === invoice.customerId) || null;
  res.json({ ...invoice, total: total(invoice.items), customer });
}));

router.post('/', ah(async (req, res) => {
  const { customerId, issueDate, dueDate, items, notes, status } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const invoice = await withDb((db) => {
    if (!db.customers.some((c) => c.id === customerId)) return null;
    db.counters.invoice += 1;
    const record = {
      id: newId('inv'),
      invoiceNumber: `INV-${String(db.counters.invoice).padStart(4, '0')}`,
      customerId,
      issueDate: issueDate || new Date().toISOString().slice(0, 10),
      dueDate: dueDate || '',
      items: Array.isArray(items) ? items : [],
      notes: notes || '',
      status: status || 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.invoices.push(record);
    return record;
  });

  if (!invoice) return res.status(400).json({ error: 'Unknown customerId' });
  res.status(201).json({ ...invoice, total: total(invoice.items) });
}));

router.put('/:id', ah(async (req, res) => {
  const { issueDate, dueDate, items, notes, status } = req.body;
  const invoice = await withDb((db) => {
    const inv = db.invoices.find((i) => i.id === req.params.id);
    if (!inv) return null;
    if (issueDate !== undefined) inv.issueDate = issueDate;
    if (dueDate !== undefined) inv.dueDate = dueDate;
    if (items !== undefined) inv.items = items;
    if (notes !== undefined) inv.notes = notes;
    if (status !== undefined) inv.status = status;
    inv.updatedAt = new Date().toISOString();
    return inv;
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ ...invoice, total: total(invoice.items) });
}));

router.delete('/:id', ah(async (req, res) => {
  const removed = await withDb((db) => {
    const idx = db.invoices.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return false;
    db.invoices.splice(idx, 1);
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'Invoice not found' });
  res.status(204).end();
}));

module.exports = router;
