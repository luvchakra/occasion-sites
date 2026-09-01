# Occasion Sites

An admin tool for a "we build your special-occasion website" business:
manage reusable templates (wedding, birthday, anniversary, …), fill in each
customer's details and photos through a simple form, publish their site as
a live page, and send them a basic invoice.

```
templates/    reusable site templates (currently: wedding)
sites/        published customer websites, served via GitHub Pages
admin/        the admin tool itself (Node/Express, runs locally)
data/         customer records + invoices (gitignored — private, not on GitHub)
```

## Running the admin tool

```bash
cd admin
npm install
cp .env.example .env      # defaults are fine if you run this from inside the repo
npm start                 # -> http://localhost:4000
```

Open `http://localhost:4000` — that's the dashboard. From there:

1. **New customer** — pick a template (e.g. "Wedding"), enter their name → creates a draft.
2. **Open** the customer → fill in the form (names, dates, venues, events, RSVP info…) and upload photos directly in each photo field.
3. **Preview site** — opens the page as it'll look, without publishing anything.
4. **Publish live** — writes the site into `sites/<slug>/`, commits, and pushes. It becomes live at `PUBLIC_BASE_URL/<slug>/` (GitHub Pages).
5. **Invoices** (from the customer page) — add line items, mark draft/sent/paid, and use **View / Print** to get a clean printable invoice (browser's Print → Save as PDF works for emailing it).

**Business Settings** (top nav) sets the name/address/contact shown on invoice letterheads.

## How publishing works

Publishing shells out to `git` in a local checkout of this same repo (see
`admin/.env` → `REPO_PATH`) using whatever GitHub credentials are already
set up on your machine — the tool doesn't store or handle any token itself.
So: run the admin tool from inside a normal clone of this repo where
`git push` already works for you, and publishing just works too.

## Privacy

`data/` (customer names, emails, phone numbers, invoice amounts) and
`admin/uploads/` (photos before they're attached to a published site) are
gitignored on purpose. This repo is public (required for free GitHub
Pages) — only the **published sites** under `/sites` are meant to be
public. Back up `data/db.json` yourself (it's not on GitHub).

## Adding a new occasion type

See [`TEMPLATE_AUTHORING.md`](./TEMPLATE_AUTHORING.md) — drop a new folder
under `templates/`, and it shows up automatically as an option when
creating a customer.
