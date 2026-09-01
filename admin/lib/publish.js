const gh = require('./github');
const { getTemplate, getTemplateHtml } = require('./templates');
const { renderSite } = require('./render');

const UPLOADS_PREFIX = 'admin-data/uploads';

// Publishes one order's site as a single atomic commit: the rendered HTML,
// the template's own default images/video (reused directly from
// templates/<id>/assets/ — same blob, no re-upload needed), and this
// order's uploaded photos (already sitting in the repo under
// admin-data/uploads/<id>/, re-committed under sites/<slug>/images/ the
// same way).
async function publishOrder(order) {
  const template = await getTemplate(order.templateId);
  if (!template) throw new Error(`Unknown template: ${order.templateId}`);
  const html = renderSite(await getTemplateHtml(order.templateId), template.schema, order.config);

  const outDir = `sites/${order.slug}`;
  const files = [{ path: `${outDir}/index.html`, content: Buffer.from(html) }];

  const tree = await gh.getTree();
  const assetsPrefix = `${template.dir}/assets/`;
  for (const entry of tree) {
    if (entry.type === 'blob' && entry.path.startsWith(assetsPrefix)) {
      const rel = entry.path.slice(assetsPrefix.length);
      files.push({ path: `${outDir}/${rel}`, sha: entry.sha });
    }
  }

  const uploads = await gh.listDir(`${UPLOADS_PREFIX}/${order.id}`);
  for (const upload of uploads) {
    files.push({ path: `${outDir}/images/${upload.name}`, sha: upload.sha });
  }

  await gh.commitFiles(files, `Publish site for ${order.title} (${order.slug})`);

  return { published: true, path: outDir };
}

module.exports = { publishOrder };
