// Reads/writes template definitions under templates/<occasionType>/ IN THE
// GITHUB REPO (not local disk) — templates can now be uploaded at runtime
// (as a zip, see routes/templates.js), so they have to be visible
// immediately, the same way customer data is. A template folder holds:
//   - index.html    the master site (config-driven, see TEMPLATE_AUTHORING.md)
//   - template.json the admin form schema + default config
//   - assets/       default images/video shipped with the template

const gh = require('./github');

const TEMPLATES_PREFIX = 'templates';

async function listTemplates() {
  const tree = await gh.getTree();
  const ids = [...new Set(
    tree
      .filter((e) => e.path.startsWith(`${TEMPLATES_PREFIX}/`) && e.path.endsWith('/template.json'))
      .map((e) => e.path.split('/')[1])
  )];
  const templates = await Promise.all(ids.map((id) => getTemplate(id)));
  return templates.filter(Boolean);
}

async function getTemplate(id) {
  const dir = `${TEMPLATES_PREFIX}/${id}`;
  const file = await gh.getFile(`${dir}/template.json`);
  if (!file) return null;
  const schema = JSON.parse(file.content);
  return { id, dir, schema };
}

async function getTemplateHtml(id) {
  const t = await getTemplate(id);
  if (!t) return null;
  const file = await gh.getFile(`${t.dir}/${t.schema.templateFile || 'index.html'}`);
  return file ? file.content : null;
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

module.exports = { listTemplates, getTemplate, getTemplateHtml, getPath, setPath, TEMPLATES_PREFIX };
