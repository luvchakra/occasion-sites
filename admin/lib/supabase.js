// Structured business data (customers, orders, invoices, occasions,
// settings) lives in Supabase Postgres. Templates, uploaded photos, and
// published sites stay in the GitHub repo (see lib/github.js) — GitHub
// Pages serves the sites directly, and the publish flow reuses blob shas
// straight out of the repo, so moving those off GitHub would lose that.
//
// The service role key bypasses Row Level Security, which is enabled with
// no policies on every table — this server is the only writer.
//
// createClient() throws synchronously if the URL/key are missing — and
// since this module sits at the top of every route's require chain, that
// throw would happen at server startup and take the ENTIRE app down (even
// routes that don't touch the database) if the env vars aren't set yet.
// Building the client lazily, on first actual query, means a missing
// config instead surfaces as a normal per-request error from whichever
// route needed it.
const { createClient } = require('@supabase/supabase-js');

let client;
function getClient() {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

// Bind methods to the real client — `supabase.from(...)` calls the
// returned function with `this` set to the proxy object otherwise,
// breaking the client's internal state.
module.exports = new Proxy({}, {
  get(_target, prop) {
    const c = getClient();
    const value = c[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  }
});
