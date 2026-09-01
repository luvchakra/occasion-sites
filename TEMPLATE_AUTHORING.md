# Adding a new occasion template (e.g. Birthday, Anniversary)

A template is a folder under `templates/<occasion-type>/` with three things:

```
templates/birthday/
├── index.html        the site itself
├── template.json      the admin form schema + default content
└── assets/
    ├── images/         backdrop/decorative images that are the SAME for every customer
    └── videos/          same idea, for video
```

## 1. `index.html` — the config-driven convention

The site must read ALL customer-specific content from one object, set near the
top of the file:

```html
<script>
window.SITE_CONFIG = {
  person: { name: "", photo: "" },
  party: { date: "", venue: "" },
  ...
};
</script>
<!-- ==================== END OF CONFIGURATION ==================== -->
```

Then, in a later `<script>` block, plain JS reads `window.SITE_CONFIG` and
fills in the page (`textContent`, `src`, building repeated cards from an
array, etc.) — see `templates/wedding/index.html` for a full example: the
whole "apply config" block near the bottom of the file.

The admin tool never touches your markup or CSS — publishing only replaces
the `window.SITE_CONFIG = {...};` object with the customer's data. Anything
below the `END OF CONFIGURATION` marker is copied through untouched.

Photo/video fields should be referenced as plain relative paths, e.g.
`"images/main.jpg"` or `"videos/intro.mp4"` — the admin tool copies each
customer's uploaded photos into `images/` next to the published page.

## 2. `template.json` — the admin form

Describes what fields show up in the admin editor, grouped into sections:

```json
{
  "occasionType": "birthday",
  "label": "Birthday",
  "description": "One line shown when picking a template.",
  "templateFile": "index.html",
  "configMarker": {
    "start": "window.SITE_CONFIG = {",
    "end": "<!-- ==================== END OF CONFIGURATION ==================== -->"
  },
  "sections": [
    {
      "title": "Person",
      "fields": [
        { "key": "person.name", "label": "Name", "type": "text", "required": true },
        { "key": "person.photo", "label": "Main Photo", "type": "image" }
      ]
    },
    {
      "title": "Gallery",
      "fields": [
        {
          "key": "gallery", "label": "Photos", "type": "list", "itemLabel": "Photo",
          "itemFields": [
            { "key": "photo", "label": "Photo", "type": "image" },
            { "key": "caption", "label": "Caption", "type": "text" }
          ]
        }
      ]
    }
  ],
  "defaultConfig": {
    "person": { "name": "", "photo": "" },
    "gallery": []
  }
}
```

Field types the admin UI understands: `text`, `textarea`, `url`, `image`,
and `list` (a repeatable group of sub-fields — needed for anything like
"events" or "gallery" where a customer can have any number of entries).

`key` is a dot-path into the config object (e.g. `"wedding.venueName"`
sets `config.wedding.venueName`). `defaultConfig` must have the full shape
the template expects — it's what a brand-new customer starts from.

## 3. `assets/`

Everything under `assets/images/` and `assets/videos/` is copied into
*every* customer's published site automatically (as `images/` and
`videos/`), before their own uploaded photos are layered on top. Put here:
background textures, a fixed intro video, and any fallback images your
markup references directly outside of `SITE_CONFIG` (e.g. the built-in
example event/gallery photos a page falls back to when a customer hasn't
filled in `events`/`gallery` yet).

## Adding it to the admin tool

Nothing to register anywhere — the admin tool lists every folder under
`templates/` that has a `template.json`. Drop the folder in, restart the
server (or just refresh if using `npm run dev`), and the new occasion type
shows up in "New customer".
