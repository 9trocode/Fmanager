import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  Polyline,
  Rect,
  Line,
  pdf,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type {
  MonthlyStatement,
  MonthRow,
  CategoryRow,
  GoalRow,
  BudgetRow,
} from "./statement-data";
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

function fmtSignedMoney(value: number, currency: string): string {
  if (value === 0) return fmtMoney(0, currency);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${fmtMoney(Math.abs(value), currency)}`;
}

// ─── Chart primitives — native react-pdf SVGs ───────────────────────────────
//
// react-pdf doesn't ship a chart library, but it does render SVG natively
// (rect / line / polyline / path), so we can draw production-grade
// charts inline without bundling recharts or chart.js. Each helper
// takes a width/height + a numeric series and produces a clean,
// printable visualization that fits the brand.

function Sparkline({
  values,
  width,
  height,
  stroke = C.primary,
  fill,
}: {
  values: number[];
  width: number;
  height: number;
  stroke?: string;
  fill?: string;
}) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // Normalize each point onto the box: x evenly across width,
  // y inverted so larger values draw higher (SVG y grows down).
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <Svg width={width} height={height}>
      {fill ? (
        <Path
          d={`M0,${height} L${points} L${width},${height} Z`}
          fill={fill}
        />
      ) : null}
      <Polyline
        points={points}
        stroke={stroke}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  );
}

function LineChart({
  values,
  labels,
  width,
  height,
  stroke = C.primary,
  fill = C.primaryFaint,
}: {
  values: number[];
  labels?: string[];
  width: number;
  height: number;
  stroke?: string;
  fill?: string;
}) {
  if (values.length === 0) return null;
  const padX = 28;
  const padTop = 6;
  const padBot = 18;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBot;
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = padX + i * step;
      const y = padTop + (1 - (v - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(" ");
  // Y-axis ticks: just show min, mid, max so the eye has scale anchors.
  const midY = (max + min) / 2;
  const ticks = [
    { v: max, y: padTop },
    { v: midY, y: padTop + innerH / 2 },
    { v: min, y: padTop + innerH },
  ];
  // X labels: first, middle, last to keep it readable.
  const xLabels = labels
    ? [
        { i: 0, label: labels[0] },
        labels.length > 2
          ? { i: Math.floor(labels.length / 2), label: labels[Math.floor(labels.length / 2)] }
          : null,
        { i: labels.length - 1, label: labels[labels.length - 1] },
      ].filter((x): x is { i: number; label: string } => x != null)
    : [];
  return (
    <Svg width={width} height={height}>
      {/* horizontal gridlines */}
      {ticks.map((t, i) => (
        <Line
          key={i}
          x1={padX}
          y1={t.y}
          x2={width - padX}
          y2={t.y}
          stroke={C.rule}
          strokeWidth={0.5}
        />
      ))}
      {/* filled area */}
      <Path
        d={`M${padX},${padTop + innerH} L${points} L${width - padX},${padTop + innerH} Z`}
        fill={fill}
      />
      <Polyline
        points={points}
        stroke={stroke}
        strokeWidth={1.6}
        fill="none"
      />
      {/* y-tick labels (right-edge) */}
      {ticks.map((t, i) => (
        <Text
          key={`y${i}`}
          x={width - padX + 4}
          y={t.y + 3}
          style={{ fontSize: 6, fontFamily: "Courier", color: C.inkFaint }}
        >
          {fmtAxisNumber(t.v)}
        </Text>
      ))}
      {/* x-axis labels */}
      {xLabels.map((x) => (
        <Text
          key={x.label}
          x={padX + x.i * step}
          y={height - 4}
          style={{ fontSize: 6, fontFamily: "Courier", color: C.inkFaint }}
        >
          {x.label}
        </Text>
      ))}
    </Svg>
  );
}

function BarsChart({
  positive,
  negative,
  labels,
  width,
  height,
}: {
  /** Series drawn above the baseline (e.g. income). */
  positive: number[];
  /** Series drawn below the baseline (e.g. expenses). Pass positive numbers; rendered as down-bars. */
  negative: number[];
  labels: string[];
  width: number;
  height: number;
}) {
  if (positive.length === 0) return null;
  const padX = 28;
  const padTop = 6;
  const padBot = 18;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBot;
  const max = Math.max(1, ...positive, ...negative);
  // Symmetric scale so income bars and expense bars share the visual
  // baseline at the centre.
  const half = innerH / 2;
  const baseline = padTop + half;
  const slot = innerW / Math.max(1, positive.length);
  const barW = Math.min(10, slot * 0.6);
  return (
    <Svg width={width} height={height}>
      {/* baseline */}
      <Line
        x1={padX}
        y1={baseline}
        x2={width - padX}
        y2={baseline}
        stroke={C.rule}
        strokeWidth={0.5}
      />
      {positive.map((v, i) => {
        const cx = padX + slot * (i + 0.5);
        const h = (v / max) * half;
        return (
          <Rect
            key={`p${i}`}
            x={cx - barW / 2}
            y={baseline - h}
            width={barW}
            height={h}
            fill={C.good}
          />
        );
      })}
      {negative.map((v, i) => {
        const cx = padX + slot * (i + 0.5);
        const h = (v / max) * half;
        return (
          <Rect
            key={`n${i}`}
            x={cx - barW / 2}
            y={baseline}
            width={barW}
            height={h}
            fill={C.bad}
          />
        );
      })}
      {/* x labels: first / mid / last */}
      {[0, Math.floor(labels.length / 2), labels.length - 1]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((i) => (
          <Text
            key={i}
            x={padX + slot * (i + 0.5) - 8}
            y={height - 4}
            style={{ fontSize: 6, fontFamily: "Courier", color: C.inkFaint }}
          >
            {labels[i]}
          </Text>
        ))}
    </Svg>
  );
}

function HorizontalBar({
  value,
  width,
  height = 5,
  color = C.primary,
  trackColor = C.panel,
}: {
  /** 0..1 progress. Capped at 1.05 (renders as full + tiny overshoot tick). */
  value: number;
  width: number;
  height?: number;
  color?: string;
  trackColor?: string;
}) {
  const pct = Math.max(0, Math.min(1.05, value));
  const fillW = Math.min(width, pct * width);
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} rx={1} fill={trackColor} />
      <Rect x={0} y={0} width={fillW} height={height} rx={1} fill={color} />
    </Svg>
  );
}

function fmtAxisNumber(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${Math.round(abs)}`;
}

