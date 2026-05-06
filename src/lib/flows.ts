import type { FlowCadence } from "@/lib/db/schema";

export const FLOW_CADENCE_LABEL: Record<FlowCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function monthlyEquivalent(amount: number, cadence: FlowCadence): number {
  switch (cadence) {
    case "weekly":
      return (amount * 52) / 12;
    case "yearly":
      return amount / 12;
    case "monthly":
    default:
      return amount;
  }
}

export const SUGGESTED_EXPENSE_CATEGORIES = [
  "Housing",
  "Personal",
  "Family",
  "Cloud / SaaS",
  "Contractors",
  "Insurance",
  "Taxes",
  "Subscription",
  "Transport",
  "Other",
];

export const SUGGESTED_INCOME_CATEGORIES = [
  "Salary",
  "Consulting",
  "Dividends",
  "Interest",
  "Royalty",
  "Other",
];
