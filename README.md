# Occasion Sites

An admin tool for a "we build your special-occasion website" business:
manage reusable templates (wedding, birthday, anniversary, …), fill in each
customer's details and photos through a simple form, publish their site as
a live page, and send them a basic invoice.

```
templates/    reusable site templates (currently: wedding) — bundled read-only
sites/        published customer websites, served via GitHub Pages
admin/        the admin tool itself (Node/Express — runs locally or on Vercel)
data/         customer records + invoices (committed — see Privacy below)
```

Deployable two ways:
- **Locally** on your own machine (`npm start`, open `http://localhost:4000`).
- **On Vercel**, so it's reachable at a real URL. Either way, all data
  (customers, invoices, uploaded photos, published sites) lives in THIS
  GitHub repo, read and written through the GitHub API — there's no
  separate database to run or back up.

## Setup (needed either way)

1. Create a fine-grained GitHub Personal Access Token at
   [github.com/settings/tokens](https://github.com/settings/tokens) with
   **Contents: Read and write** permission, scoped to just this repo.
2. Set these environment variables (copy `admin/.env.example` to
   `admin/.env` for local use, or add them as Vercel Environment Variables
   for a deployment):

   | Variable | Value |
   |---|---|
   | `GITHUB_TOKEN` | the token from step 1 |
   | `GITHUB_OWNER` | `luvchakra` |
   | `GITHUB_REPO` | `occasion-sites` |
   | `GITHUB_BRANCH` | `main` |
   | `PUBLIC_BASE_URL` | `https://luvchakra.github.io/occasion-sites/sites` |
   | `ADMIN_USER` / `ADMIN_PASSWORD` | any username/password — protects the tool with a login. Leave both unset to run without one (fine for local-only use). **Set these before deploying to Vercel** — the URL is public otherwise. |

### Running locally

```bash
cd admin
npm install
cp .env.example .env   # then fill in GITHUB_TOKEN at minimum
npm start              # -> http://localhost:4000
```

### Deploying to Vercel

Import this repo into a Vercel project with **Root Directory set to
`admin`** (it has its own `package.json`, `api/index.js`, and
`vercel.json`) and set the environment variables above in the project
settings. Every push to `main` redeploys it automatically.

## Using the tool

Open the dashboard. From there:

1. **New customer** — pick a template (e.g. "Wedding"), enter their name → creates a draft.
2. **Open** the customer → fill in the form (names, dates, venues, events, RSVP info…) and upload photos directly in each photo field.
3. **Preview site** — opens the page as it'll look, without publishing anything.
4. **Publish live** — commits the rendered site into `sites/<slug>/` in this repo. It becomes live at `PUBLIC_BASE_URL/<slug>/` (GitHub Pages) within a minute or two.
5. **Invoices** (from the customer page) — add line items, mark draft/sent/paid, and use **View / Print** to get a clean printable invoice (browser's Print → Save as PDF works for emailing it).

**Business Settings** (top nav) sets the name/address/contact shown on invoice letterheads.

## Privacy

`data/db.json` (customer names, emails, phone numbers, invoice amounts) and
uploaded photos (`admin-data/uploads/`) are committed to this repo — **this
repo is currently public** (required for free GitHub Pages on a personal
account), which means that data is publicly readable right now, same as
the code. Make the repo private as soon as you're comfortable — note that
GitHub Pages on a *private* repo requires a paid GitHub plan (Pro/Team/
Enterprise); on the free plan, going private takes every published
customer site offline too.

## Adding a new occasion type

See [`TEMPLATE_AUTHORING.md`](./TEMPLATE_AUTHORING.md) — drop a new folder
under `templates/`, and it shows up automatically as an option when
creating a customer.
