"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { parseCsv } from "@/lib/csv";

const EXPORT_VERSION = "0.1";

type ExportShape = {
  version: string;
  exportedAt: string;
  accounts: unknown[];
  snapshots: unknown[];
  transactions: unknown[];
  grants: unknown[];
  decisions: unknown[];
  flows: unknown[];
  budgets: unknown[];
  savings: unknown[];
  settings: unknown[];
  fxRates: unknown[];
};

/** Returns the entire database as a JSON string. */
export async function exportAllData(): Promise<string> {
  await assertAdmin();
  const [
    accounts,
    snapshots,
    transactions,
    grants,
    decisions,
    flows,
    budgets,
    savings,
    settings,
    fxRates,
  ] = await Promise.all([
    db.select().from(schema.accounts),
    db.select().from(schema.valueSnapshots),
    db.select().from(schema.transactions),
    db.select().from(schema.equityGrants),
    db.select().from(schema.decisions),
    db.select().from(schema.recurringFlows),
    db.select().from(schema.budgets),
    db.select().from(schema.savingsGoals),
    db.select().from(schema.settings),
    db.select().from(schema.fxRates),
  ]);

  const dump: ExportShape = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    accounts,
    snapshots,
    transactions,
    grants,
    decisions,
    flows,
    budgets,
    savings,
    settings,
    fxRates,
  };
  return JSON.stringify(dump, null, 2);
}

/**
 * Replaces all data with the contents of an exported JSON dump.
 * Destructive — wipes existing rows in every table first.
 */
export async function importAllData(formData: FormData) {
  await assertAdmin();
  const text = String(formData.get("json") ?? "").trim();
  if (!text) throw new Error("No JSON provided.");

  let parsed: Partial<ExportShape>;
  try {
    parsed = JSON.parse(text) as Partial<ExportShape>;
  } catch {
    throw new Error("Invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON must be an object.");
  }

  // Wipe in dependency order (children before parents).
  await db.delete(schema.transactions);
  await db.delete(schema.valueSnapshots);
  await db.delete(schema.equityGrants);
  await db.delete(schema.accounts);
  await db.delete(schema.decisions);
  await db.delete(schema.recurringFlows);
  await db.delete(schema.budgets);
  await db.delete(schema.savingsGoals);
  await db.delete(schema.fxRates);
  await db.delete(schema.settings);

  // Insert in dependency order (parents before children).
  const counts = {
    accounts: 0,
    snapshots: 0,
    transactions: 0,
    grants: 0,
    decisions: 0,
    flows: 0,
    budgets: 0,
    savings: 0,
    settings: 0,
    fxRates: 0,
  };

  if (Array.isArray(parsed.accounts) && parsed.accounts.length) {
    await db
      .insert(schema.accounts)
      .values(parsed.accounts as (typeof schema.accounts.$inferInsert)[]);
    counts.accounts = parsed.accounts.length;
  }
  if (Array.isArray(parsed.snapshots) && parsed.snapshots.length) {
    await db
      .insert(schema.valueSnapshots)
      .values(parsed.snapshots as (typeof schema.valueSnapshots.$inferInsert)[]);
    counts.snapshots = parsed.snapshots.length;
  }
  if (Array.isArray(parsed.grants) && parsed.grants.length) {
    await db
      .insert(schema.equityGrants)
      .values(parsed.grants as (typeof schema.equityGrants.$inferInsert)[]);
    counts.grants = parsed.grants.length;
  }
  if (Array.isArray(parsed.transactions) && parsed.transactions.length) {
    await db
      .insert(schema.transactions)
      .values(parsed.transactions as (typeof schema.transactions.$inferInsert)[]);
    counts.transactions = parsed.transactions.length;
  }
  if (Array.isArray(parsed.flows) && parsed.flows.length) {
    await db
      .insert(schema.recurringFlows)
      .values(parsed.flows as (typeof schema.recurringFlows.$inferInsert)[]);
    counts.flows = parsed.flows.length;
  }
  if (Array.isArray(parsed.budgets) && parsed.budgets.length) {
    await db
      .insert(schema.budgets)
      .values(parsed.budgets as (typeof schema.budgets.$inferInsert)[]);
    counts.budgets = parsed.budgets.length;
  }
  if (Array.isArray(parsed.savings) && parsed.savings.length) {
    await db
      .insert(schema.savingsGoals)
      .values(parsed.savings as (typeof schema.savingsGoals.$inferInsert)[]);
    counts.savings = parsed.savings.length;
  }
  if (Array.isArray(parsed.decisions) && parsed.decisions.length) {
    await db
      .insert(schema.decisions)
      .values(parsed.decisions as (typeof schema.decisions.$inferInsert)[]);
    counts.decisions = parsed.decisions.length;
  }
  if (Array.isArray(parsed.fxRates) && parsed.fxRates.length) {
    await db
      .insert(schema.fxRates)
      .values(parsed.fxRates as (typeof schema.fxRates.$inferInsert)[]);
    counts.fxRates = parsed.fxRates.length;
  }
  if (Array.isArray(parsed.settings) && parsed.settings.length) {
    await db
      .insert(schema.settings)
      .values(parsed.settings as (typeof schema.settings.$inferInsert)[]);
    counts.settings = parsed.settings.length;
  }

  revalidatePath("/", "layout");
  return counts;
}

