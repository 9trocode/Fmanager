import type { AccountType } from "@/lib/db/schema";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
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
