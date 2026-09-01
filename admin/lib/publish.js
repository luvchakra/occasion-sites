const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getTemplate, getTemplateHtml } = require('./templates');
const { renderSite } = require('./render');

// REPO_PATH in .env is resolved relative to the admin/ folder (its parent
// directory IS the repo root by default, since admin/ lives inside it).
const ADMIN_DIR = path.join(__dirname, '..');
const REPO_PATH = path.resolve(ADMIN_DIR, process.env.REPO_PATH || '..');
const REPO_BRANCH = process.env.REPO_BRANCH || 'main';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Publishes one customer's site: renders the HTML, gathers assets (template
// defaults + this customer's uploads) into REPO_PATH/sites/<slug>/, then
// commits and pushes. Uses whatever git/GitHub credentials are already set
// up on this machine — the app never stores or embeds a token itself.
function publishCustomer(customer) {
  const template = getTemplate(customer.templateId);
  if (!template) throw new Error(`Unknown template: ${customer.templateId}`);
  const html = renderSite(getTemplateHtml(customer.templateId), template.schema, customer.config);

  const outDir = path.join(REPO_PATH, 'sites', customer.slug);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Template's default/backdrop assets (always copied — the template's
  //    own CSS/markup references these directly, outside of SITE_CONFIG).
  copyDir(path.join(template.dir, 'assets', 'images'), path.join(outDir, 'images'));
  copyDir(path.join(template.dir, 'assets', 'videos'), path.join(outDir, 'videos'));

  // 2. This customer's uploaded photos (overwrite/add on top of defaults).
  //    Uploads are keyed by customer id (see routes/customers.js), not slug.
  const customerUploads = path.join(UPLOADS_DIR, customer.id);
  copyDir(customerUploads, path.join(outDir, 'images'));

  // 3. The rendered page itself.
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  const relSitePath = path.join('sites', customer.slug).split(path.sep).join('/');
  git(['add', relSitePath]);
  const status = git(['status', '--porcelain', '--', relSitePath]);
  if (!status.trim()) {
    return { published: false, message: 'No changes to publish — this customer\'s site is already up to date.' };
  }
  git(['commit', '-m', `Publish site for ${customer.name} (${customer.slug})`]);
  git(['push', 'origin', REPO_BRANCH]);

  return { published: true, path: relSitePath };
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_PATH, encoding: 'utf8' });
}

module.exports = { publishCustomer, REPO_PATH };
