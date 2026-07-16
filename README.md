# orchao-status

Public status page for **[status.orchao.com](https://status.orchao.com)**.

## Why this lives outside the main repo

A status page's whole job is to be up **when the primary site is down**.
If it lived on the same VPS as orchao.com, a Hostinger outage or account
suspension would take the status page with it — the exact case where a
status page matters most. This repo is hosted independently on **GitHub
Pages**, probed by **GitHub Actions**, and has no runtime dependency on
the Orchao VPS.

## How it works

- `.github/workflows/probe.yml` runs every 5 minutes.
- `scripts/probe.mjs` hits two endpoints:
  - `https://orchao.com/`
  - `https://api.orchao.com/health`
- Results are rolled up per calendar day (worst state wins) and written
  to `data/status.json`. The workflow commits back to `main` if the file
  changed.
- `index.html` is a fully static page that fetches `data/status.json` on
  load and renders the 90-day component grid.

## Local preview

```bash
python3 -m http.server 8000
open http://localhost:8000
```

## Manual probe

```bash
node scripts/probe.mjs
```

## GitHub Pages setup

1. Repository → **Settings → Pages**.
2. Source: **Deploy from a branch**, branch **`main` / root**.
3. Custom domain: **`status.orchao.com`** (the `CNAME` file in this repo
   also encodes this).
4. Enforce HTTPS: **on** once the certificate finishes provisioning.

## DNS setup

Add a CNAME record in PowerDNS on the Orchao VPS (or wherever
`orchao.com` DNS lives):

```
status.orchao.com.  CNAME  <github-username>.github.io.
```

Provisioning takes a few minutes; GitHub then issues a Let's Encrypt
cert automatically.

## Retention

`data/status.json` keeps the last **90 days** of daily rollups per
service. Older days age out on the next probe run.
