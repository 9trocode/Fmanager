"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { MoneyInput } from "@/components/app/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/account-types";
import type { AccountType } from "@/lib/db/schema";
import { localToday } from "@/lib/dates";

export type AccountFieldsValue = {
  name?: string;
  type?: AccountType;
  currency?: string;
  institution?: string | null;
  notes?: string | null;
  accountNumber?: string | null;
  routingOrIban?: string | null;
  swiftBic?: string | null;
  holderName?: string | null;
  branch?: string | null;
  loginUrl?: string | null;
  contactPhone?: string | null;
  statementsUrl?: string | null;
  // Loan terms (only meaningful when type === "loan")
  interestRatePct?: number | null;
  originalPrincipal?: number | null;
  loanTermMonths?: number | null;
  paymentDayOfMonth?: number | null;
};

export function AccountFields({
  defaults,
  showOpening,
}: {
  defaults?: AccountFieldsValue;
  showOpening?: boolean;
}) {
  const [accountType, setAccountType] = useState<AccountType>(
    defaults?.type ?? "cash",
  );
  const isLoan = accountType === "loan";
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaults?.name ?? ""}
          placeholder="Mercury USD checking"
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          {/*
            Hidden mirror so server actions get the value via FormData
            even though Radix Select's `name` integration isn't always
            reliable. Same pattern as the flow form.
          */}
          <input type="hidden" name="type" value={accountType} />
          <Select
            value={accountType}
            onValueChange={(v) => setAccountType(v as AccountType)}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Select name="currency" defaultValue={defaults?.currency ?? "USD"}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="institution">Institution (optional)</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={defaults?.institution ?? ""}
          placeholder="Mercury, Wise, Fidelity, …"
        />
      </div>
      {showOpening ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="opening_balance">Opening balance</Label>
            <MoneyInput
              id="opening_balance"
              name="opening_balance"
              defaultValue={0}
              allowNegative
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="as_of">As of</Label>
            <Input
              id="as_of"
              name="as_of"
              type="date"
              defaultValue={localToday()}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Anything that matters about this account."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>

      {/*
        Loan-only terms section. Only meaningful when type === "loan".
        These power the advisor's debt-vs-emergency-fund recommendations
        — without them the model has to ask conversationally for rate +
        balance every time.
      */}
      {isLoan ? (
        <>
          <Separator className="my-2" />
          <div className="space-y-3">
            <div className="text-sm font-medium">Loan terms</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="interest_rate_pct">
                  Interest rate (% APR)
                </Label>
                <Input
                  id="interest_rate_pct"
                  name="interest_rate_pct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={defaults?.interestRatePct ?? ""}
                  placeholder="e.g. 22.5"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="original_principal">Original principal</Label>
                <MoneyInput
                  id="original_principal"
                  name="original_principal"
                  defaultValue={defaults?.originalPrincipal ?? null}
                  placeholder="What the loan started at"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loan_term_months">Term (months)</Label>
                <Input
                  id="loan_term_months"
                  name="loan_term_months"
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={defaults?.loanTermMonths ?? ""}
                  placeholder="e.g. 24"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment_day_of_month">
                  Payment day (1–31)
                </Label>
                <Input
                  id="payment_day_of_month"
                  name="payment_day_of_month"
                  type="number"
                  step="1"
                  min="1"
                  max="31"
                  defaultValue={defaults?.paymentDayOfMonth ?? ""}
                  placeholder="Day of the month payment lands"
                  inputMode="numeric"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              The advisor uses these to weigh paying the loan down vs.
              building your emergency fund. All optional, but supplying
              them means it can answer without asking you each time.
            </p>
          </div>
        </>
      ) : null}

      <Separator className="my-2" />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium select-none flex items-center justify-between">
          <span>
            Bank details{" "}
            <span className="text-muted-foreground font-normal">
              (optional · stored locally)
            </span>
          </span>
          <span className="text-[11px] text-muted-foreground group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="account_number">Account number</Label>
              <Input
                id="account_number"
                name="account_number"
                defaultValue={defaults?.accountNumber ?? ""}
                placeholder="••• 1234"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="routing_or_iban">IBAN / routing / sort</Label>
              <Input
                id="routing_or_iban"
                name="routing_or_iban"
                defaultValue={defaults?.routingOrIban ?? ""}
                placeholder="DE89… or 021000021"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="swift_bic">SWIFT / BIC</Label>
              <Input
                id="swift_bic"
                name="swift_bic"
                defaultValue={defaults?.swiftBic ?? ""}
                placeholder="DEUTDEFFXXX"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                name="branch"
                defaultValue={defaults?.branch ?? ""}
                placeholder="Main · Lagos VI"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="holder_name">Account holder</Label>
              <Input
                id="holder_name"
                name="holder_name"
                defaultValue={defaults?.holderName ?? ""}
                placeholder="Your legal name on the account"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_phone">Support phone</Label>
              <Input
                id="contact_phone"
                name="contact_phone"
                defaultValue={defaults?.contactPhone ?? ""}
                placeholder="+1 415 555 0100"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="login_url">Login URL</Label>
              <Input
                id="login_url"
                name="login_url"
                type="url"
                defaultValue={defaults?.loginUrl ?? ""}
                placeholder="https://mercury.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="statements_url">Statements URL</Label>
              <Input
                id="statements_url"
                name="statements_url"
                type="url"
                defaultValue={defaults?.statementsUrl ?? ""}
                placeholder="https://…/statements"
                autoComplete="off"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            These fields are stored as plain text in your local SQLite database.
            Anyone with disk access can read them. Use full-disk encryption if
            you put real account numbers here.
          </p>
        </div>
      </details>
    </div>
  );
}
