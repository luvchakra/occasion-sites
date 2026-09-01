// Customer/order/invoice data lives at data/db.json IN THE GITHUB REPO (see
// README's Privacy section for why) instead of a local file — a Vercel
// deployment has no persistent local disk, so anything that must survive
// between requests has to be committed to the repo.

const gh = require('./github');
const { newId } = require('./id');

const DB_PATH = 'data/db.json';
const EMPTY_DB = { customers: [], orders: [], invoices: [], counters: { invoice: 0, order: 0 }, settings: {} };

// One-time, idempotent upgrade from the old shape (one "customer" record
// WAS one site: name/email/phone + occasionType/templateId/config/slug all
// on one object) to customers-have-many-orders. Runs automatically the
// first time this code reads existing data — no separate migration step
// to remember. A record has already been split once db.orders exists, so
// this is a no-op on every later read.
function migrate(db) {
  if (db.orders) return db;

  const oldRecords = (db.customers || [])
    .slice()
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const customers = [];
  const orders = [];
  let orderCount = 0;

  for (const old of oldRecords) {
    orderCount += 1;
    const customerId = newId('cust');
    customers.push({
      id: customerId,
      name: old.name,
      email: old.email || '',
      phone: old.phone || '',
      createdAt: old.createdAt,
      updatedAt: old.updatedAt
    });
    orders.push({
      // Keep the OLD id: uploaded photos (admin-data/uploads/<id>/) and
      // published sites were already committed under it — reusing it
      // means nothing needs to move.
      id: old.id,
      orderNumber: `ORD-${String(orderCount).padStart(4, '0')}`,
      customerId,
      title: old.name,
      occasionType: old.occasionType,
      templateId: old.templateId,
      slug: old.slug,
      occasionDate: old.occasionDate || '',
      status: old.status || 'draft',
      publishedPath: old.publishedPath || '',
      publicUrl: old.publicUrl || '',
      config: old.config || {},
      createdAt: old.createdAt,
      updatedAt: old.updatedAt
    });
  }

  for (const inv of db.invoices || []) {
    if (inv.customerId && !inv.orderId) {
      inv.orderId = inv.customerId;
      delete inv.customerId;
    }
  }

  db.customers = customers;
  db.orders = orders;
  db.counters = db.counters || {};
  db.counters.order = orderCount;
  db.counters.invoice = db.counters.invoice || 0;
  return db;
}

async function load() {
  const file = await gh.getFile(DB_PATH);
  if (!file) return structuredClone(EMPTY_DB);
  const db = migrate(JSON.parse(file.content));
  db.settings = db.settings || {};
  return db;
}

// Reads the db, lets `fn` mutate it, then commits the result back to
// GitHub. Not safe against two truly concurrent writers (a rare case for a
// solo admin tool) — a race shows up as a normal failed request to retry,
// never silent data loss.
async function withDb(fn) {
  const file = await gh.getFile(DB_PATH);
  const db = file ? migrate(JSON.parse(file.content)) : structuredClone(EMPTY_DB);
  db.settings = db.settings || {};
  const result = await fn(db);
  await gh.putFile(DB_PATH, Buffer.from(JSON.stringify(db, null, 2)), 'Update admin data', file ? file.sha : undefined);
  return result;
}

module.exports = { load, withDb };
