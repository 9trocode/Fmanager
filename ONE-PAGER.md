# Founder Finance — One-Pager

> Working name. Self-hosted, open-source net worth tool for founders.

## Problem

Founders carry weird balance sheets: multi-currency cash (NGN/USD/EUR), brokerage accounts in 2-3 jurisdictions, crypto, and a giant slab of private company equity that may or may not ever be worth anything. Existing tools handle 2 of these well (Monarch, Copilot — single-currency PFM) or 3 (Kubera, Ghostfolio — multi-asset, but still gated behind premium and ugly). None of them treat private equity honestly. None of them help with **the actual decisions** a founder is making this quarter.

## Goal

Give a founder enough visibility into their **honest** balance sheet — across currencies, across asset classes, with private equity modeled in three scenarios — that they can confidently answer concrete decisions: exercise, allocate, save, spend.

## Non-goals (MVP)

- Bank/brokerage integrations (Plaid, Mono). Manual entry + CSV import only.
- Multi-tenant SaaS. Single admin per deployment.
- Mobile app. Web first, responsive.
- Real-time market data. Daily FX refresh; equity prices are user-supplied.
- Tax planning, estate planning, advisor licensing. Not advice — opinionated tooling.
- Budget categorization / transaction-level PFM. We track balances and trajectories, not lattes.

## Wedge / positioning

> **Truly free, founder-grade, actually beautiful.**

Three things justify this existing alongside Ghostfolio / Kubera / Monarch:

1. **Three-scenario equity:** every grant has a Floor (zero), Expected (target exit price), and Liquid (current 409A/FMV). The dashboard shows all three side-by-side. Decisions are made against the floor, not the ceiling.
2. **Multi-currency native:** NGN, USD, EUR, GBP first-class. No "base currency" assumption that punishes you when the naira moves.
3. **Decision-anchored AI advisor:** seeded with your three real decisions, full balance sheet context, and a strong prior toward "what's the honest answer." Not a Calendly-tier chatbot.

And underneath: no premium tier exists. BYO infrastructure (`docker compose up`), BYO LLM key. Aesthetic bar is "tool a founder is proud to leave open on their second monitor" — Linear / Mercury / Things 3 grade, not 2015 Bootstrap admin panel.

## MVP scope

1. **Accounts** — manual CRUD. Type (cash/brokerage/crypto/real estate/equity/retirement/loan/other), currency, current balance via snapshots.
2. **FX** — daily refresh, multi-base. Net worth re-renders in any base currency.
3. **Equity grants** — model strike, vested shares, FMV, exit price. Each grant computes Floor/Expected/Liquid automatically.
4. **Dashboard** — net worth in 3 scenarios with a tab toggle, breakdown by category and by currency.
5. **Projections** — "$X/month for N months at Y% return" → three lines (Floor / Expected / Liquid).
6. **Advisor** — chat anchored on the user's 3 decisions + balance sheet context. BYO Anthropic key.
7. **Settings** — base currency, AI key, decisions, sign-out, DB path.
8. **Auth** — single admin password (env var). No multi-user. No OAuth.

## Stack

- **Next.js 16** App Router + TypeScript + Tailwind v4
- **shadcn/ui** (new-york style) + dark mode default + Geist
- **Drizzle ORM** + **better-sqlite3** (one file, easy backup)
- **AI SDK v6** + **@ai-sdk/anthropic** (BYO key)
- Auth: HMAC-signed cookie + single env var password, gated via `proxy.ts`
- Deploy: `pnpm build && pnpm start` or Docker (planned)

## Success criteria

- I (the user) replace whatever I currently track in spreadsheets within 2 weeks of MVP.
- I can answer my 3 active decisions with the dashboard + advisor in <5 min each.
- Self-hosted setup is `docker compose up` + open browser. No README-grade footguns.
- Floor net worth (`equity = $0`) looks honest. If the number makes me uncomfortable, the tool is doing its job.

## Riskiest assumption

Founders will self-host. The privacy-conscious technical-founder archetype is real but small; most will pay $15/mo for Kubera and not think twice. **Test before scope creep**: ship MVP, dogfood for 4 weeks, then hand the docker-compose to 5 founders in your network. If <2 of them stand it up, this is a personal tool, not a product — adjust roadmap accordingly.

## What's NOT in v0.1 (parked, not killed)

- Plaid / Mono / Pluggy bring-your-own-key integrations
- Real estate valuation via Zillow-style APIs
- Crypto wallet on-chain reading
- Multi-user with read-only sharing (e.g., for spouse or accountant)
- iOS app
- Vesting schedule modeling (cliff, monthly, with concentrated tranches)
- Tax-aware exit projections (long-term cap gains, AMT for ISOs)
- "What if NGN devalues 30%?" stress tests
- Goal tracking ("save $200k in 24 months" with progress bars)
- CSV import from common brokerages
