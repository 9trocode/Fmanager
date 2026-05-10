import "server-only";
import ExcelJS from "exceljs";
import { ACCOUNT_TYPE_LABEL } from "@/lib/account-types";
import { SCENARIO_LABEL } from "@/lib/scenarios";
import type { MonthlyStatement } from "./statement-data";

/**
 * Cairn brand palette, hand-picked to read on white. ARGB hex (no `#`).
 */
const PALETTE = {
  ink: "FF1A1A1A",
  inkSoft: "FF6B6B6B",
  inkFaint: "FFA1A1A1",
  rule: "FFE5E5E5",
  zebra: "FFFAFAF9",
  primary: "FF0F766E", // teal-700
  primaryFaint: "FFE6F4F2",
  warn: "FFB45309", // amber-700
  bad: "FFB91C1C", // red-700
  good: "FF15803D", // green-700
  panel: "FFF5F5F4", // stone-100
} as const;

const FONT_BODY = "Inter";
const FONT_MONO = "JetBrains Mono";

function moneyFormat(currency: string): string {
  // Excel quotes the currency symbol literal so it doesn't try to localize.
  return `_-"${currency} "* #,##0.00_-;[Red]-"${currency} "* #,##0.00_-;_-"${currency} "* "—"_-`;
}

function pctFormat(): string {
  return "0.0%";
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = {
      name: FONT_BODY,
      size: 10,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.primary },
    };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = {
      bottom: { style: "thin", color: { argb: PALETTE.primary } },
    };
  });
}

function applyZebra(ws: ExcelJS.Worksheet, fromRow: number, toRow: number) {
  for (let r = fromRow; r <= toRow; r++) {
    if ((r - fromRow) % 2 === 1) {
      const row = ws.getRow(r);
      row.eachCell((cell) => {
        if (!cell.fill || cell.fill.type !== "pattern") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: PALETTE.zebra },
          };
        }
      });
    }
  }
}

/**
 * Cover header: title block in the first 4 rows of any sheet.
 * Mirrors the PDF cover so the workbook feels of a piece.
 */
function addSheetTitle(
  ws: ExcelJS.Worksheet,
  data: MonthlyStatement,
  subtitle: string,
) {
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "CAIRN — Financial Statement";
  titleCell.font = {
    name: FONT_BODY,
    size: 16,
    bold: true,
    color: { argb: PALETTE.ink },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:H2");
  const sub = ws.getCell("A2");
  sub.value = subtitle;
  sub.font = {
    name: FONT_BODY,
    size: 10,
    color: { argb: PALETTE.inkSoft },
  };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.mergeCells("A3:H3");
  const meta = ws.getCell("A3");
  meta.value = `${data.range.fromMonth} — ${data.range.toMonth}  ·  base ${data.baseCurrency}  ·  generated ${new Date(data.generatedAt).toLocaleString()}`;
  meta.font = {
    name: FONT_MONO,
    size: 9,
    color: { argb: PALETTE.inkFaint },
  };
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(4).height = 8; // breathing room before the table
}

// ─── Sheet 1: Summary ────────────────────────────────────────────────────────

function buildSummary(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  const ws = wb.addWorksheet("Summary", {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", ySplit: 6 }],
  });
  addSheetTitle(ws, data, "Month-on-month performance");

  const HEADERS = [
    "Month",
    "Income",
    "Expenses",
    "Net",
    "Savings rate",
    "Net worth",
    "Cash",
    "Investments",
    "Equity (liquid)",
    "Tx count",
  ];
  setColumnWidths(ws, [14, 14, 14, 14, 13, 16, 14, 14, 16, 10]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const fmt = moneyFormat(data.baseCurrency);
  const startRow = 6;
  data.months.forEach((m, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    row.values = [
      m.label,
      m.income,
      -m.expenses, // negative = outflow, conditional formats it red
      m.net,
      m.savingsRate ?? "",
      m.netWorth,
      m.cash,
      m.investments,
      m.equityLiquid,
      m.txCount,
    ];
    row.font = { name: FONT_MONO, size: 10, color: { argb: PALETTE.ink } };
    row.alignment = { vertical: "middle" };
    row.getCell(1).font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };

    [2, 3, 4, 6, 7, 8, 9].forEach((c) => (row.getCell(c).numFmt = fmt));
    row.getCell(5).numFmt = pctFormat();
    row.getCell(10).numFmt = "0";

    // Highlight negative net in red.
    if (m.net < 0) {
      row.getCell(4).font = {
        ...row.getCell(4).font,
        color: { argb: PALETTE.bad },
      };
    } else if (m.net > 0) {
      row.getCell(4).font = {
        ...row.getCell(4).font,
        color: { argb: PALETTE.good },
      };
    }
  });

  applyZebra(ws, startRow, startRow + data.months.length - 1);

  // Totals row.
  const totalRow = startRow + data.months.length + 1;
  const t = ws.getRow(totalRow);
  t.values = [
    "Total / latest",
    data.totals.income,
    -data.totals.expenses,
    data.totals.net,
    data.totals.income > 0 ? data.totals.net / data.totals.income : "",
    data.totals.netWorth,
    data.months[data.months.length - 1]?.cash ?? 0,
    data.months[data.months.length - 1]?.investments ?? 0,
    data.months[data.months.length - 1]?.equityLiquid ?? 0,
    data.transactions.length,
  ];
  t.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.ink } };
  t.eachCell((cell) => {
    cell.border = { top: { style: "medium", color: { argb: PALETTE.primary } } };
  });
  [2, 3, 4, 6, 7, 8, 9].forEach((c) => (t.getCell(c).numFmt = fmt));
  t.getCell(5).numFmt = pctFormat();
  t.getCell(10).numFmt = "0";

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5 + data.months.length, column: HEADERS.length },
  };
}

