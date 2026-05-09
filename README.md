# Cairn

> Self-hosted personal finance for founders. Multi-currency, equity-aware, with an AI advisor that has full read/write access to your books. Stack the truths — every account, every flow, every grant — and plan against the floor.

[![Docker image](https://img.shields.io/badge/image-ghcr.io%2F9trocode%2Ffmanager-blue?logo=docker)](https://github.com/9trocode/Fmanager/pkgs/container/fmanager)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](#license)

## Why Cairn

A cairn is a stack of stones marking the path you've climbed. Each stone is a truth: a cash balance, a loan, a recurring expense, a vested grant, a savings goal. None of them is the whole picture; together they're the only honest picture.

A founder's personal balance sheet is unusually messy: cash across NGN / USD / EUR, brokerage in two jurisdictions, crypto, real estate, retirement, debt, day-to-day spending — plus a slab of private equity that may or may not ever pay out. Most personal finance tools either ignore equity or take one paper number too seriously, and lock the useful features behind a premium tier.

Cairn is the un-premium version: free, self-hosted, founder-aware, opinionated, and honest about uncertainty.

## Features

- **Multi-currency net worth** across NGN, USD, EUR, GBP, CAD, CHF, JPY, with daily FX from a free provider.
- **Three-scenario equity** for every grant — Floor (zero), Liquid (current FMV, post-tax), Expected (target exit, post-tax) — charted side-by-side. Decisions are anchored to the floor.
- **Accounts** with point-in-time snapshots; current value = latest snapshot + signed transactions since. Cross-currency transactions FX-convert into the account's currency before summing.
- **Transactions** with CSV import, AI receipt scan (image upload), and voice input. Click any row for a drill-down sheet showing the source flow, full notes, and audit dates.
- **Budgets** per category with monthly limits, optional account scoping, and over-budget alerts.
- **Recurring cash flows** (income/expense) with weekly / monthly / yearly cadence and an explicit next-due date — auto-accrued into real transactions so balances stay honest without manual logging.
- **Savings goals** in four kinds: savings target, net-worth target, FIRE (configurable multiplier), debt payoff (linked to a loan account, drives balance to zero).
- **Predictions** as a chat-driven canvas. Ask anything ("can I hit my emergency fund in 18 months if I get a 30% raise?"), the advisor reads your real balance sheet and proposes both projection scenarios *and concrete edits* to your budgets / goals / flows that you can apply with one click.
- **Proactive alerts** — runway critical, budgets over cap, goals off-pace — surface in a sidebar bell + a `/alerts` page, with a banner on the dashboard for criticals.
- **AI advisor chat** seeded with your real accounts, decisions, runway, transactions, budgets, and goals. Bring your own Anthropic / OpenAI / Google key. Has tool access to log transactions, create budgets, and adjust flows on your behalf.
- **Month filter** that scopes the entire app — accounts, net worth, cash flow, alerts, transactions — to any past month, so you can see what your balance was at the end of March without losing today's view.
- **Screen lock** with idle timeout + manual `⌘⇧L` shortcut, plus **panic mode** (`⌘⇧P`) for one-click sign-out + redirect when someone walks up.
- **Single-admin auth** with an optional viewer password for read-only sharing (spouse, accountant, co-founder). HMAC-signed cookies, gated via `proxy.ts`. No multi-tenant, no OAuth.

## Run it

### With the prebuilt image (fastest)

The repo publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to GHCR on every push to `main` and on tagged releases.

```bash
docker run -d \
  --name cairn \
  -p 3000:3000 \
  -v cairn-data:/data \
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

Data persists in the named volume. Back up by copying `/data/app.db` out of the volume on a cron — see [Backup](#backup).

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
5. **Settings → Security** — pick a screen-lock idle timeout and (optionally) a panic redirect URL.
6. **Accounts** — add cash / brokerage / crypto / retirement / loans. Each one starts with an opening snapshot.
7. **Equity** — add each grant. Strike, vested shares, FMV, expected exit price.
8. **Cash flow** — log recurring income (salary) and expenses (rent, subscriptions). Pick an explicit next-due date for paydays.

## Sharing read-only access

Set `VIEWER_PASSWORD` to a second password and hand it to whoever needs visibility — spouse, accountant, co-founder. They sign in with the viewer password (same form as admin) and see every page exactly the way you do, but every "Add" / "Edit" / "Delete" affordance is hidden, and the underlying server actions reject the call. Leave `VIEWER_PASSWORD` unset to disable sharing entirely.

## Stack

- **Next.js 16** (App Router), TypeScript, Tailwind v4
- **shadcn/ui** (radix base, new-york style, dark by default), Geist
- **Drizzle ORM** + **better-sqlite3** (single-file SQLite, WAL mode)
- **AI SDK v6** with provider adapters for Anthropic, OpenAI, and Google
- **Auth**: HMAC-signed cookie, single env var password, gated via `proxy.ts`

## Releases

Releases are driven by [release-please](https://github.com/googleapis/release-please) on every push to `main`. Conventional-commit prefixes (`feat:`, `fix:`, `perf:`, `chore:`, `BREAKING CHANGE:`) are converted into a versioned `CHANGELOG.md` entry; the bot maintains a single open "release PR" with the version bump and accumulated changelog, and merging that PR tags `vX.Y.Z` + creates a GitHub Release.

The Docker workflow (`.github/workflows/docker.yml`) fires on `release: published` and on `v*` tag pushes, so a merged release PR ends with a freshly published `ghcr.io/9trocode/fmanager:vX.Y.Z` (and `:latest` from the same SHA on `main`).

By default release-please uses `GITHUB_TOKEN`, which (intentionally) does not cascade workflows. To get end-to-end auto-publishing — release PR merge → tag → Docker build — create a fine-grained PAT with `contents: write` + `actions: write`, save it as the repo secret `RELEASE_PLEASE_TOKEN`, and the workflow picks it up automatically.

## Backup

This is a self-hosted single-file SQLite app. **You are the SRE.** Pick one:

- Cron `cp /data/app.db /backups/app-$(date +%Y%m%d).db`
- Restic, Borg, or Litestream for continuous backup
- Drop the volume directory into Dropbox / Syncthing
- Or use Settings → Data Tools → Export to grab the whole DB as JSON

If you skip this and your VPS dies, your data is gone. There is no cloud version waving at you from the corner.

## Status

v1.1 — feature-complete enough to run a real founder's books. Predictions are agentic, balance math is FX-aware, alerts are proactive, the month filter scopes the entire app retroactively. Polish, mobile UX, and bank integrations come next. See [ONE-PAGER.md](./ONE-PAGER.md) for the longer product brief.

## License

MIT.
