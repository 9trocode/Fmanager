"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import {
  getAccount,
  getDebtPlan,
  getDebtPlanByLoanAccount,
  getDebtPayment,
  getEffectiveBalance,
  listDebtPayments,
} from "@/lib/db/queries";
import { getOwner, ownedBy } from "@/lib/db/scope";
import { isValidYmdOnOrBefore, localToday } from "@/lib/dates";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { estimatedInterestForPayment } from "@/lib/debt-calculations";

function revalidateDebt(loanAccountId?: number) {
  revalidatePath("/debts");
  revalidatePath("/cash-flow");
  revalidatePath("/dashboard");
  revalidatePath("/net-worth");
  revalidatePath("/transactions");
  revalidatePath("/projections");
  revalidatePath("/", "layout");
  if (loanAccountId != null) revalidatePath(`/accounts/${loanAccountId}`);
}

function parsePositiveAmount(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
}

function parseOptionalAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a valid non-negative amount.");
  }
  return amount;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const amount = parseOptionalAmount(value);
  return amount == null ? null : Math.max(1, Math.round(amount));
}

function parseInterestRate(value: FormDataEntryValue | null): number | null {
  const rate = parseOptionalAmount(value);
  if (rate != null && rate > 100) {
    throw new Error("Interest rate must be between 0% and 100%.");
  }
  return rate;
}

