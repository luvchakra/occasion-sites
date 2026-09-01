// Auto-generates an admin form schema (sections/fields, like template.json)
// straight from a template's `window.SITE_CONFIG = {...}` default object —
// so uploading a new template needs no hand-written schema for the common
// case. See TEMPLATE_AUTHORING.md for the one thing this can't infer:
// array fields left empty (no example item) are skipped, since there's no
// shape to read the item fields from — the template still works, that
// field just won't show up in the admin form.

const vm = require('vm');

function titleCase(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function inferType(key, value) {
  const k = key.toLowerCase();
  if (/photo|image|img|picture|logo|avatar|poster/.test(k)) return 'image';
  if (/url|link|href/.test(k)) return 'url';
  if (typeof value === 'string' && value.length > 60) return 'textarea';
  if (/text|description|desc|story|intro|bio|quote|message|notes/.test(k)) return 'textarea';
  return 'text';
}

// Parses `window.SITE_CONFIG = { ... };` out of a template's index.html and
// safely evaluates the object literal (no template code runs — vm just
// parses a plain JS value) to get real default values.
function extractConfigObject(html, marker) {
  const startIdx = html.indexOf(marker.start);
  const endMarkerIdx = html.indexOf(marker.end);
  if (startIdx === -1 || endMarkerIdx === -1) {
    throw new Error(
      'Could not find window.SITE_CONFIG markers in index.html — see TEMPLATE_AUTHORING.md for the required convention.'
    );
  }
  const closeIdx = html.lastIndexOf('};', endMarkerIdx);
  if (closeIdx === -1 || closeIdx < startIdx) {
    throw new Error('Could not find the end of the SITE_CONFIG object.');
  }
  const objectLiteral = html.slice(startIdx + 'window.SITE_CONFIG = '.length, closeIdx + 1);
  try {
    return vm.runInNewContext(`(${objectLiteral})`, {}, { timeout: 1000 });
  } catch (err) {
    throw new Error(`SITE_CONFIG isn't valid JS: ${err.message}`);
  }
}

// Walks a config object, building {sections, fields, warnings}.
function buildSchema(config) {
  const sections = [];
  const warnings = [];

  function fieldsFor(obj, prefix) {
    const fields = [];
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(value)) {
        if (value.length === 0) {
          warnings.push(`Skipped "${path}" — it's an empty list with no example item to learn its fields from.`);
          continue;
        }
        const first = value[0];
        if (first && typeof first === 'object') {
          fields.push({
            key: path,
            label: titleCase(key),
            type: 'list',
            itemLabel: titleCase(key).replace(/s$/, ''),
            itemFields: Object.entries(first).map(([k, v]) => ({ key: k, label: titleCase(k), type: inferType(k, v) }))
          });
        } else {
          fields.push({
            key: path,
            label: titleCase(key),
            type: 'list',
            itemLabel: titleCase(key).replace(/s$/, ''),
            itemFields: [{ key: 'value', label: 'Value', type: inferType(key, first) }]
          });
        }
      } else if (value && typeof value === 'object') {
        fields.push(...fieldsFor(value, path));
      } else {
        fields.push({ key: path, label: titleCase(key), type: inferType(key, value) });
      }
    }
    return fields;
  }

  for (const [key, value] of Object.entries(config)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sections.push({ title: titleCase(key), fields: fieldsFor(value, key) });
    } else if (Array.isArray(value)) {
      const listFields = fieldsFor({ [key]: value }, '');
      if (listFields.length) sections.push({ title: titleCase(key), fields: listFields });
    } else {
      let general = sections.find((s) => s.title === 'General');
      if (!general) {
        general = { title: 'General', fields: [] };
        sections.unshift(general);
      }
      general.fields.push({ key, label: titleCase(key), type: inferType(key, value) });
    }
  }

  return { sections, warnings };
}

module.exports = { extractConfigObject, buildSchema, titleCase, inferType };
