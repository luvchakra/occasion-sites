const fs = require('fs');
const path = require('path');
const gh = require('./github');
const { getTemplate, getTemplateHtml } = require('./templates');
const { renderSite } = require('./render');

const UPLOADS_PREFIX = 'admin-data/uploads';

function readDirRecursive(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readDirRecursive(full, baseDir));
    else out.push({ abs: full, rel: path.relative(baseDir, full).split(path.sep).join('/') });
  }
  return out;
}

// Publishes one customer's site as a single atomic commit: the rendered
// HTML, the template's own default images/video (read straight off disk —
// they're bundled with this deployment and never change), and this
// customer's uploaded photos (already sitting in the repo under
// admin-data/uploads/<id>/, re-committed under sites/<slug>/images/ by
// reusing their existing blob — no need to re-download/re-upload bytes).
async function publishCustomer(customer) {
  const template = getTemplate(customer.templateId);
  if (!template) throw new Error(`Unknown template: ${customer.templateId}`);
  const html = renderSite(getTemplateHtml(customer.templateId), template.schema, customer.config);

  const outDir = `sites/${customer.slug}`;
  const files = [{ path: `${outDir}/index.html`, content: Buffer.from(html) }];

  const templateAssetsDir = path.join(template.dir, 'assets');
  for (const { abs, rel } of readDirRecursive(templateAssetsDir)) {
    files.push({ path: `${outDir}/${rel}`, content: fs.readFileSync(abs) });
  }

  const uploads = await gh.listDir(`${UPLOADS_PREFIX}/${customer.id}`);
  for (const upload of uploads) {
    files.push({ path: `${outDir}/images/${upload.name}`, sha: upload.sha });
  }

  await gh.commitFiles(files, `Publish site for ${customer.name} (${customer.slug})`);

  return { published: true, path: outDir };
}

module.exports = { publishCustomer };
