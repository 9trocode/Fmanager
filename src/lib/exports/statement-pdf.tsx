import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  pdf,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { MonthlyStatement, MonthRow } from "./statement-data";
import { ACCOUNT_TYPE_LABEL } from "@/lib/account-types";
import { SCENARIO_LABEL } from "@/lib/scenarios";

// ─── Brand tokens ────────────────────────────────────────────────────────────

const C = {
  ink: "#171717",
  inkSoft: "#525252",
  inkFaint: "#A3A3A3",
  rule: "#E5E5E5",
  zebra: "#FAFAF9",
  primary: "#0F766E",
  primaryFaint: "#E6F4F2",
  bad: "#B91C1C",
  good: "#15803D",
  panel: "#F5F5F4",
  paper: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
    backgroundColor: C.paper,
  },
  cover: {
    paddingTop: 96,
    paddingHorizontal: 48,
    paddingBottom: 64,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 32,
  },
  brandText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 1.6,
    color: C.ink,
  },
  rule: {
    height: 1,
    backgroundColor: C.rule,
    marginVertical: 18,
  },
  primaryRule: {
    height: 2,
    backgroundColor: C.primary,
    marginVertical: 18,
    width: 48,
  },
  coverTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 36,
    color: C.ink,
    lineHeight: 1.1,
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 13,
    color: C.inkSoft,
    lineHeight: 1.45,
    maxWidth: 380,
  },
  coverMeta: {
    fontFamily: "Courier",
    fontSize: 9,
    color: C.inkFaint,
    marginTop: 36,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pageHeaderTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: C.ink,
  },
  pageHeaderSub: {
    fontFamily: "Courier",
    fontSize: 9,
    color: C.inkFaint,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.ink,
    marginTop: 18,
    marginBottom: 8,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  kpi: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: C.panel,
    borderRadius: 6,
  },
  kpiLabel: {
    fontSize: 8,
    color: C.inkSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: C.ink,
  },
  kpiSub: {
    fontFamily: "Courier",
    fontSize: 8,
    color: C.inkFaint,
    marginTop: 4,
  },
  table: {
    marginTop: 6,
  },
  tHeader: {
    flexDirection: "row",
    backgroundColor: C.primary,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.paper,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
  },
  tRowZebra: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.rule,
    backgroundColor: C.zebra,
  },
  tCell: { fontSize: 9, color: C.ink },
  tCellMono: {
    fontSize: 9,
    color: C.ink,
    fontFamily: "Courier",
  },
  tCellSoft: { fontSize: 9, color: C.inkSoft },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    fontFamily: "Courier",
    fontSize: 8,
    color: C.inkFaint,
  },
  footerRight: {
    fontFamily: "Courier",
    fontSize: 8,
    color: C.inkFaint,
  },
  bar: {
    backgroundColor: C.primary,
    height: 8,
    borderRadius: 2,
  },
  barTrack: {
    height: 8,
    backgroundColor: C.panel,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  barNeg: {
    backgroundColor: C.bad,
    height: 8,
    borderRadius: 2,
  },
});

// Three-stone cairn glyph. Bottom widest, top off-axis — same vibe as the
// in-app SVG, simplified for vector PDF rendering.
function CairnMark({ size = 18, color = C.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 19.5 C3 18 5.5 17 12 17 C18.5 17 21 18 21 19.5 C21 21 18.5 21.6 12 21.6 C5.5 21.6 3 21 3 19.5 Z"
        fill={color}
      />
      <Path
        d="M5.5 13.6 C5.5 12.4 7.5 11.6 12 11.6 C16.5 11.6 18.5 12.4 18.5 13.6 C18.5 14.8 16.5 15.4 12 15.4 C7.5 15.4 5.5 14.8 5.5 13.6 Z"
        fill={color}
      />
      <Path
        d="M9 7.4 C9 6.4 10.2 5.6 12.6 5.6 C15 5.6 16.2 6.4 16.2 7.4 C16.2 8.4 15 9.2 12.6 9.2 C10.2 9.2 9 8.4 9 7.4 Z"
        fill={color}
      />
    </Svg>
  );
}