const VALID_KINDS = new Set(["expense", "income", "transfer"]);

/**
 * Append-only CSV import for transactions.
 * Headers: date,account,amount,currency,category,kind,notes
 * Account is matched by name (case-insensitive).
 */
export async function importTransactionsCsv(formData: FormData) {
  await assertAdmin();
  const text = String(formData.get("csv") ?? "").trim();
  if (!text) throw new Error("No CSV provided.");

  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSV is empty.");

  const headerRow = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headerRow.indexOf(name);
  const dateI = idx("date");
  const accountI = idx("account");
  const amountI = idx("amount");
  const currencyI = idx("currency");
  const categoryI = idx("category");
  const kindI = idx("kind");
  const notesI = idx("notes");
  const destAccountI = idx("dest_account");

  if (dateI < 0 || accountI < 0 || amountI < 0) {
    throw new Error(
      'CSV must have at least these headers: "date", "account", "amount". Optional: currency, category, kind, notes, dest_account.',
    );
  }

  const accounts = await db.select().from(schema.accounts);
  const accountByName = new Map<string, (typeof accounts)[number]>(
    accounts.map((a) => [a.name.toLowerCase(), a]),
  );

  type InsertRow = typeof schema.transactions.$inferInsert;
  const inserts: InsertRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (i: number) => (i >= 0 ? row[i]?.trim() ?? "" : "");
    const accountName = get(accountI);
    if (!accountName) {
      errors.push(`Row ${i + 1}: missing account.`);
      continue;
    }
    const account = accountByName.get(accountName.toLowerCase());
    if (!account) {
      errors.push(`Row ${i + 1}: account "${accountName}" not found.`);
      continue;
    }

    const kindRaw = (get(kindI) || "expense").toLowerCase();
    if (!VALID_KINDS.has(kindRaw)) {
      errors.push(`Row ${i + 1}: invalid kind "${kindRaw}".`);
      continue;
    }
    const kind = kindRaw as "expense" | "income" | "transfer";

    const amountRaw = get(amountI).replace(/[, ]/g, "");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push(`Row ${i + 1}: invalid amount "${get(amountI)}".`);
      continue;
    }

    const occurredAt = get(dateI);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) {
      errors.push(`Row ${i + 1}: date must be YYYY-MM-DD (got "${occurredAt}").`);
      continue;
    }

    const currency = (get(currencyI) || account.currency).toUpperCase();
    const category = get(categoryI) || null;
    const notes = get(notesI) || null;

    let destAccountId: number | null = null;
    if (kind === "transfer") {
      const destName = get(destAccountI);
      if (destName) {
        const dest = accountByName.get(destName.toLowerCase());
        if (!dest) {
          errors.push(
            `Row ${i + 1}: dest_account "${destName}" not found.`,
          );
          continue;
        }
        destAccountId = dest.id;
      }
    }

    inserts.push({
      accountId: account.id,
      destAccountId,
      kind,
      amount,
      currency,
      category,
      occurredAt,
      notes,
    });
  }

  if (inserts.length > 0) {
    await db.insert(schema.transactions).values(inserts);
  }

  revalidatePath("/", "layout");
  return { imported: inserts.length, errorCount: errors.length, errors: errors.slice(0, 25) };
}
