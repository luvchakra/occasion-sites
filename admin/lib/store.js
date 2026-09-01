// Customer/invoice data now lives at data/db.json IN THE GITHUB REPO
// (see README's Privacy section for why) instead of a local file — a
// Vercel deployment has no persistent local disk, so anything that must
// survive between requests has to be committed to the repo.

const gh = require('./github');

const DB_PATH = 'data/db.json';
const EMPTY_DB = { customers: [], invoices: [], counters: { invoice: 0 }, settings: {} };

async function load() {
  const file = await gh.getFile(DB_PATH);
  if (!file) return structuredClone(EMPTY_DB);
  const db = JSON.parse(file.content);
  db.settings = db.settings || {};
  return db;
}

// Reads the db, lets `fn` mutate it, then commits the result back to
// GitHub. Not safe against two truly concurrent writers (a rare case for a
// solo admin tool) — a race shows up as a normal failed request to retry,
// never silent data loss.
async function withDb(fn) {
  const file = await gh.getFile(DB_PATH);
  const db = file ? JSON.parse(file.content) : structuredClone(EMPTY_DB);
  db.settings = db.settings || {};
  const result = await fn(db);
  await gh.putFile(DB_PATH, Buffer.from(JSON.stringify(db, null, 2)), 'Update admin data', file ? file.sha : undefined);
  return result;
}

module.exports = { load, withDb };
