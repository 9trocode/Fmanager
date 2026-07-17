import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDebtProjection,
  debtPaymentForMonth,
  estimatedInterestForPayment,
  requiredMonthlyPayment,
} from "./debt-calculations.ts";

test("projects a zero-interest debt through its final payment", () => {
  const projection = calculateDebtProjection({
    balance: 12_000,
    annualRatePct: 0,
    monthlyPayment: 1_000,
    nextPaymentDate: "2026-08-31",
  });

  assert.equal(projection.isAmortizing, true);
  assert.equal(projection.monthsToPayoff, 12);
  assert.equal(projection.totalInterest, 0);
  assert.equal(projection.totalPaid, 12_000);
  assert.equal(projection.payoffDate, "2027-07-31");
});

test("separates interest and principal in an amortizing payment", () => {
  const payment = requiredMonthlyPayment(10_000, 12, 12);
  assert.ok(payment != null);
  assert.ok(Math.abs(payment - 888.49) < 0.01);

  const projection = calculateDebtProjection({
    balance: 10_000,
    annualRatePct: 12,
    monthlyPayment: payment,
    nextPaymentDate: "2026-08-17",
  });

  assert.equal(projection.monthlyInterest, 100);
  assert.ok(Math.abs(projection.firstPrincipal - 788.49) < 0.01);
  assert.equal(projection.monthsToPayoff, 12);
  assert.ok((projection.totalInterest ?? 0) > 600);
  assert.ok((projection.totalInterest ?? Infinity) < 700);
  assert.equal(projection.payoffDate, "2027-07-17");
});

test("flags a payment that does not cover monthly interest", () => {
  const projection = calculateDebtProjection({
    balance: 12_000,
    annualRatePct: 12,
    monthlyPayment: 100,
  });

  assert.equal(projection.monthlyInterest, 120);
  assert.equal(projection.firstPrincipal, 0);
  assert.equal(projection.isAmortizing, false);
  assert.equal(projection.monthsToPayoff, null);
  assert.equal(projection.totalInterest, null);
});

test("monthly forecast respects plan start, final payment, and payoff", () => {
  const plan = {
    balance: 1_500,
    annualRatePct: 0,
    monthlyPayment: 1_000,
    nextPaymentDate: "2026-10-17",
  };

  assert.equal(debtPaymentForMonth(plan, "2026-09"), 0);
  assert.equal(debtPaymentForMonth(plan, "2026-10"), 1_000);
  assert.equal(debtPaymentForMonth(plan, "2026-11"), 500);
  assert.equal(debtPaymentForMonth(plan, "2026-12"), 0);
});

test("an extra payment in the same month does not charge interest twice", () => {
  assert.equal(
    estimatedInterestForPayment({
      balance: 10_000,
      annualRatePct: 12,
      paidAt: "2026-07-20",
      previousPaymentDate: "2026-07-10",
    }),
    0,
  );
  assert.equal(
    estimatedInterestForPayment({
      balance: 10_000,
      annualRatePct: 12,
      paidAt: "2026-08-10",
      previousPaymentDate: "2026-07-20",
    }),
    100,
  );
});