function parseId(value: FormDataEntryValue | null, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid ${label}.`);
  return id;
}

function parseYmd(value: FormDataEntryValue | null, label: string): string {
  const date = String(value ?? "").trim();
  if (!isValidYmdOnOrBefore(date, "9999-12-31")) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nextMonthlyDate(paidAt: string, paymentDay: number | null): string {
  const [year, month, day] = paidAt.split("-").map(Number);
  const target = new Date(year, month - 1, 1);
  target.setMonth(target.getMonth() + 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(paymentDay ?? day, lastDay));
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
}

async function assertSourceAccount(sourceAccountId: number) {
  const source = await getAccount(sourceAccountId);
  if (!source || source.archived || source.type === "loan") {
    throw new Error("Choose an active non-loan account to fund repayments.");
  }
  return source;
}

export async function createDebtPlan(formData: FormData) {
  await assertAdmin();
  const owner = await getOwner();
  const sourceAccountId = parseId(
    formData.get("source_account_id"),
    "repayment account",
  );
  const source = await assertSourceAccount(sourceAccountId);
  const monthlyPayment = parsePositiveAmount(
    formData.get("monthly_payment"),
    "Monthly payment",
  );
  const nextPaymentDate = parseYmd(
    formData.get("next_payment_date"),
    "Next payment date",
  );
  const interestRatePct = parseInterestRate(formData.get("interest_rate_pct"));
  const originalPrincipal = parseOptionalAmount(
    formData.get("original_principal"),
  );
  const loanTermMonths = parseOptionalInt(formData.get("loan_term_months"));
  const paymentDayOfMonth = Number(nextPaymentDate.slice(-2));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const existingLoanIdRaw = String(
    formData.get("loan_account_id") ?? "",
  ).trim();

  if (existingLoanIdRaw) {
    const loanAccountId = parseId(existingLoanIdRaw, "loan account");
    if (loanAccountId === sourceAccountId) {
      throw new Error("The repayment account must be different from the debt.");
    }
    const loan = await getAccount(loanAccountId);
    if (!loan || loan.type !== "loan")
      throw new Error("Loan account not found.");
    if (await getDebtPlanByLoanAccount(loanAccountId)) {
      throw new Error("This debt already has a repayment plan.");
    }

    db.transaction((tx) => {
      tx.update(schema.accounts)
        .set({
          interestRatePct,
          originalPrincipal,
          loanTermMonths,
          paymentDayOfMonth,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.accounts.id, loanAccountId),
            ownedBy(schema.accounts.ownerUserId, owner),
          ),
        )
        .run();
      tx.insert(schema.debtPlans)
        .values({
          loanAccountId,
          sourceAccountId,
          monthlyPayment,
          currency: loan.currency,
          nextPaymentDate,
          notes,
          ownerUserId: owner,
        })
        .run();
    });
    revalidateDebt(loanAccountId);
    return;
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Debt name is required.");
  const currency = String(formData.get("currency") ?? source.currency)
    .trim()
    .toUpperCase();
  if (
    !SUPPORTED_CURRENCIES.includes(
      currency as (typeof SUPPORTED_CURRENCIES)[number],
    )
  ) {
    throw new Error("Choose a supported currency.");
  }
  const currentBalance = parsePositiveAmount(
    formData.get("current_balance"),
    "Current balance",
  );
  const institution = String(formData.get("institution") ?? "").trim() || null;

  let createdLoanId: number | null = null;
  db.transaction((tx) => {
    const loan = tx
      .insert(schema.accounts)
      .values({
        name,
        type: "loan",
        currency,
        institution,
        notes,
        interestRatePct,
        originalPrincipal: originalPrincipal ?? currentBalance,
        loanTermMonths,
        paymentDayOfMonth,
        ownerUserId: owner,
      })
      .returning()
      .get();
    if (!loan) throw new Error("Debt account creation failed.");
    createdLoanId = loan.id;
    tx.insert(schema.valueSnapshots)
      .values({
        accountId: loan.id,
        value: currentBalance,
        currency,
        asOf: localToday(),
        source: "manual",
        ownerUserId: owner,
      })
      .run();
    tx.insert(schema.debtPlans)
      .values({
        loanAccountId: loan.id,
        sourceAccountId,
        monthlyPayment,
        currency,
        nextPaymentDate,
        notes,
        ownerUserId: owner,
      })
      .run();
  });
  revalidateDebt(createdLoanId ?? undefined);
}

export async function updateDebtPlan(formData: FormData) {
  await assertAdmin();
  const id = parseId(formData.get("id"), "plan");
  const plan = await getDebtPlan(id);
  if (!plan) throw new Error("Debt plan not found.");
  const loan = await getAccount(plan.loanAccountId);
  if (!loan || loan.type !== "loan") throw new Error("Loan account not found.");
  const sourceAccountId = parseId(
    formData.get("source_account_id"),
    "repayment account",
  );
  if (sourceAccountId === loan.id) {
    throw new Error("The repayment account must be different from the debt.");
  }
  await assertSourceAccount(sourceAccountId);
  const monthlyPayment = parsePositiveAmount(
    formData.get("monthly_payment"),
    "Monthly payment",
  );
  const nextPaymentDate = parseYmd(
    formData.get("next_payment_date"),
    "Next payment date",
  );
  const interestRatePct = parseInterestRate(formData.get("interest_rate_pct"));
  const originalPrincipal = parseOptionalAmount(
    formData.get("original_principal"),
  );
  const loanTermMonths = parseOptionalInt(formData.get("loan_term_months"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const owner = await getOwner();

  db.transaction((tx) => {
    tx.update(schema.accounts)
      .set({
        interestRatePct,
        originalPrincipal,
        loanTermMonths,
        paymentDayOfMonth: Number(nextPaymentDate.slice(-2)),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.accounts.id, loan.id),
          ownedBy(schema.accounts.ownerUserId, owner),
        ),
      )
      .run();
    tx.update(schema.debtPlans)
      .set({
        sourceAccountId,
        monthlyPayment,
        currency: loan.currency,
        nextPaymentDate,
        notes,
        active: formData.get("active") !== "false",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.debtPlans.id, id),
          ownedBy(schema.debtPlans.ownerUserId, owner),
        ),
      )
      .run();
  });
  revalidateDebt(loan.id);
}

export interface RecordedDebtPayment {
  total: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

export async function recordDebtPayment(
  formData: FormData,
): Promise<RecordedDebtPayment> {
  await assertAdmin();
  const planId = parseId(formData.get("plan_id"), "plan");
  const plan = await getDebtPlan(planId);
  if (!plan) throw new Error("Debt plan not found.");
  if (!plan.active) throw new Error("Resume this repayment plan first.");
  const [loan, source, latestPayment] = await Promise.all([
    getAccount(plan.loanAccountId),
    getAccount(plan.sourceAccountId),
    listDebtPayments(plan.id, 1).then((payments) => payments[0] ?? null),
  ]);
  if (!loan || loan.type !== "loan") throw new Error("Loan account not found.");
  if (!source || source.archived || source.type === "loan") {
    throw new Error("Repayment account not found.");
  }
  const requestedTotal = parsePositiveAmount(formData.get("amount"), "Payment");
  const paidAt = parseYmd(formData.get("paid_at"), "Payment date");
  if (paidAt > localToday()) {
    throw new Error("Payment date cannot be in the future.");
  }
  if (latestPayment && paidAt < latestPayment.paidAt) {
    throw new Error(
      `Payment date cannot be before the latest recorded payment (${latestPayment.paidAt}).`,
    );
  }
  const balanceState = await getEffectiveBalance(plan.loanAccountId, paidAt);
  const balance = Math.max(0, balanceState.effectiveValue ?? 0);
  if (balance <= 0.005) throw new Error("This debt is already paid off.");
  if (balanceState.latestAsOf && paidAt <= balanceState.latestAsOf) {
    throw new Error(
      `Payment date must be after the latest balance date (${balanceState.latestAsOf}).`,
    );
  }
  const interest = roundMoney(
    estimatedInterestForPayment({
      balance,
      annualRatePct: loan.interestRatePct ?? 0,
      paidAt,
      previousPaymentDate: latestPayment?.paidAt,
    }),
  );
  const total = roundMoney(Math.min(requestedTotal, balance + interest));
  const principal = roundMoney(Math.min(balance, total - interest));
  if (principal < 0) {
    throw new Error(
      `Payment must cover the estimated monthly interest (${interest.toFixed(2)} ${loan.currency}).`,
    );
  }
  const remainingBalance = roundMoney(Math.max(0, balance - principal));
  const owner = await getOwner();
  const notes = `Debt payment · ${loan.name}`;
  const nextPaymentDate = nextMonthlyDate(paidAt, loan.paymentDayOfMonth);

  db.transaction((tx) => {
    const payment = tx
      .insert(schema.debtPayments)
      .values({
        planId,
        paidAt,
        totalAmount: total,
        principalAmount: principal,
        interestAmount: interest,
        remainingBalance,
        currency: loan.currency,
        previousNextPaymentDate: plan.nextPaymentDate,
        ownerUserId: owner,
      })
      .returning({ id: schema.debtPayments.id })
      .get();
    if (!payment) throw new Error("Debt payment creation failed.");
    if (principal > 0) {
      tx.insert(schema.transactions)
        .values({
          accountId: source.id,
          destAccountId: loan.id,
          kind: "transfer",
          amount: principal,
          currency: loan.currency,
          category: "Debt repayment",
          occurredAt: paidAt,
          notes: `${notes} · principal`,
          debtPaymentId: payment.id,
          ownerUserId: owner,
        })
        .run();
    }
    if (interest > 0) {
      tx.insert(schema.transactions)
        .values({
          accountId: source.id,
          kind: "expense",
          amount: interest,
          currency: loan.currency,
          category: "Debt interest",
          occurredAt: paidAt,
          notes: `${notes} · interest`,
          debtPaymentId: payment.id,
          ownerUserId: owner,
        })
        .run();
    }
    tx.update(schema.debtPlans)
      .set({
        nextPaymentDate,
        active: remainingBalance > 0.005,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.debtPlans.id, planId),
          ownedBy(schema.debtPlans.ownerUserId, owner),
        ),
      )
      .run();
  });

  revalidateDebt(loan.id);
  return { total, principal, interest, remainingBalance };
}

export async function deleteDebtPayment(formData: FormData) {
  await assertAdmin();
  const id = parseId(formData.get("id"), "payment");
  const payment = await getDebtPayment(id);
  if (!payment) throw new Error("Debt payment not found.");
  const plan = await getDebtPlan(payment.planId);
  if (!plan) throw new Error("Debt plan not found.");
  const latest = (await listDebtPayments(plan.id, 1))[0];
  if (!latest || latest.id !== payment.id) {
    throw new Error("Only the latest debt payment can be corrected.");
  }
  const owner = await getOwner();

  db.transaction((tx) => {
    tx.delete(schema.transactions)
      .where(
        and(
          eq(schema.transactions.debtPaymentId, payment.id),
          ownedBy(schema.transactions.ownerUserId, owner),
        ),
      )
      .run();
    tx.delete(schema.debtPayments)
      .where(
        and(
          eq(schema.debtPayments.id, payment.id),
          ownedBy(schema.debtPayments.ownerUserId, owner),
        ),
      )
      .run();
    tx.update(schema.debtPlans)
      .set({
        nextPaymentDate: payment.previousNextPaymentDate,
        active: true,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.debtPlans.id, plan.id),
          ownedBy(schema.debtPlans.ownerUserId, owner),
        ),
      )
      .run();
  });
  revalidateDebt(plan.loanAccountId);
}

export async function deleteDebtPlan(formData: FormData) {
  await assertAdmin();
  const id = parseId(formData.get("id"), "plan");
  const plan = await getDebtPlan(id);
  if (!plan) throw new Error("Debt plan not found.");
  const payments = await listDebtPayments(plan.id, 10_000);
  const owner = await getOwner();

  db.transaction((tx) => {
    const paymentIds = payments.map((payment) => payment.id);
    if (paymentIds.length > 0) {
      tx.update(schema.transactions)
        .set({ debtPaymentId: null })
        .where(
          and(
            inArray(schema.transactions.debtPaymentId, paymentIds),
            ownedBy(schema.transactions.ownerUserId, owner),
          ),
        )
        .run();
    }
    tx.delete(schema.debtPlans)
      .where(
        and(
          eq(schema.debtPlans.id, plan.id),
          ownedBy(schema.debtPlans.ownerUserId, owner),
        ),
      )
      .run();
  });
  revalidateDebt(plan.loanAccountId);
}
