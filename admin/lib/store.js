// Tiny JSON-file database. No server, no native deps — fine for a
// single-admin tool with a modest number of customers.
//
// IMPORTANT: this file (data/db.json) contains customer PII (name, email,
// phone) and money amounts (invoices). It is gitignored on purpose — the
// occasion-sites repo is public (needed for free GitHub Pages), and only
// the *published sites* under /sites are meant to be public, never this
// data file.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

const EMPTY_DB = { customers: [], invoices: [], counters: { invoice: 0 } };

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return raw.trim() ? JSON.parse(raw) : structuredClone(EMPTY_DB);
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// All access goes through withDb to keep read-modify-write atomic within
// this single Node process (no concurrent-writer protection is needed for
// a solo admin tool run locally).
function withDb(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

module.exports = { load, save, withDb };