// ─── Cover page ──────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: MonthlyStatement }) {
  const t = data.totals;
  const deltaColor =
    t.netWorthDelta > 0 ? C.good : t.netWorthDelta < 0 ? C.bad : C.inkSoft;
  const deltaPct =
    t.netWorthStart !== 0 ? t.netWorthDelta / Math.abs(t.netWorthStart) : null;
  const savingsRate = t.income > 0 ? t.net / t.income : null;
  const runwayLabel =
    t.runwayMonths == null
      ? "no recurring burn"
      : t.runwayMonths === Infinity
        ? "indefinite"
        : t.runwayMonths >= 24
          ? `${(t.runwayMonths / 12).toFixed(1)}y of burn`
          : `${t.runwayMonths.toFixed(1)} mo of burn`;
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

      {/* Hero net-worth block — biggest, most-readable thing on the page.
          Includes the period delta inline + a sparkline along the bottom
          edge so the reader sees the SHAPE of the trajectory before any
          tables. */}
      <View style={{ marginTop: 36 }}>
        <Text style={styles.kpiLabel}>Net worth · end of {data.range.toMonth}</Text>
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: 40,
            color: C.ink,
            marginTop: 4,
          }}
        >
          {fmtMoney(t.netWorth, data.baseCurrency)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 11, color: deltaColor, fontFamily: "Helvetica-Bold" }}>
            {fmtSignedMoney(t.netWorthDelta, data.baseCurrency)}
          </Text>
          {deltaPct != null ? (
            <Text style={{ fontSize: 9, color: deltaColor, fontFamily: "Courier" }}>
              {`${deltaPct >= 0 ? "+" : ""}${(deltaPct * 100).toFixed(1)}%`}
            </Text>
          ) : null}
          <Text style={{ fontSize: 9, color: C.inkFaint }}>
            since {data.range.fromMonth}
          </Text>
        </View>
        <View style={{ marginTop: 12 }}>
          <Sparkline
            values={data.months.map((m) => m.netWorth)}
            width={500}
            height={42}
            stroke={C.primary}
            fill={C.primaryFaint}
          />
        </View>
      </View>

      {/* KPI grid — 6 tiles, period rollup. Same look-and-feel as the
          dashboard so a printed copy reads like a snapshot of the live
          app, not a separate report shape. */}
      <View style={{ marginTop: 28 }}>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Income</Text>
            <Text style={{ ...styles.kpiValue, color: C.good }}>
              {fmtMoney(t.income, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>{data.months.length} mo total</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Expenses</Text>
            <Text style={{ ...styles.kpiValue, color: C.bad }}>
              {fmtMoney(t.expenses, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>
              avg {fmtMoney(t.expenses / Math.max(1, data.months.length), data.baseCurrency)}/mo
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Net saved</Text>
            <Text style={styles.kpiValue}>
              {fmtMoney(t.net, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>
              {savingsRate != null ? `${fmtPct(savingsRate)} savings rate` : "—"}
            </Text>
          </View>
        </View>

        <View style={[styles.kpiRow, { marginTop: 10 }]}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Runway</Text>
            <Text style={styles.kpiValue}>{runwayLabel}</Text>
            <Text style={styles.kpiSub}>
              burn {fmtMoney(t.monthlyBurn, data.baseCurrency)}/mo
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Best month</Text>
            <Text style={styles.kpiValue}>
              {fmtMoney(t.bestMonthNet, data.baseCurrency)}
            </Text>
            <Text style={styles.kpiSub}>{t.bestMonthLabel || "—"}</Text>
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
        {data.baseCurrency} · self-hosted · your data stays on your machine
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

// ─── Trends page — net worth, income vs expenses, savings rate ──────────────

function TrendsPage({ data }: { data: MonthlyStatement }) {
  const labels = data.months.map((m) => m.label);
  return (
    <PageChrome title="Trends" data={data}>
      <Text style={styles.sectionTitle}>Net worth</Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 4 }}>
        Closing balance per month, base {data.baseCurrency}.
      </Text>
      <LineChart
        values={data.months.map((m) => m.netWorth)}
        labels={labels}
        width={500}
        height={120}
      />

      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
        Income vs expenses
      </Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 4 }}>
        Bars above the baseline are income, below are expenses. Same scale
        on both sides so the ratio is visible at a glance.
      </Text>
      <BarsChart
        positive={data.months.map((m) => m.income)}
        negative={data.months.map((m) => m.expenses)}
        labels={labels}
        width={500}
        height={120}
      />

      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Savings rate</Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 4 }}>
        Net ÷ income, per month. Rate clamps at ±100%.
      </Text>
      <LineChart
        values={data.months.map((m) => (m.savingsRate ?? 0) * 100)}
        labels={labels}
        width={500}
        height={90}
        stroke={C.good}
        fill="#E6F2EA"
      />
    </PageChrome>
  );
}

