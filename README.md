# Founder Finance

> Self-hosted personal finance for founders. Multi-currency, equity-aware, with an AI advisor that has full read/write access to your books. Manage your **personal** financial life — your stake in the company is one asset on it, not the whole show.

[![Docker image](https://img.shields.io/badge/image-ghcr.io%2F9trocode%2Ffmanager-blue?logo=docker)](https://github.com/9trocode/Fmanager/pkgs/container/fmanager)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](#license)

## Why

A founder's personal balance sheet is unusually messy: cash across NGN / USD / EUR, brokerage accounts in two jurisdictions, crypto, real estate, retirement, debt, day-to-day spending — plus a slab of private equity that may or may not ever be worth real money. Existing tools either ignore private equity or take one paper number too seriously, and most lock the useful features behind a premium tier.

Founder Finance is the un-premium version: free, self-hosted, founder-aware, opinionated, and honest about uncertainty.

## Features

- **Multi-currency net worth** across NGN, USD, EUR, GBP, CAD, CHF, JPY, with daily FX from a free provider.
- **Three-scenario equity** for every grant — Floor (zero), Liquid (current FMV, post-tax), Expected (target exit, post-tax) — charted side-by-side. Decisions are anchored to the floor.
- **Accounts** with point-in-time snapshots; current value = latest snapshot + signed transactions since.
- **Transactions** with CSV import, AI receipt scan (image upload), and voice input.
- **Budgets** per category with monthly limits, optional account scoping, and over-budget alerts.
- **Recurring cash flows** (income/expense) with weekly / monthly / yearly cadence and an explicit next-due date — auto-accrued into real transactions so balances stay honest without manual logging.
- **Savings goals** in four kinds: savings target, net-worth target, FIRE (configurable multiplier), debt payoff (linked to a loan account, drives balance to zero).
- **Projections** that chart all three net-worth scenarios under a chosen monthly contribution + return assumption.
- **AI advisor** seeded with your real accounts, decisions, runway, recent transactions, budgets, and goals. Bring your own Anthropic / OpenAI / Google key. Has tool access to log transactions, create budgets, and adjust flows on your behalf.
- **Single-admin auth** with an optional viewer password for read-only sharing (spouse, accountant, co-founder). HMAC-signed cookies, gated via `proxy.ts`. No multi-tenant, no OAuth.

## Run it

### With the prebuilt image (fastest)

The repo publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to GHCR on every push to `main` and on tagged releases.

```bash
docker run -d \
  --name founder-finance \
  -p 3000:3000 \
  -v founder-finance-data:/data \
  -e ADMIN_PASSWORD=change-me \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  ghcr.io/9trocode/fmanager:latest
```

Open http://localhost:3000 and sign in with `ADMIN_PASSWORD`.

### With docker compose

```bash
cp .env.example .env
# edit .env — at minimum set ADMIN_PASSWORD and SESSION_SECRET
docker compose up -d
```

Data persists in the named volume `founder-finance-data`. Back up by copying `/data/app.db` out of the volume on a cron — see [Backup](#backup).

### Local development

```bash
pnpm install
pnpm db:push     # apply schema to ./data/app.db
pnpm dev         # http://localhost:3000
```

Without `ADMIN_PASSWORD` set, auth is disabled — handy for hacking on the UI.

## Configuration

All config is via env vars. Cookie auth is mandatory in any non-local deploy.

| Var                | Required | Default                          | Notes |
|--------------------|----------|----------------------------------|-------|
| `ADMIN_PASSWORD`   | prod     | (auth disabled)                  | Single admin password. Without this, anyone can sign in. |
| `VIEWER_PASSWORD`  | no       | (viewer disabled)                | Optional read-only password for sharing. |
| `SESSION_SECRET`   | prod     | falls back to `ADMIN_PASSWORD`   | HMAC secret for session cookies. Set explicitly in prod. |
| `DATABASE_URL`     | no       | `./data/app.db` (Docker: `/data/app.db`) | SQLite file path. |
| `ANTHROPIC_API_KEY`| no       | (unset)                          | Optional fallback advisor key. Settings → Advisor takes precedence. |
| `OPENAI_API_KEY`   | no       | (unset)                          | Same idea — optional fallback for OpenAI provider. |
| `GOOGLE_API_KEY`   | no       | (unset)                          | Same idea — optional fallback for Google provider. |
| `APP_URL`          | no       | `http://localhost:3000`          | Used for absolute redirects from API routes. |

## First-run checklist

1. Sign in at `/login` with your `ADMIN_PASSWORD`.
2. **Settings → General** — pick your base currency, hit "Refresh FX rates" once.
3. **Settings → Advisor** — paste an API key for whichever provider you prefer.
4. **Settings → Decisions** — add the 2-3 active personal financial decisions you're working through.
5. **Accounts** — add cash / brokerage / crypto / retirement / loans. Each one starts with an opening snapshot.
6. **Equity** — add each grant. Strike, vested shares, FMV, expected exit price. The dashboard now lights up.
7. **Cash flow** — log recurring income (salary) and expenses (rent, subscriptions). Pick an explicit next-due date for paydays.

## Sharing read-only access

Set `VIEWER_PASSWORD` to a second password and hand it to whoever needs visibility — spouse, accountant, co-founder. They sign in with the viewer password (same form as admin) and see every page exactly the way you do, but every "Add" / "Edit" / "Delete" / "Refresh FX" / "Seed" affordance is hidden, and the underlying server actions reject the call. Leave `VIEWER_PASSWORD` unset to disable sharing entirely. There's no user table — this is a single shared credential per role, on purpose.

## Stack

- **Next.js 16** (App Router), TypeScript, Tailwind v4
- **shadcn/ui** (radix base, new-york style, dark by default), Geist
- **Drizzle ORM** + **better-sqlite3** (single-file SQLite, WAL mode)
- **AI SDK v6** with provider adapters for Anthropic, OpenAI, and Google
- **Auth**: HMAC-signed cookie, single env var password, gated via `proxy.ts`

## Data model

```
accounts            account header + balance snapshot (cash/brokerage/crypto/loan/...)
value_snapshots     point-in-time balances; current = latest + tx since
transactions        every income/expense/transfer; flowId links auto-accrued posts
recurring_flows     weekly/monthly/yearly cadence; explicit next-due-date supported
budgets             monthly category limits, optionally scoped to one account
savings_goals       savings / net-worth / FIRE / debt-payoff targets
equity_grants       company, total/vested shares, strike, FMV, expected exit
fx_rates            base/quote/rate pairs, refreshed from open.er-api.com
decisions           active personal-finance decisions the advisor anchors to
chat_sessions       advisor threads + UIMessage v6 transcripts
settings            single key/value store (base currency, API keys, advisor model)
```

## Building your own image

```bash
# Local single-arch (loaded into your docker daemon)
docker build -t founder-finance .

# Or multi-arch via the buildx helper
IMAGE=ghcr.io/<you>/founder-finance:latest \
  scripts/build-image.sh --platforms linux/amd64,linux/arm64 --push
```

The script creates a dedicated buildx builder (`founder-finance-builder`) and falls back to your host platform if you ask for multi-arch with `--load` (Docker can't load a manifest list — only registries can).

The published GHCR image is built by the GitHub Actions workflow at `.github/workflows/docker.yml` on every push to `main` and on tagged releases. After the first successful publish, flip the package to public once on github.com → your profile → Packages → `fmanager` → Package settings → Change visibility — GHCR defaults new packages to private.

## Backup

This is a self-hosted single-file SQLite app. **You are the SRE.** Pick one:

- Cron `cp /data/app.db /backups/app-$(date +%Y%m%d).db`
- Restic, Borg, or Litestream for continuous backup
- Drop the volume directory into Dropbox / Syncthing
- Or use Settings → Data Tools → Export to grab the whole DB as JSON

If you skip this and your VPS dies, your data is gone. There is no cloud version waving at you from the corner.

## Status

v0.1 — MVP. The core loop (accounts → grants → recurring flows → transactions → three-scenario net worth → projections → advisor) works end-to-end. Polish, mobile UX, and bank integrations come next. See [ONE-PAGER.md](./ONE-PAGER.md) for the longer product brief.

## License

MIT.
