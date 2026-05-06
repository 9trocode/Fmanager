# Founder Finance

> Self-hosted, open-source **personal finance** tool for founders. Manage your whole financial life — accounts, transactions, budgets, savings goals, recurring flows — with multi-currency support and an AI advisor that understands your equity is just one asset on your personal balance sheet.

## Why this exists

This is **personal finance management for a co-founder**, not a tool for managing the company's books. Your stake in the company you founded is one line item among many — alongside cash in multiple currencies, brokerage accounts, crypto, real estate, retirement, debts, and the day-to-day spending that fills out a real human life.

Existing personal finance tools either ignore private equity entirely, treat it dishonestly (one paper number, taken seriously), or hide useful features behind a premium tier. This is the un-premium version: **truly free, founder-aware, self-hosted, actually beautiful.**

## What it does

- **Multi-currency net worth** — NGN, USD, EUR, GBP, CAD, CHF, JPY first-class. Live FX from a free provider.
- **Three-scenario equity** — every grant computes Floor (zero), Liquid (current FMV), Expected (target exit). Decisions are made against the floor, not the ceiling.
- **Personal cash flow** — recurring income and expenses, plus per-transaction logging with AI receipt scan and voice input.
- **Budgets** — per-category monthly limits with progress tracking and over-budget alerts.
- **Savings goals** — named targets with monthly contributions, projection charts, and a net-worth-at-completion view.
- **Projections** — pick a monthly contribution and expected return; see all three net-worth scenarios charted side-by-side.
- **AI advisor** — bring your own Anthropic key. The advisor is seeded with your real financial decisions and full personal balance sheet context. It explicitly knows this is your personal life, not the company books.
- **Single-admin auth** — one password set via env var, plus an optional read-only viewer password for sharing with a partner. No multi-tenant, no OAuth, no SSO. It's your tool, on your box.

## Quick start (local dev)

```bash
pnpm install
pnpm db:push           # apply schema to ./data/app.db
pnpm dev
```

Open http://localhost:3000. Without `ADMIN_PASSWORD` set, auth is disabled (handy for dev).

To require auth locally:

```bash
ADMIN_PASSWORD=letmein pnpm dev
```

Then sign in at `/login` with that password.

## Self-host with Docker

```bash
cp .env.example .env
# edit .env — at minimum set ADMIN_PASSWORD and SESSION_SECRET

docker compose up -d --build
```

Data persists in a named volume (`founder-finance-data`). To back up:

```bash
docker compose cp app:/data ./backup-$(date +%Y%m%d)
```

To restore: stop the container, replace the volume contents, restart.

### Multi-arch images

The Dockerfile is multi-arch friendly. To build for both amd64 and arm64 (e.g.
to push a single tag that works on Mac M-series, Raspberry Pi, and standard
x86 cloud VMs), use the buildx helper:

```bash
# Build locally for your host architecture (load into docker)
pnpm docker:buildx

# Or push a real multi-arch image to a registry
IMAGE=ghcr.io/<you>/founder-finance:latest scripts/build-image.sh --push

# Or with explicit platforms
scripts/build-image.sh --platforms linux/amd64,linux/arm64 --push ghcr.io/<you>/founder-finance:latest
```

The script creates a dedicated buildx builder (`founder-finance-builder`) and
falls back to your host platform if you ask for multi-arch with `--load`
(Docker can't load a manifest list — only registries can).

## Configuration

All config is via env vars:

| Var                | Required | Default                          | Notes |
|--------------------|----------|----------------------------------|-------|
| `ADMIN_PASSWORD`   | prod     | (auth disabled)                  | Single admin password. Without this, anyone can sign in. |
| `VIEWER_PASSWORD`  | no       | (viewer disabled)                | Optional read-only password. Share with spouse / co-founder. |
| `SESSION_SECRET`   | prod     | falls back to `ADMIN_PASSWORD`   | HMAC secret for session cookies. Set explicitly in prod. |
| `DATABASE_URL`     | no       | `./data/app.db`                  | SQLite file path. In Docker: `/data/app.db`. |
| `ANTHROPIC_API_KEY`| no       | (unset)                          | Optional fallback. Settings → Advisor takes precedence. |
| `APP_URL`          | no       | `http://localhost:3000`          | Used for absolute redirects from API routes. |

## Sharing read-only access

Set `VIEWER_PASSWORD` to a second password and hand it to whoever needs visibility into the dashboard — typically a spouse, co-founder, or accountant. They sign in at `/login` with the viewer password (same form as admin) and see every page exactly the way you do, but every "Add", "Edit", "Delete", "Refresh FX", and "Seed" affordance is hidden, and the underlying server actions reject the call. Leave `VIEWER_PASSWORD` unset to disable sharing entirely. There is no user table — this is a single shared credential per role, on purpose.

## First-run checklist

1. Sign in with your `ADMIN_PASSWORD`.
2. **Settings → General** — pick your base currency, hit "Refresh FX rates" once.
3. **Settings → Advisor** — paste your Anthropic API key.
4. **Settings → Decisions** — add your three active financial decisions (or use the suggested starters).
5. **Accounts** — add cash / brokerage / crypto / etc. Each one starts with an opening snapshot.
6. **Equity** — add each grant. Strike, vested shares, FMV, expected exit price. The dashboard now lights up.

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind v4
- shadcn/ui (radix base, new-york style, dark by default) · Geist
- Drizzle ORM + better-sqlite3
- AI SDK v6 + `@ai-sdk/anthropic`
- Auth: HMAC-signed cookie, single env var password, gated via `proxy.ts`

## Data model

```
accounts            — one row per account, single currency, soft-archive supported
value_snapshots     — point-in-time balance per account; latest = current value
equity_grants       — company, total/vested shares, strike, FMV, expected exit
fx_rates            — base/quote/rate, refreshed from open.er-api.com
decisions           — open / decided / deferred; advisor anchors on these
settings            — single key/value table for base currency, API key, model
```

## Backup is your job

This is a self-hosted single-file SQLite app. **You are the SRE.** Pick one:

- Cron `cp /data/app.db /backups/app-$(date +%Y%m%d).db`
- Restic, Borg, or Litestream for continuous backup
- Drop the volume directory into Dropbox / Syncthing

If you skip this and your VPS dies, your data is gone. There is no cloud version waving at you from the corner.

## Status

v0.1 — MVP. The core loop (add accounts → add grants → see net worth in 3 scenarios → run projections → ask advisor) works end-to-end. Polish, integrations (Plaid / Mono), and stress-tests come next.

See [ONE-PAGER.md](./ONE-PAGER.md) for the full product brief.

## License

MIT.
