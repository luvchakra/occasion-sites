# Occasion Sites

An admin tool for a "we build your special-occasion website" business:
manage reusable templates (wedding, birthday, anniversary, …), and manage
customers who can each place any number of **orders** — one order is one
website (e.g. one customer might order a wedding site now and a birthday
site for their kid later). Each order gets a system-generated order number
and a title you choose, fill in through a simple form, publish as a live
page, and invoice separately.

```
templates/    reusable site templates (currently: wedding) — bundled read-only
sites/        published order websites, served via GitHub Pages
admin/        the admin tool itself (Node/Express — runs locally or on Vercel)
data/         customers, orders, invoices (committed — see Privacy below)
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

The **Dashboard** (landing page) shows key metrics at a glance: total customers,
orders (live vs draft), revenue collected vs outstanding, orders broken down
by occasion, a "needs attention" list of unpaid/overdue invoices, and recent
orders.

For the actual work, go to **Customers**:

1. **New customer** — just a contact: name, email, phone. No occasion/template yet — that's chosen per order.
2. **Open** the customer → **New order**: give it a title (e.g. "Kabir & Ananya's Wedding Site"), pick an occasion then a matching template, optionally set the occasion date. You can **Preview** any template matching the occasion before committing. Creates the order with a system-generated order number (`ORD-0001`, …) and opens it.
3. **On the order page** → fill in the form (names, dates, venues, events, RSVP info…) and upload photos directly in each photo field.
4. **Publish live** — commits the rendered site into `sites/<slug>/` in this repo. It becomes live at `PUBLIC_BASE_URL/<slug>/` (GitHub Pages) within a minute or two.
5. **Invoices** (from the order page) — add line items, mark draft/sent/paid, and use **View / Print** to get a clean printable invoice (browser's Print → Save as PDF works for emailing it).

A customer can have any number of orders — go back to their customer page any time to add another.

**Business Settings** (top nav) sets the name/address/contact shown on invoice letterheads.

## Privacy

`data/db.json` (customer names, emails, phone numbers, order/invoice
amounts) and uploaded photos (`admin-data/uploads/`) are committed to this
repo — **this repo is currently public** (required for free GitHub Pages
on a personal account), which means that data is publicly readable right
now, same as the code. Make the repo private as soon as you're
comfortable — note that GitHub Pages on a *private* repo requires a paid
GitHub plan (Pro/Team/Enterprise); on the free plan, going private takes
every published order's site offline too.

## Adding a new occasion type

See [`TEMPLATE_AUTHORING.md`](./TEMPLATE_AUTHORING.md) — drop a new folder
under `templates/`, and it shows up automatically as an option when
creating an order.
