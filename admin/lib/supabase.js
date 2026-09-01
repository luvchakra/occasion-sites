// Structured business data (customers, orders, invoices, occasions,
// settings) lives in Supabase Postgres. Templates, uploaded photos, and
// published sites stay in the GitHub repo (see lib/github.js) — GitHub
// Pages serves the sites directly, and the publish flow reuses blob shas
// straight out of the repo, so moving those off GitHub would lose that.
//
// The service role key bypasses Row Level Security, which is enabled with
// no policies on every table — this server is the only writer.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

module.exports = supabase;
