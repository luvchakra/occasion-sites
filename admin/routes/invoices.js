const express = require('express');
const { supabase, orThrow, mapInvoice, mapOrder, mapCustomer } = require('../lib/db');
const { newId } = require('../lib/id');

const router = express.Router();

const ah = (fn) => (req, res) => fn(req, res).catch((err) => res.status(err.status === 404 ? 404 : 500).json({ error: err.message }));

function total(items) {
  return (items || []).reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
}

router.get('/', ah(async (req, res) => {
  let query = supabase.from('invoices').select('*');
  if (req.query.orderId) query = query.eq('order_id', req.query.orderId);
  const { data, error } = await query;
  orThrow(error);
  res.json(data.map((i) => ({ ...mapInvoice(i), total: total(i.items) })));
}));

router.get('/:id', ah(async (req, res) => {
  const { data: invRow, error } = await supabase.from('invoices').select('*').eq('id', req.params.id).maybeSingle();
  orThrow(error);
  if (!invRow) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = mapInvoice(invRow);

  let order = null;
  let customer = null;
  const { data: orderRow, error: oErr } = await supabase.from('orders').select('*').eq('id', invoice.orderId).maybeSingle();
  orThrow(oErr);
  if (orderRow) {
    order = mapOrder(orderRow);
    const { data: custRow, error: cErr } = await supabase.from('customers').select('*').eq('id', order.customerId).maybeSingle();
    orThrow(cErr);
    if (custRow) customer = mapCustomer(custRow);
  }

  res.json({ ...invoice, total: total(invoice.items), order, customer });
}));

router.post('/', ah(async (req, res) => {
  const { orderId, issueDate, dueDate, items, notes, status } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const { data: order, error: oErr } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
  orThrow(oErr);
  if (!order) return res.status(400).json({ error: 'Unknown orderId' });

  const { data: invoiceNumber, error: nErr } = await supabase.rpc('next_invoice_number');
  orThrow(nErr);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      id: newId('inv'),
      invoice_number: invoiceNumber,
      order_id: orderId,
      issue_date: issueDate || new Date().toISOString().slice(0, 10),
      due_date: dueDate || null,
      items: Array.isArray(items) ? items : [],
      notes: notes || '',
      status: status || 'draft',
      created_at: now,
      updated_at: now
    })
    .select()
    .single();
  orThrow(error);
  const invoice = mapInvoice(data);
  res.status(201).json({ ...invoice, total: total(invoice.items) });
}));

router.put('/:id', ah(async (req, res) => {
  const { issueDate, dueDate, items, notes, status } = req.body;
  const patch = { updated_at: new Date().toISOString() };
  if (issueDate !== undefined) patch.issue_date = issueDate || null;
  if (dueDate !== undefined) patch.due_date = dueDate || null;
  if (items !== undefined) patch.items = items;
  if (notes !== undefined) patch.notes = notes;
  if (status !== undefined) patch.status = status;
  const { data, error } = await supabase.from('invoices').update(patch).eq('id', req.params.id).select().maybeSingle();
  orThrow(error);
  if (!data) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = mapInvoice(data);
  res.json({ ...invoice, total: total(invoice.items) });
}));

router.delete('/:id', ah(async (req, res) => {
  const { data: deleted, error } = await supabase.from('invoices').delete().eq('id', req.params.id).select();
  orThrow(error);
  if (!deleted.length) return res.status(404).json({ error: 'Invoice not found' });
  res.status(204).end();
}));

module.exports = router;
