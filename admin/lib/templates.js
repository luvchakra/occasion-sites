// Reads template definitions from /templates/<occasionType>/.
// A template is just a folder containing:
//   - index.html    the master site (config-driven, see TEMPLATE_AUTHORING.md)
//   - template.json the admin form schema + default config
//   - assets/       default images/video shipped with the template

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

function listTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(TEMPLATES_DIR, id, 'template.json')))
    .map((id) => getTemplate(id));
}

function getTemplate(id) {
  const dir = path.join(TEMPLATES_DIR, id);
  const schemaPath = path.join(dir, 'template.json');
  if (!fs.existsSync(schemaPath)) return null;
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return { id, dir, schema };
}

function getTemplateHtml(id) {
  const t = getTemplate(id);
  if (!t) return null;
  return fs.readFileSync(path.join(t.dir, t.schema.templateFile || 'index.html'), 'utf8');
}

// dot-path helpers -----------------------------------------------------

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotPath, value) {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

// Deep-merge customer overrides onto the template's default config, so a
// customer record only needs to store the fields it actually changed.
function mergeConfig(defaultConfig, overrides) {
  const out = structuredClone(defaultConfig || {});
  if (!overrides) return out;
  for (const [key, val] of Object.entries(overrides)) {
    if (Array.isArray(val)) {
      out[key] = structuredClone(val);
    } else if (val && typeof val === 'object') {
      out[key] = mergeConfig(out[key] || {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

module.exports = { listTemplates, getTemplate, getTemplateHtml, getPath, setPath, mergeConfig, TEMPLATES_DIR };
