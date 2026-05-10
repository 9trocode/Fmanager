import "server-only";
import { ACCOUNT_TYPE_LABEL } from "@/lib/account-types";
import { SCENARIO_LABEL } from "@/lib/scenarios";
import type { MonthlyStatement } from "./statement-data";

/**
 * Single multi-section CSV — the reimagined "statement bundle"
 * without the ZIP overhead.
 *
 * Why one file with section markers (`## SUMMARY`, `## TRANSACTIONS`,
 * etc.) instead of a ZIP of separate CSVs:
 *
 *   • Excel / Sheets / Numbers all open it in one tab. The section
 *     headers land in column A as plain cells; you just scroll.
 *   • Scripts can split on `^## ` to recover individual tables —
 *     pandas: `text.split("\n## ")`. No archive library needed
 *     either side.
 *   • Same content shape as the PDF + Excel statement, so a user
 *     who picked the wrong format earlier can grab this and get
 *     everything in one download.
 *
 * The header is RFC-comment-style (`# `) lines on top with the
 * range, base currency, generated stamp, and owner — a parser that
 * skips comment lines (most do) gets the data tables directly.
 */

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "number" ? formatNumber(v) : String(v);
  // Quote if contains comma, quote, or newline. Escape embedded "" → "".
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Two decimals — same precision as the PDF shows. Avoids exponential
  // notation for very large numbers (toFixed handles that).
  return n.toFixed(2);
}