// ─── Categories page — top spend categories with horizontal bars ────────────

function CategoriesPage({ data }: { data: MonthlyStatement }) {
  // Top 10 categories. Anything beyond gets a single "Other" bucket so
  // long-tail noise doesn't dominate the visual.
  const top = data.categories.slice(0, 10);
  const restTotal = data.categories
    .slice(10)
    .reduce((s, c) => s + c.totalBase, 0);
  const restShare = data.totals.expenses > 0 ? restTotal / data.totals.expenses : 0;
  const maxAmount = Math.max(0.01, ...top.map((c) => c.totalBase));
  return (
    <PageChrome title="Spending by category" data={data}>
      <Text style={styles.sectionTitle}>
        Where {fmtMoney(data.totals.expenses, data.baseCurrency)} went
      </Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 8 }}>
        Top {top.length} categories across {data.months.length} months. Bar
        length is amount; the share % is to the right.
      </Text>
      <View>
        {top.map((c) => (
          <CategoryRowView
            key={c.category}
            row={c}
            maxAmount={maxAmount}
            data={data}
          />
        ))}
        {restTotal > 0 ? (
          <View style={{ marginTop: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <Text style={{ fontSize: 8, color: C.inkSoft, fontStyle: "italic" }}>
                Other ({data.categories.length - 10} categories)
              </Text>
              <Text style={{ fontSize: 8, color: C.inkSoft, fontFamily: "Courier" }}>
                {fmtMoney(restTotal, data.baseCurrency)} ·{" "}
                {(restShare * 100).toFixed(0)}%
              </Text>
            </View>
            <HorizontalBar
              value={restTotal / maxAmount}
              width={500}
              height={4}
              color={C.inkFaint}
            />
          </View>
        ) : null}
      </View>
    </PageChrome>
  );
}

function CategoryRowView({
  row,
  maxAmount,
  data,
}: {
  row: CategoryRow;
  maxAmount: number;
  data: MonthlyStatement;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2,
        }}
      >
        <Text style={{ fontSize: 9, color: C.ink }}>{row.category}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
          <Text style={{ fontSize: 8, color: C.inkFaint }}>
            {row.txCount} tx
          </Text>
          <Text style={{ fontSize: 9, color: C.ink, fontFamily: "Courier" }}>
            {fmtMoney(row.totalBase, data.baseCurrency)}
          </Text>
          <Text style={{ fontSize: 8, color: C.inkSoft, fontFamily: "Courier" }}>
            {(row.share * 100).toFixed(0)}%
          </Text>
        </View>
      </View>
      <HorizontalBar value={row.totalBase / maxAmount} width={500} height={5} />
    </View>
  );
}

