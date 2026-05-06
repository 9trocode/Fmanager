# Founder Finance

> Self-hosted, open-source net worth tool for founders. Multi-currency, three-scenario equity, AI advisor anchored on your real decisions.

## Why this exists

Founders carry weird balance sheets: NGN/USD/EUR cash, brokerage in two jurisdictions, crypto, and a giant slab of private company equity that may or may not ever be liquid. Existing tools either ignore one of those buckets, treat private equity dishonestly (one paper number, taken seriously), or hide the useful features behind a premium tier.

This is the un-premium version: **truly free, founder-grade, self-hosted, actually beautiful.**

## What it does

- **Multi-currency net worth** — NGN, USD, EUR, GBP, CAD, CHF, JPY first-class. Live FX from a free provider.
- **Three-scenario equity** — every grant computes Floor (zero), Liquid (current FMV), Expected (target exit). Decisions are made against the floor, not the ceiling.
- **Projections** — pick a monthly contribution and an expected return; see all three scenarios chart out side-by-side.
- **AI advisor** — bring your own Anthropic key. The advisor is seeded with your three real financial decisions and your full balance sheet context. Not generic.
- **Single-admin auth** — one password set via env var. No multi-tenant, no OAuth, no SSO. It's your tool, on your box.

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

## Configuration

All config is via env vars:

| Var                | Required | Default                          | Notes |
|--------------------|----------|----------------------------------|-------|
| `ADMIN_PASSWORD`   | prod     | (auth disabled)                  | Single admin password. Without this, anyone can sign in. |
| `SESSION_SECRET`   | prod     | falls back to `ADMIN_PASSWORD`   | HMAC secret for session cookies. Set explicitly in prod. |
| `DATABASE_URL`     | no       | `./data/app.db`                  | SQLite file path. In Docker: `/data/app.db`. |
| `ANTHROPIC_API_KEY`| no       | (unset)                          | Optional fallback. Settings → Advisor takes precedence. |
| `APP_URL`          | no       | `http://localhost:3000`          | Used for absolute redirects from API routes. |

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