function row(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

function section(title: string, lines: string[]): string {
  // Blank line between sections so eyeballing in a spreadsheet has
  // breathing room and `text.split("\n\n## ")` works cleanly in scripts.
  return `\n## ${title}\n${lines.join("\n")}`;
}

export function buildStatementCsv(data: MonthlyStatement): string {
  const monthLabels = data.months.map((m) => m.label);
  const lines: string[] = [];

  // ── Metadata header (RFC-style comment lines) ──────────────────
  lines.push("# Cairn financial statement");
  lines.push(`# Range: ${data.range.fromMonth} — ${data.range.toMonth}`);
  lines.push(`# Base currency: ${data.baseCurrency}`);
  lines.push(`# Generated: ${data.generatedAt}`);
  if (data.ownerName || data.ownerEmail) {
    lines.push(`# Owner: ${data.ownerName ?? ""} ${data.ownerEmail ? `<${data.ownerEmail}>` : ""}`.trim());
  }

  // ── Headline rollup ────────────────────────────────────────────
  // First section is intentionally tiny — it's what an LLM, dashboard
  // import, or quick-glance reader needs without scrolling.
  const t = data.totals;
  lines.push(
    section("HEADLINE", [
      row(["metric", "value"]),
      row(["net_worth", t.netWorth]),
      row(["net_worth_start", t.netWorthStart]),
      row(["net_worth_delta", t.netWorthDelta]),
      row(["income_total", t.income]),
      row(["expenses_total", t.expenses]),
      row(["net_saved", t.net]),
      row([
        "savings_rate_pct",
        t.income > 0 ? (t.net / t.income) * 100 : "",
      ]),
      row(["best_month_net", t.bestMonthNet]),
      row(["best_month_label", t.bestMonthLabel]),
      row(["monthly_burn_avg_3mo", t.monthlyBurn]),
      row([
        "runway_months",
        t.runwayMonths == null ? "" : t.runwayMonths,
      ]),
      row(["transactions_count", data.transactions.length]),
      row(["months_count", data.months.length]),
    ]),
  );

  // ── Monthly summary — one row per month, every chartable metric ─
  lines.push(
    section(
      "MONTHLY SUMMARY (one row per month, base currency)",
      [
        row([
          "month",
          "income",
          "expenses",
          "net",
          "savings_rate_pct",
          "net_worth",
          "cash",
          "investments",
          "equity_liquid",
          "tx_count",
        ]),
        ...data.months.map((m) =>
          row([
            m.label,
            m.income,
            m.expenses,
            m.net,
            m.savingsRate != null ? m.savingsRate * 100 : "",
            m.netWorth,
            m.cash,
            m.investments,
            m.equityLiquid,
            m.txCount,
          ]),
        ),
      ],
    ),
  );

  // ── Categories cross-tab (rows = category, cols = months) ──────
  if (data.categories.length > 0) {
    lines.push(
      section(
        `CATEGORIES (rows = category, cols = months, base ${data.baseCurrency})`,
        [
          row([
            "category",
            ...monthLabels,
            `total_${data.baseCurrency.toLowerCase()}`,
            "share_pct",
            "tx_count",
          ]),
          ...data.categories.map((c) =>
            row([
              c.category,
              ...c.perMonth,
              c.totalBase,
              c.share * 100,
              c.txCount,
            ]),
          ),
        ],
      ),
    );
  }

  // ── Goals snapshot ─────────────────────────────────────────────
  if (data.goals.length > 0) {
    lines.push(
      section("GOALS (active savings goals)", [
        row([
          "name",
          "kind",
          "currency",
          "target",
          "current",
          "progress_pct",
          "monthly_contribution",
          "eta_months",
          "status",
        ]),
        ...data.goals.map((g) =>
          row([
            g.name,
            g.kind,
            g.currency,
            g.target ?? "",
            g.current,
            g.progress != null ? g.progress * 100 : "",
            g.monthlyContribution,
            g.etaMonths ?? "",
            g.done
              ? "Done"
              : g.onPace == null
                ? ""
                : g.onPace
                  ? "On pace"
                  : "Off pace",
          ]),
        ),
      ]),
    );
  }

  // ── Budgets — current-month status ─────────────────────────────
  if (data.budgets.length > 0) {
    lines.push(
      section(`BUDGETS (status this month — ${data.range.toMonth})`, [
        row([
          "category",
          "currency",
          "monthly_limit",
          "spent_this_month",
          "used_pct",
          "status",
        ]),
        ...data.budgets.map((b) =>
          row([
            b.category,
            b.currency,
            b.monthlyLimit,
            b.spentThisMonth,
            b.percentUsed,
            b.status === "over"
              ? "Over"
              : b.status === "warning"
                ? "Watch"
                : "Healthy",
          ]),
        ),
      ]),
    );
  }

  // ── Accounts — closing balance per account per month ───────────
  // Cross-tab matches the Excel Accounts sheet so users can pivot
  // identically across formats.
  const closingByKey = new Map<string, number>();
  for (const am of data.accountMonthly) {
    closingByKey.set(`${am.accountId}|${am.monthKey}`, am.closingNative);
  }
  lines.push(
    section(
      `ACCOUNTS (closing balance per month, account currency; latest in base ${data.baseCurrency})`,
      [
        row([
          "account",
          "type",
          "currency",
          "institution",
          ...monthLabels,
          `latest_${data.baseCurrency.toLowerCase()}`,
        ]),
        ...data.accounts.map((a) =>
          row([
            a.name,
            ACCOUNT_TYPE_LABEL[a.type] ?? a.type,
            a.currency,
            a.institution ?? "",
            ...data.months.map(
              (m) => closingByKey.get(`${a.id}|${m.key}`) ?? 0,
            ),
            a.closingBase,
          ]),
        ),
      ],
    ),
  );

  // ── Transactions — every tx in the range ───────────────────────
  // Sorted newest-first to match the in-app /transactions order.
  const sortedTxs = data.transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  lines.push(
    section("TRANSACTIONS (every transaction in range)", [
      row([
        "date",
        "month",
        "account",
        "destination",
        "kind",
        "category",
        "amount",
        "currency",
        `amount_${data.baseCurrency.toLowerCase()}`,
        "notes",
      ]),
      ...sortedTxs.map((tx) => {
        const sign = tx.kind === "expense" ? -1 : 1;
        return row([
          tx.date,
          tx.monthKey,
          tx.account,
          tx.destAccount ?? "",
          tx.kind,
          tx.category ?? "",
          sign * tx.amount,
          tx.currency,
          sign * tx.amountBase,
          tx.notes ?? "",
        ]);
      }),
    ]),
  );

  // ── Equity grants — three scenarios ────────────────────────────
  if (data.equity.length > 0) {
    lines.push(
      section(`EQUITY GRANTS (three scenarios, base ${data.baseCurrency})`, [
        row([
          "company",
          "account",
          "type",
          "total_shares",
          "vested_shares",
          "strike",
          "fmv_per_share",
          "currency",
          `${SCENARIO_LABEL.floor.toLowerCase()}_${data.baseCurrency.toLowerCase()}`,
          `${SCENARIO_LABEL.liquid.toLowerCase().replace(/\s+/g, "_")}_${data.baseCurrency.toLowerCase()}`,
          `${SCENARIO_LABEL.expected.toLowerCase()}_${data.baseCurrency.toLowerCase()}`,
        ]),
        ...data.equity.map((g) =>
          row([
            g.company,
            g.account,
            g.grantType,
            g.totalShares,
            g.vestedShares,
            g.strike ?? "",
            g.fmv ?? "",
            g.currency,
            g.values.floor,
            g.values.liquid,
            g.values.expected,
          ]),
        ),
      ]),
    );
  }

  // Trailing newline so POSIX tools like `wc -l` count cleanly.
  return lines.join("\n") + "\n";
}
