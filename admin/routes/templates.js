const express = require('express');
const { listTemplates, getTemplate } = require('../lib/templates');

const router = express.Router();

router.get('/', (req, res) => {
  const templates = listTemplates().map((t) => ({
    id: t.id,
    label: t.schema.label,
    description: t.schema.description,
    occasionType: t.schema.occasionType
  }));
  res.json(templates);
});

router.get('/:id', (req, res) => {
  const t = getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json({ id: t.id, schema: t.schema });
});

module.exports = router;
