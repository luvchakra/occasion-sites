const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const gh = require('../lib/github');
const { listTemplates, getTemplate } = require('../lib/templates');
const { listOccasions } = require('../lib/occasions');
const { slugify } = require('../lib/id');
const { extractConfigObject, buildSchema } = require('../lib/schema-from-config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const CONFIG_MARKER = {
  start: 'window.SITE_CONFIG = {',
  end: '<!-- ==================== END OF CONFIGURATION ==================== -->'
};

const ah = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(err.status === 404 ? 404 : 400).json({ error: err.message });
});

router.get('/', ah(async (req, res) => {
  const templates = await listTemplates();
  res.json(templates.map((t) => ({
    id: t.id,
    label: t.schema.label,
    description: t.schema.description,
    occasionType: t.schema.occasionType
  })));
}));

router.get('/:id', ah(async (req, res) => {
  const t = await getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json({ id: t.id, schema: t.schema });
}));

// Upload a new template as a zip (an index.html following the SITE_CONFIG
// convention, plus its images/video). The admin form schema is generated
// automatically from the config's own default values — see
// lib/schema-from-config.js and TEMPLATE_AUTHORING.md. The occasion is a
// code chosen from the managed occasions list (see routes/occasions.js),
// not free text — several templates can share one occasion (e.g. two
// different wedding designs).
router.post('/', upload.single('zipfile'), ah(async (req, res) => {
  const { label, description, occasionCode } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No zip file uploaded' });
  if (!label) return res.status(400).json({ error: 'label is required' });
  if (!occasionCode) return res.status(400).json({ error: 'occasionCode is required' });

  const occasions = await listOccasions();
  if (!occasions.some((o) => o.code === occasionCode)) {
    return res.status(400).json({ error: `Unknown occasion: ${occasionCode}` });
  }

  const templateId = slugify(label);
  if (await getTemplate(templateId)) {
    return res.status(400).json({ error: `A template called "${templateId}" already exists.` });
  }

  const zip = new AdmZip(req.file.buffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) return res.status(400).json({ error: 'The zip file is empty.' });

  // Strip a single common wrapper folder, if every entry has one
  // (e.g. "wedding-site-package/index.html", "wedding-site-package/images/...").
  const firstSegments = entries.map((e) => e.entryName.split('/')[0]);
  const commonRoot = firstSegments.every((s) => s === firstSegments[0]) ? firstSegments[0] + '/' : '';
  const relPath = (name) => (commonRoot && name.startsWith(commonRoot) ? name.slice(commonRoot.length) : name);

  const htmlEntry = entries.find((e) => relPath(e.entryName).toLowerCase() === 'index.html');
  if (!htmlEntry) {
    return res.status(400).json({ error: 'No index.html found at the root of the zip (see TEMPLATE_AUTHORING.md).' });
  }
  const html = htmlEntry.getData().toString('utf8');

  const config = extractConfigObject(html, CONFIG_MARKER);
  const { sections, warnings } = buildSchema(config);

  const schema = {
    occasionType: occasionCode,
    label,
    description: description || '',
    templateFile: 'index.html',
    configMarker: CONFIG_MARKER,
    sections,
    defaultConfig: config
  };

  const dir = `templates/${templateId}`;
  const files = [
    { path: `${dir}/index.html`, content: Buffer.from(html) },
    { path: `${dir}/template.json`, content: Buffer.from(JSON.stringify(schema, null, 2)) }
  ];
  for (const entry of entries) {
    if (entry === htmlEntry) continue;
    files.push({ path: `${dir}/assets/${relPath(entry.entryName)}`, content: entry.getData() });
  }

  await gh.commitFiles(files, `Add template: ${label}`);

  res.status(201).json({ id: templateId, schema, warnings });
}));

module.exports = router;
