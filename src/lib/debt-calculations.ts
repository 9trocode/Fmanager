export interface DebtProjectionInput {
  balance: number;
  annualRatePct: number;
  monthlyPayment: number;
  nextPaymentDate?: string | null;
  maxMonths?: number;
}

export interface DebtProjection {
  balance: number;
  monthlyPayment: number;
  monthlyInterest: number;
  firstPrincipal: number;
  monthsToPayoff: number | null;
  totalInterest: number | null;
  totalPaid: number | null;
  payoffDate: string | null;
  isAmortizing: boolean;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function addMonthsYmd(value: string, months: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const target = new Date(year, month - 1, 1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(day, lastDay));
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
}

export function calculateDebtProjection(
  input: DebtProjectionInput,
): DebtProjection {
  const balance = finiteNonNegative(input.balance);
  const monthlyPayment = finiteNonNegative(input.monthlyPayment);
  const annualRatePct = finiteNonNegative(input.annualRatePct);
  const monthlyRate = annualRatePct / 100 / 12;
  const monthlyInterest = balance * monthlyRate;
  const firstPrincipal = Math.max(0, monthlyPayment - monthlyInterest);
  const isAmortizing =
    balance === 0 || (monthlyPayment > 0 && firstPrincipal > 0);

  if (balance === 0) {
    return {
      balance,
      monthlyPayment,
      monthlyInterest: 0,
      firstPrincipal: 0,
      monthsToPayoff: 0,
      totalInterest: 0,
      totalPaid: 0,
      payoffDate: input.nextPaymentDate ?? null,
      isAmortizing: true,
    };
  }

  if (!isAmortizing) {
    return {
      balance,
      monthlyPayment,
      monthlyInterest,
      firstPrincipal,
      monthsToPayoff: null,
      totalInterest: null,
      totalPaid: null,
      payoffDate: null,
      isAmortizing: false,
    };
  }

  const maxMonths = Math.max(1, Math.floor(input.maxMonths ?? 1_200));
  let remaining = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;

  while (remaining > 0.005 && months < maxMonths) {
    const interest = remaining * monthlyRate;
    const due = remaining + interest;
    const payment = Math.min(monthlyPayment, due);
    const principal = payment - interest;
    if (principal <= 0) break;
    remaining = Math.max(0, remaining - principal);
    totalInterest += interest;
    totalPaid += payment;
    months += 1;
  }

  const paidOff = remaining <= 0.005;
  return {
    balance,
    monthlyPayment,
    monthlyInterest,
    firstPrincipal,
    monthsToPayoff: paidOff ? months : null,
    totalInterest: paidOff ? totalInterest : null,
    totalPaid: paidOff ? totalPaid : null,
    payoffDate:
      paidOff && input.nextPaymentDate
        ? addMonthsYmd(input.nextPaymentDate, Math.max(0, months - 1))
        : null,
    isAmortizing: paidOff,
  };
}

export function requiredMonthlyPayment(
  balanceValue: number,
  annualRatePctValue: number,
  termMonthsValue: number,
): number | null {
  const balance = finiteNonNegative(balanceValue);
  const annualRatePct = finiteNonNegative(annualRatePctValue);
  const termMonths = Math.floor(finiteNonNegative(termMonthsValue));
  if (balance === 0) return 0;
  if (termMonths <= 0) return null;
  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) return balance / termMonths;
  const factor = (1 + monthlyRate) ** termMonths;
  return (balance * monthlyRate * factor) / (factor - 1);
}

function monthIndex(monthKey: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

/** Scheduled installment in a specific month, capped at the final balance. */
export function debtPaymentForMonth(
  input: DebtProjectionInput,
  monthKey: string,
): number {
  const target = monthIndex(monthKey);
  const start = input.nextPaymentDate
    ? monthIndex(input.nextPaymentDate.slice(0, 7))
    : null;
  if (target == null || start == null || target < start) return 0;

  let remaining = finiteNonNegative(input.balance);
  const payment = finiteNonNegative(input.monthlyPayment);
  const monthlyRate = finiteNonNegative(input.annualRatePct) / 100 / 12;
  if (remaining <= 0.005 || payment <= 0) return 0;

  const monthsBeforeTarget = target - start;
  for (let month = 0; month < monthsBeforeTarget; month += 1) {
    const interest = remaining * monthlyRate;
    const installment = Math.min(payment, remaining + interest);
    const principal = installment - interest;
    if (principal <= 0) return payment;
    remaining = Math.max(0, remaining - principal);
    if (remaining <= 0.005) return 0;
  }

  return Math.min(payment, remaining * (1 + monthlyRate));
}

export function estimatedInterestForPayment({
  balance,
  annualRatePct,
  paidAt,
  previousPaymentDate,
}: {
  balance: number;
  annualRatePct: number;
  paidAt: string;
  previousPaymentDate?: string | null;
}): number {
  if (
    previousPaymentDate &&
    previousPaymentDate.slice(0, 7) === paidAt.slice(0, 7)
  ) {
    return 0;
  }
  return (
    finiteNonNegative(balance) * (finiteNonNegative(annualRatePct) / 100 / 12)
  );
}