function fmtMoney(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${currency} ${formatted}`;
}

function fmtPct(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

// ─── Cover page ──────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: MonthlyStatement }) {
  return (
    <Page size="A4" style={styles.cover}>
      <View style={styles.brandRow}>
        <CairnMark size={22} color={C.primary} />
        <Text style={styles.brandText}>CAIRN</Text>
      </View>

      <View style={styles.primaryRule} />
      <Text style={styles.coverTitle}>Financial Statement</Text>
      <Text style={styles.coverSubtitle}>
        {data.range.fromMonth} — {data.range.toMonth}
        {"\n"}
        {data.ownerName ?? data.ownerEmail ?? "Self-hosted instance"}
      </Text>

      <View style={{ marginTop: 56 }}>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Net worth</Text>
            <Text style={styles.kpiValue}>
              {fmtMoney(data.totals.netWorth, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>end of {data.range.toMonth}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Total income</Text>
            <Text
              style={{
                ...styles.kpiValue,
                color: C.good,
              }}
            >
              {fmtMoney(data.totals.income, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>across {data.months.length} months</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Total expenses</Text>
            <Text
              style={{
                ...styles.kpiValue,
                color: C.bad,
              }}
            >
              {fmtMoney(data.totals.expenses, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>
              avg{" "}
              {fmtMoney(
                data.totals.expenses / Math.max(1, data.months.length),
                data.baseCurrency,
              )}{" "}
              / mo
            </Text>
          </View>
        </View>

        <View style={[styles.kpiRow, { marginTop: 10 }]}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Net saved</Text>
            <Text style={styles.kpiValue}>
              {fmtMoney(data.totals.net, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>
              {data.totals.income > 0
                ? `${fmtPct(data.totals.net / data.totals.income)} savings rate`
                : "no income recorded"}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Best month</Text>
            <Text style={styles.kpiValue}>
              {fmtMoney(data.totals.bestMonthNet, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>{data.totals.bestMonthLabel}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Activity</Text>
            <Text style={styles.kpiValue}>{data.transactions.length}</Text>
            <Text style={styles.kpiSub}>transactions logged</Text>
          </View>
        </View>
      </View>

      <View style={{ flexGrow: 1 }} />

      <Text style={styles.coverMeta}>
        generated {new Date(data.generatedAt).toLocaleString()} · base{" "}
        {data.baseCurrency} · self-hosted, your data stays on your machine
      </Text>
    </Page>
  );
}

// ─── Page header / footer (reused) ───────────────────────────────────────────

function PageChrome({
  title,
  data,
  children,
}: {
  title: string;
  data: MonthlyStatement;
  children: ReactElement | ReactElement[];
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageHeaderTitle}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <CairnMark size={12} color={C.inkFaint} />
          <Text style={styles.pageHeaderSub}>
            {data.range.fromMonth} — {data.range.toMonth}
          </Text>
        </View>
      </View>
      <View style={styles.rule} />
      {children}
      <View style={styles.footer} fixed>
        <Text style={styles.footerLeft}>
          Cairn · self-hosted personal finance
        </Text>
        <Text
          style={styles.footerRight}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

// ─── Summary table page ──────────────────────────────────────────────────────

function MaxAbs(rows: MonthRow[]): number {
  let max = 0;
  for (const r of rows) {
    max = Math.max(max, Math.abs(r.income), Math.abs(r.expenses));
  }
  return max || 1;
}

function MonthlyTable({ data }: { data: MonthlyStatement }) {
  const max = MaxAbs(data.months);
  const cols = [
    { w: 60, label: "Month" },
    { w: 70, label: `Income (${data.baseCurrency})` },
    { w: 70, label: `Expenses` },
    { w: 70, label: `Net` },
    { w: 50, label: `Save %` },
    { w: 80, label: `Net worth` },
    { w: 80, label: `Cash + Inv.` },
  ];
  return (
    <View style={styles.table}>
      <View style={styles.tHeader}>
        {cols.map((c) => (
          <Text key={c.label} style={[styles.tHeaderText, { width: c.w }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {data.months.map((m, i) => {
        const isZebra = i % 2 === 1;
        const incPct = Math.min(1, Math.abs(m.income) / max);
        const expPct = Math.min(1, Math.abs(m.expenses) / max);
        return (
          <View key={m.key} style={isZebra ? styles.tRowZebra : styles.tRow}>
            <Text style={[styles.tCell, { width: cols[0].w }]}>{m.label}</Text>
            <View style={{ width: cols[1].w }}>
              <Text style={styles.tCellMono}>
                {fmtMoney(m.income, data.baseCurrency)}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${incPct * 100}%` }]} />
              </View>
            </View>
            <View style={{ width: cols[2].w }}>
              <Text style={styles.tCellMono}>
                {fmtMoney(m.expenses, data.baseCurrency)}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barNeg, { width: `${expPct * 100}%` }]} />
              </View>
            </View>
            <Text
              style={[
                styles.tCellMono,
                {
                  width: cols[3].w,
                  color: m.net < 0 ? C.bad : m.net > 0 ? C.good : C.inkSoft,
                },
              ]}
            >
              {fmtMoney(m.net, data.baseCurrency)}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[4].w }]}>
              {fmtPct(m.savingsRate)}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[5].w }]}>
              {fmtMoney(m.netWorth, data.baseCurrency)}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[6].w }]}>
              {fmtMoney(m.cash + m.investments, data.baseCurrency)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Accounts page ───────────────────────────────────────────────────────────

function AccountsTable({ data }: { data: MonthlyStatement }) {
  const cols = [
    { w: 130, label: "Account" },
    { w: 70, label: "Type" },
    { w: 50, label: "Currency" },
    { w: 100, label: "Closing (native)" },
    { w: 100, label: `Closing (${data.baseCurrency})` },
  ];
  return (
    <View style={styles.table}>
      <View style={styles.tHeader}>
        {cols.map((c) => (
          <Text key={c.label} style={[styles.tHeaderText, { width: c.w }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {data.accounts.map((a, i) => {
        const isZebra = i % 2 === 1;
        return (
          <View key={a.id} style={isZebra ? styles.tRowZebra : styles.tRow}>
            <Text style={[styles.tCell, { width: cols[0].w }]}>{a.name}</Text>
            <Text style={[styles.tCellSoft, { width: cols[1].w }]}>
              {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
            </Text>
            <Text style={[styles.tCellSoft, { width: cols[2].w }]}>
              {a.currency}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[3].w }]}>
              {fmtMoney(a.closingNative, a.currency)}
            </Text>
            <Text
              style={[
                styles.tCellMono,
                {
                  width: cols[4].w,
                  color: a.closingBase < 0 ? C.bad : C.ink,
                },
              ]}
            >
              {fmtMoney(a.closingBase, data.baseCurrency)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Equity page ─────────────────────────────────────────────────────────────

function EquityTable({ data }: { data: MonthlyStatement }) {
  const cols = [
    { w: 110, label: "Company" },
    { w: 80, label: "Vested / Total" },
    { w: 50, label: "Type" },
    { w: 70, label: SCENARIO_LABEL.floor },
    { w: 70, label: SCENARIO_LABEL.liquid },
    { w: 70, label: SCENARIO_LABEL.expected },
  ];
  return (
    <View style={styles.table}>
      <View style={styles.tHeader}>
        {cols.map((c) => (
          <Text key={c.label} style={[styles.tHeaderText, { width: c.w }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {data.equity.map((g, i) => {
        const isZebra = i % 2 === 1;
        const pct = g.totalShares > 0 ? g.vestedShares / g.totalShares : 0;
        return (
          <View key={g.id} style={isZebra ? styles.tRowZebra : styles.tRow}>
            <Text style={[styles.tCell, { width: cols[0].w }]}>{g.company}</Text>
            <Text style={[styles.tCellMono, { width: cols[1].w }]}>
              {Math.round(g.vestedShares).toLocaleString()} /{" "}
              {Math.round(g.totalShares).toLocaleString()} (
              {(pct * 100).toFixed(0)}%)
            </Text>
            <Text style={[styles.tCellSoft, { width: cols[2].w }]}>
              {g.grantType.toUpperCase()}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[3].w }]}>
              {fmtMoney(g.values.floor, data.baseCurrency)}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[4].w }]}>
              {fmtMoney(g.values.liquid, data.baseCurrency)}
            </Text>
            <Text style={[styles.tCellMono, { width: cols[5].w }]}>
              {fmtMoney(g.values.expected, data.baseCurrency)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────

function StatementDoc({ data }: { data: MonthlyStatement }) {
  return (
    <Document
      title={`Cairn statement — ${data.range.fromMonth} to ${data.range.toMonth}`}
      author={data.ownerName ?? "Cairn"}
    >
      <CoverPage data={data} />

      <PageChrome title="Monthly performance" data={data}>
        <Text style={styles.sectionTitle}>Cashflow + balance sheet</Text>
        <MonthlyTable data={data} />
      </PageChrome>

      <PageChrome title="Accounts" data={data}>
        <Text style={styles.sectionTitle}>
          Closing balances at end of {data.range.toMonth}
        </Text>
        <AccountsTable data={data} />
      </PageChrome>

      {data.equity.length > 0 ? (
        <PageChrome title="Equity" data={data}>
          <Text style={styles.sectionTitle}>
            Three-scenario grant snapshot
          </Text>
          <EquityTable data={data} />
        </PageChrome>
      ) : null}
    </Document>
  );
}

export async function buildStatementPdf(
  data: MonthlyStatement,
): Promise<Buffer> {
  const stream = await pdf(<StatementDoc data={data} />).toBuffer();
  // toBuffer returns a Node Readable. Collect.
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