// ─── Sheet 2: Accounts ───────────────────────────────────────────────────────

function buildAccounts(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  const ws = wb.addWorksheet("Accounts", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 6 }],
  });
  addSheetTitle(ws, data, "Closing balance per account, month-end");

  const monthKeys = data.months.map((m) => m.key);
  const monthLabels = data.months.map((m) => m.label);

  const HEADERS = [
    "Account",
    "Type",
    "Currency",
    "Institution",
    ...monthLabels,
    `Latest (${data.baseCurrency})`,
  ];
  setColumnWidths(ws, [
    24,
    14,
    10,
    18,
    ...monthKeys.map(() => 14),
    16,
  ]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  // Index closing balances per (acct, month).
  const closingByKey = new Map<string, number>();
  for (const m of data.accountMonthly) {
    closingByKey.set(`${m.accountId}|${m.monthKey}`, m.closingNative);
  }

  const startRow = 6;
  data.accounts.forEach((a, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    const fmt = moneyFormat(a.currency);
    row.values = [
      a.name,
      ACCOUNT_TYPE_LABEL[a.type] ?? a.type,
      a.currency,
      a.institution ?? "",
      ...monthKeys.map((k) => closingByKey.get(`${a.id}|${k}`) ?? 0),
      a.closingBase,
    ];
    row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
    // Money columns mono.
    for (let c = 5; c < 5 + monthKeys.length; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT_MONO, size: 10, color: { argb: PALETTE.ink } };
      cell.numFmt = fmt;
    }
    const lastCell = row.getCell(5 + monthKeys.length);
    lastCell.font = {
      name: FONT_MONO,
      size: 10,
      bold: true,
      color: { argb: PALETTE.ink },
    };
    lastCell.numFmt = moneyFormat(data.baseCurrency);
  });

  applyZebra(ws, startRow, startRow + data.accounts.length - 1);

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Sheet 3: Transactions ───────────────────────────────────────────────────