// ─── Goals page — progress bars + ETA per goal ──────────────────────────────

function GoalsPage({ data }: { data: MonthlyStatement }) {
  return (
    <PageChrome title="Goals" data={data}>
      <Text style={styles.sectionTitle}>Active savings goals</Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 8 }}>
        Progress against target where set; ETA is months at the current
        contribution rate.
      </Text>
      <View>
        {data.goals.map((g) => (
          <GoalRowView key={g.id} row={g} />
        ))}
      </View>
    </PageChrome>
  );
}

function GoalRowView({ row }: { row: GoalRow }) {
  const statusColor = row.done
    ? C.good
    : row.onPace == null
      ? C.inkFaint
      : row.onPace
        ? C.good
        : C.bad;
  const statusLabel = row.done
    ? "Done"
    : row.onPace == null
      ? "—"
      : row.onPace
        ? "On pace"
        : "Off pace";
  const etaLabel =
    row.etaMonths == null
      ? "—"
      : row.etaMonths >= 24
        ? `~${(row.etaMonths / 12).toFixed(1)}y to target`
        : `~${row.etaMonths} mo to target`;
  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontSize: 10, color: C.ink, fontFamily: "Helvetica-Bold" }}>
          {row.name}
        </Text>
        <Text
          style={{
            fontSize: 8,
            color: statusColor,
            fontFamily: "Courier",
          }}
        >
          {statusLabel}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontSize: 8, color: C.inkSoft, fontFamily: "Courier" }}>
          {fmtMoney(row.current, row.currency)}
          {row.target != null ? ` / ${fmtMoney(row.target, row.currency)}` : ""}
        </Text>
        <Text style={{ fontSize: 8, color: C.inkSoft, fontFamily: "Courier" }}>
          {fmtMoney(row.monthlyContribution, row.currency)}/mo · {etaLabel}
        </Text>
      </View>
      {row.progress != null ? (
        <HorizontalBar
          value={row.progress}
          width={500}
          height={5}
          color={row.done ? C.good : C.primary}
        />
      ) : null}
    </View>
  );
}

// ─── Budgets page — current-month status per budget ─────────────────────────

function BudgetsPage({ data }: { data: MonthlyStatement }) {
  return (
    <PageChrome title="Budgets" data={data}>
      <Text style={styles.sectionTitle}>
        Status this month — {data.range.toMonth}
      </Text>
      <Text style={{ fontSize: 8, color: C.inkSoft, marginBottom: 8 }}>
        Spend vs cap, in each budget&apos;s currency. Bars cap at 100%; over-
        budget is shown in red on the right with the percent overshoot.
      </Text>
      <View>
        {data.budgets.map((b) => (
          <BudgetRowView key={b.id} row={b} />
        ))}
      </View>
    </PageChrome>
  );
}

function BudgetRowView({ row }: { row: BudgetRow }) {
  const color =
    row.status === "over"
      ? C.bad
      : row.status === "warning"
        ? "#D97706"
        : C.good;
  const right =
    row.status === "over"
      ? `+${(row.percentUsed - 100).toFixed(0)}% over`
      : `${row.percentUsed.toFixed(0)}% used`;
  return (
    <View style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontSize: 10, color: C.ink }}>{row.category}</Text>
        <Text style={{ fontSize: 8, color, fontFamily: "Courier" }}>{right}</Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontSize: 8, color: C.inkSoft, fontFamily: "Courier" }}>
          {fmtMoney(row.spentThisMonth, row.currency)} / {fmtMoney(row.monthlyLimit, row.currency)}
        </Text>
      </View>
      <HorizontalBar
        value={row.percentUsed / 100}
        width={500}
        height={5}
        color={color}
      />
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

      {/*
        Pages, in narrative order:
        1. Cover                — net worth + delta + KPIs
        2. Trends               — net worth line, income/expense bars, savings
        3. Monthly performance  — the per-month table with sparklines
        4. Spending by category — top categories, share, per-tx counts
        5. Goals                — savings goals progress + ETA
        6. Budgets              — current-month status (only if any exist)
        7. Accounts             — closing balances at end of period
        8. Equity               — three scenarios (only if grants exist)
      */}
      <TrendsPage data={data} />

      <PageChrome title="Monthly performance" data={data}>
        <Text style={styles.sectionTitle}>Cashflow + balance sheet</Text>
        <MonthlyTable data={data} />
      </PageChrome>

      {data.categories.length > 0 ? <CategoriesPage data={data} /> : null}

      {data.goals.length > 0 ? <GoalsPage data={data} /> : null}

      {data.budgets.length > 0 ? <BudgetsPage data={data} /> : null}

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
