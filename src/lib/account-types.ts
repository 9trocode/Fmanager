import type { AccountType, TransactionKind } from "@/lib/db/schema";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  investment: "Investment",
  brokerage: "Brokerage",
  crypto: "Crypto",
  real_estate: "Real estate",
  equity: "Equity",
  retirement: "Retirement",
  loan: "Loan / Debt",
  other: "Other",
};

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "cash",
  "investment",
  "brokerage",
  "crypto",
  "real_estate",
  "retirement",
  "equity",
  "other",
  "loan",
];

export function isLiability(type: AccountType): boolean {
  return type === "loan";
}

export function netWorthContribution(
  type: AccountType,
  effectiveValue: number,
): number {
  return isLiability(type) ? -effectiveValue : effectiveValue;
}

/** A transfer repays a liability but increases an asset balance. */
export function destinationTransferDelta(
  type: AccountType,
  amount: number,
): number {
  return isLiability(type) ? -amount : amount;
}

/** Source-side activity has the opposite sign for liabilities and assets. */
export function sourceTransactionDelta(
  type: AccountType,
  kind: TransactionKind,
  amount: number,
): number {
  const assetDelta = kind === "income" ? amount : -amount;
  return isLiability(type) ? -assetDelta : assetDelta;
}