function buildTransactions(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  const ws = wb.addWorksheet("Transactions", {
    views: [{ state: "frozen", ySplit: 6 }],
  });
  addSheetTitle(ws, data, "Every transaction in the range");

  const HEADERS = [
    "Date",
    "Month",
    "Account",
    "Destination",
    "Kind",
    "Category",
    "Amount",
    "Currency",
    `Amount (${data.baseCurrency})`,
    "Notes",
  ];
  setColumnWidths(ws, [12, 10, 22, 20, 11, 18, 14, 10, 16, 40]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const baseFmt = moneyFormat(data.baseCurrency);
  const startRow = 6;
  data.transactions
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .forEach((t, idx) => {
      const r = startRow + idx;
      const row = ws.getRow(r);
      const sign = t.kind === "expense" ? -1 : 1;
      row.values = [
        t.date,
        t.monthKey,
        t.account,
        t.destAccount ?? "",
        t.kind,
        t.category ?? "",
        sign * t.amount,
        t.currency,
        sign * t.amountBase,
        t.notes ?? "",
      ];
      row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
      row.getCell(7).numFmt = moneyFormat(t.currency);
      row.getCell(7).font = {
        name: FONT_MONO,
        size: 10,
        color: { argb: PALETTE.ink },
      };
      row.getCell(9).numFmt = baseFmt;
      row.getCell(9).font = {
        name: FONT_MONO,
        size: 10,
        color: { argb: PALETTE.ink },
      };
      // Subtle kind colouring.
      const kindCell = row.getCell(5);
      if (t.kind === "income") {
        kindCell.font = {
          name: FONT_BODY,
          size: 10,
          bold: true,
          color: { argb: PALETTE.good },
        };
      } else if (t.kind === "expense") {
        kindCell.font = {
          name: FONT_BODY,
          size: 10,
          bold: true,
          color: { argb: PALETTE.bad },
        };
      } else {
        kindCell.font = {
          name: FONT_BODY,
          size: 10,
          color: { argb: PALETTE.inkSoft },
        };
      }
    });

  if (data.transactions.length > 0) {
    applyZebra(ws, startRow, startRow + data.transactions.length - 1);
  }

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Sheet 4: Equity ─────────────────────────────────────────────────────────

function buildEquity(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  if (data.equity.length === 0) return;
  const ws = wb.addWorksheet("Equity", {
    views: [{ state: "frozen", ySplit: 6 }],
  });
  addSheetTitle(ws, data, "Grant snapshot — three scenarios");

  const HEADERS = [
    "Company",
    "Account",
    "Type",
    "Total shares",
    "Vested shares",
    "Strike",
    "FMV / share",
    "Currency",
    `${SCENARIO_LABEL.floor} (${data.baseCurrency})`,
    `${SCENARIO_LABEL.liquid} (${data.baseCurrency})`,
    `${SCENARIO_LABEL.expected} (${data.baseCurrency})`,
  ];
  setColumnWidths(ws, [22, 22, 14, 14, 14, 12, 14, 10, 16, 16, 16]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const baseFmt = moneyFormat(data.baseCurrency);
  const startRow = 6;
  data.equity.forEach((g, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    const ccyFmt = moneyFormat(g.currency);
    row.values = [
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
    ];
    row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
    row.getCell(4).numFmt = "#,##0";
    row.getCell(5).numFmt = "#,##0";
    row.getCell(6).numFmt = ccyFmt;
    row.getCell(7).numFmt = ccyFmt;
    [9, 10, 11].forEach((c) => {
      const cell = row.getCell(c);
      cell.numFmt = baseFmt;
      cell.font = {
        name: FONT_MONO,
        size: 10,
        color: { argb: PALETTE.ink },
      };
    });
  });

  applyZebra(ws, startRow, startRow + data.equity.length - 1);

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Sheet 5: Categories — spend per category × per month ───────────────────

function buildCategories(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  if (data.categories.length === 0) return;
  const ws = wb.addWorksheet("Categories", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 6 }],
  });
  addSheetTitle(
    ws,
    data,
    "Spend by category, per month — pivot-ready cross-tab",
  );

  const monthLabels = data.months.map((m) => m.label);
  const HEADERS = [
    "Category",
    ...monthLabels,
    `Total (${data.baseCurrency})`,
    "Share",
    "Tx count",
  ];
  setColumnWidths(ws, [
    24,
    ...monthLabels.map(() => 12),
    16,
    8,
    9,
  ]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const baseFmt = moneyFormat(data.baseCurrency);
  const startRow = 6;
  data.categories.forEach((c, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    row.values = [
      c.category,
      ...c.perMonth,
      c.totalBase,
      c.share,
      c.txCount,
    ];
    row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
    for (let col = 2; col < 2 + monthLabels.length; col++) {
      const cell = row.getCell(col);
      cell.font = { name: FONT_MONO, size: 10, color: { argb: PALETTE.ink } };
      cell.numFmt = baseFmt;
    }
    const totalCell = row.getCell(2 + monthLabels.length);
    totalCell.font = {
      name: FONT_MONO,
      size: 10,
      bold: true,
      color: { argb: PALETTE.ink },
    };
    totalCell.numFmt = baseFmt;
    row.getCell(3 + monthLabels.length).numFmt = "0%";
    row.getCell(4 + monthLabels.length).numFmt = "0";
  });

  applyZebra(ws, startRow, startRow + data.categories.length - 1);

  // Totals row at the bottom — column-sums for the per-month cells +
  // grand total.
  const totalRow = startRow + data.categories.length + 1;
  const t = ws.getRow(totalRow);
  const colSums = monthLabels.map((_, mi) =>
    data.categories.reduce((s, c) => s + (c.perMonth[mi] ?? 0), 0),
  );
  t.values = [
    "Total",
    ...colSums,
    data.totals.expenses,
    1,
    data.transactions.filter((tx) => tx.kind === "expense").length,
  ];
  t.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.ink } };
  t.eachCell((cell) => {
    cell.border = { top: { style: "medium", color: { argb: PALETTE.primary } } };
  });
  for (let col = 2; col < 2 + monthLabels.length; col++) {
    t.getCell(col).numFmt = baseFmt;
  }
  t.getCell(2 + monthLabels.length).numFmt = baseFmt;
  t.getCell(3 + monthLabels.length).numFmt = "0%";
  t.getCell(4 + monthLabels.length).numFmt = "0";

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Sheet 6: Goals — savings goals + computed progress ─────────────────────

function buildGoals(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  if (data.goals.length === 0) return;
  const ws = wb.addWorksheet("Goals", {
    views: [{ state: "frozen", ySplit: 6 }],
  });
  addSheetTitle(ws, data, "Active savings goals — progress + ETA");

  const HEADERS = [
    "Goal",
    "Kind",
    "Currency",
    "Target",
    "Current",
    "Progress",
    "Monthly contribution",
    "ETA (months)",
    "Status",
  ];
  setColumnWidths(ws, [24, 12, 9, 14, 14, 10, 18, 12, 12]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const startRow = 6;
  data.goals.forEach((g, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    const ccyFmt = moneyFormat(g.currency);
    const status = g.done
      ? "Done"
      : g.onPace == null
        ? "—"
        : g.onPace
          ? "On pace"
          : "Off pace";
    row.values = [
      g.name,
      g.kind,
      g.currency,
      g.target ?? "",
      g.current,
      g.progress ?? "",
      g.monthlyContribution,
      g.etaMonths ?? "",
      status,
    ];
    row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
    [4, 5, 7].forEach((c) => {
      const cell = row.getCell(c);
      cell.numFmt = ccyFmt;
      cell.font = { name: FONT_MONO, size: 10, color: { argb: PALETTE.ink } };
    });
    row.getCell(6).numFmt = "0%";
    row.getCell(8).numFmt = "0";
    // Status colouring.
    const statusCell = row.getCell(9);
    if (g.done) {
      statusCell.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.good } };
    } else if (g.onPace === false) {
      statusCell.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.bad } };
    } else if (g.onPace === true) {
      statusCell.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.good } };
    }
  });

  applyZebra(ws, startRow, startRow + data.goals.length - 1);

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Sheet 7: Budgets — current-month status ────────────────────────────────

