// Occasion types (wedding, birthday, …) are a managed list — a `code`
// (stable, used internally wherever a template or order needs to match
// occasions) plus a human `label`. New ones are added from the Templates
// page, not hardcoded, so the business can grow beyond "wedding" without a
// code change.
//
// The stored list (db.occasions) is unioned with any occasion codes that
// already exist on a template but aren't in the registry yet — keeps
// things self-healing rather than silently hiding a template whose
// occasion never got explicitly added.

const { withDb } = require('./store');
const { listTemplates } = require('./templates');
const { titleCase } = require('./schema-from-config');

async function listOccasions() {
  const db = await withDb((d) => d);
  const known = new Map((db.occasions || []).map((o) => [o.code, o]));
  const templates = await listTemplates();
  for (const t of templates) {
    const code = t.schema.occasionType;
    if (code && !known.has(code)) known.set(code, { code, label: titleCase(code) });
  }
  return [...known.values()].sort((a, b) => a.label.localeCompare(b.label));
}

module.exports = { listOccasions };
