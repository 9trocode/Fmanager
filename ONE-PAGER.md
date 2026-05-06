# Founder Finance — One-Pager

> Working name. Self-hosted, open-source **personal finance** tool for founders.

## Problem

A co-founder's personal balance sheet is uniquely weird: multi-currency cash (NGN/USD/EUR), brokerage accounts in 2-3 jurisdictions, crypto, retirement, real estate, debt, recurring living expenses — plus a giant slab of private company equity that may or may not ever be worth anything. Existing personal finance tools handle some of these well (Monarch, Copilot — single-currency PFM) or others (Kubera, Ghostfolio — multi-asset, but still gated behind premium and ugly). None of them treat private equity honestly. None of them help with **the actual personal-life decisions** a founder is making this quarter.

## Goal

Manage your **whole personal financial life** as a co-founder — accounts, transactions, budgets, savings goals, recurring flows — across currencies, with private equity modeled honestly as one asset on your personal balance sheet, so you can confidently answer concrete personal decisions: exercise, allocate, save, spend, hedge.

This is **not** a tool for managing the company's books or calculating company runway. The company is your employer; your stake in it is your asset.

## Non-goals

- Bank/brokerage integrations (Plaid, Mono). Manual entry + AI receipt scan + voice + CSV.
- Multi-tenant SaaS. Single admin per deployment, with optional read-only share.
- Mobile app. Web first, responsive.
- Real-time market data. Daily FX refresh; equity prices are user-supplied.
- Tax planning, estate planning, advisor licensing. Not advice — opinionated tooling.
- Company financial management. This tracks *you*, not your company's P&L.

## Wedge / positioning

> **Personal finance for co-founders. Truly free, founder-aware, actually beautiful.**

Three things justify this existing alongside Ghostfolio / Kubera / Monarch / YNAB:

1. **Three-scenario equity:** every grant has a Floor (zero), Liquid (current 409A/FMV), and Expected (target exit). The dashboard shows all three side-by-side. Personal decisions are made against the floor, not the ceiling.
2. **Multi-currency native:** NGN, USD, EUR, GBP first-class. No "base currency" assumption that punishes you when the naira moves.
3. **Decision-anchored AI advisor:** seeded with your real personal decisions, full personal balance sheet context, and a strong prior toward "what's the honest answer." Not a Calendly-tier chatbot.

And underneath: no premium tier exists. BYO infrastructure (`docker compose up`), BYO LLM key. Aesthetic bar is "tool a founder is proud to leave open on their second monitor" — Linear / Mercury / Things 3 grade, not 2015 Bootstrap admin panel.

## What ships

1. **Accounts** — manual CRUD. Type (cash/brokerage/crypto/real estate/equity/retirement/loan/other), currency, balance via snapshots, effective balance after transactions.
2. **Transactions** — per-transaction logging with filters, monthly grouping, account-level history. AI receipt scan (Claude vision) and voice input (Web Speech API) for fast capture.
3. **Cash flow** — recurring income and expense streams in any currency, normalized to a monthly net.
4. **Budgets** — per-category monthly limits, drill-into "log spend" flow, dashboard alerts.
5. **Savings goals** — named targets with monthly contribution + horizon + return assumptions; per-goal projection chart and net-worth-at-completion view.
6. **Equity grants** — strike, vested shares, FMV, expected exit, vesting curve, exit-timing assumption, tax rate. Each grant computes Floor/Liquid/Expected per scenario.
7. **FX** — refreshable rates, multi-base. Net worth and breakdowns re-render in any base currency.
8. **Dashboard** — net worth in 3 scenarios with a tab toggle, breakdown by category and by currency, personal cash coverage card, top budgets.
9. **Projections** — "$X/month for N months at Y% return" → three lines (Floor / Liquid / Expected) using each grant's vesting and exit timing.
10. **Decisions** — your active personal financial questions; the advisor anchors every answer on these.
11. **Advisor** — chat with Anthropic; system prompt explicitly frames as personal finance and includes your full balance sheet, flows, budgets, goals, and decisions.
12. **Sharing** — optional `VIEWER_PASSWORD` for read-only access (partner / accountant).

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind v4
- shadcn/ui (radix base, new-york style, dark by default) · Geist
- Drizzle ORM + better-sqlite3 (one file, easy to back up)
- AI SDK v6 + `@ai-sdk/anthropic` (BYO key, no gateway)
- Auth: HMAC-signed cookie + env-var password(s), gated via `proxy.ts`
- Self-hosted: `docker compose up` or `pnpm dev`

## Success criteria

- I (the user) replace whatever I currently track in spreadsheets within 2 weeks of dogfooding.
- I can answer my active personal decisions with the dashboard + advisor in <5 min each.
- The Floor net worth (`equity = $0`) looks honest. If the number makes me uncomfortable, the tool is doing its job.
- Self-hosted setup is `docker compose up` + open browser. No README-grade footguns.

## Riskiest assumption

Founders will self-host a personal finance tool. The privacy-conscious technical-founder archetype is real but small; most will pay $15/mo for Kubera or Monarch and not think twice. Validate by dogfooding for 4 weeks, then handing the docker-compose to 5 founders. If <2 stand it up, this is a personal tool, not a product.

## License

MIT.
