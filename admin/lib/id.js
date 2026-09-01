const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'site';
}

module.exports = { newId, slugify };