function buildBudgets(wb: ExcelJS.Workbook, data: MonthlyStatement) {
  if (data.budgets.length === 0) return;
  const ws = wb.addWorksheet("Budgets", {
    views: [{ state: "frozen", ySplit: 6 }],
  });
  addSheetTitle(
    ws,
    data,
    `Budget status this month — ${data.range.toMonth}`,
  );

  const HEADERS = [
    "Category",
    "Currency",
    "Monthly limit",
    "Spent this month",
    "% used",
    "Status",
  ];
  setColumnWidths(ws, [22, 9, 16, 18, 10, 12]);

  const headerRow = ws.getRow(5);
  HEADERS.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
  styleHeaderRow(headerRow);

  const startRow = 6;
  data.budgets.forEach((b, idx) => {
    const r = startRow + idx;
    const row = ws.getRow(r);
    const ccyFmt = moneyFormat(b.currency);
    row.values = [
      b.category,
      b.currency,
      b.monthlyLimit,
      b.spentThisMonth,
      b.percentUsed / 100,
      b.status === "over" ? "Over" : b.status === "warning" ? "Watch" : "Healthy",
    ];
    row.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.ink } };
    [3, 4].forEach((c) => {
      const cell = row.getCell(c);
      cell.numFmt = ccyFmt;
      cell.font = { name: FONT_MONO, size: 10, color: { argb: PALETTE.ink } };
    });
    row.getCell(5).numFmt = "0%";
    const statusCell = row.getCell(6);
    if (b.status === "over") {
      statusCell.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.bad } };
    } else if (b.status === "warning") {
      statusCell.font = { name: FONT_BODY, size: 10, bold: true, color: { argb: PALETTE.warn } };
    } else {
      statusCell.font = { name: FONT_BODY, size: 10, color: { argb: PALETTE.good } };
    }
  });

  applyZebra(ws, startRow, startRow + data.budgets.length - 1);

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: HEADERS.length },
  };
}

// ─── Public ──────────────────────────────────────────────────────────────────

export async function buildStatementWorkbook(
  data: MonthlyStatement,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cairn";
  wb.title = `Cairn statement — ${data.range.fromMonth} to ${data.range.toMonth}`;
  wb.created = new Date(data.generatedAt);
  wb.modified = new Date(data.generatedAt);

  // Sheet order tells the story: rollups first, then the analytical
  // cross-tabs the user will pivot on, then drill-downs.
  buildSummary(wb, data);
  buildCategories(wb, data);
  buildGoals(wb, data);
  buildBudgets(wb, data);
  buildAccounts(wb, data);
  buildTransactions(wb, data);
  buildEquity(wb, data);

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}
