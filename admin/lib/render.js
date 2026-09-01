// Merges a customer's config object into a template's HTML by replacing
// the `window.SITE_CONFIG = {...}` block. Every template's index.html is
// expected to read all customizable content from that one object at
// runtime (see TEMPLATE_AUTHORING.md) — so rendering never needs to touch
// markup, only swap the data block.

function renderSite(templateHtml, schema, config) {
  const marker = schema.configMarker;
  const startIdx = templateHtml.indexOf(marker.start);
  const endMarkerIdx = templateHtml.indexOf(marker.end);
  if (startIdx === -1 || endMarkerIdx === -1) {
    throw new Error('Template is missing its SITE_CONFIG markers — cannot render.');
  }
  const closeIdx = templateHtml.lastIndexOf('};', endMarkerIdx);
  if (closeIdx === -1 || closeIdx < startIdx) {
    throw new Error('Could not find the end of the SITE_CONFIG object in the template.');
  }
  const configBlock = 'window.SITE_CONFIG = ' + JSON.stringify(config, null, 2) + ';';
  return templateHtml.slice(0, startIdx) + configBlock + templateHtml.slice(closeIdx + 2);
}

module.exports = { renderSite };
