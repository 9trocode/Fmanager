import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPE_ORDER,
  destinationTransferDelta,
  netWorthContribution,
  sourceTransactionDelta,
} from "./account-types.ts";
import { isValidYmdOnOrBefore } from "./dates.ts";

test("investment is a first-class positive net-worth category", () => {
  assert.equal(ACCOUNT_TYPE_LABEL.investment, "Investment");
  assert.ok(ACCOUNT_TYPE_ORDER.includes("investment"));
  assert.equal(netWorthContribution("investment", 12_500), 12_500);
});

test("liabilities remain negative net-worth contributions", () => {
  assert.equal(netWorthContribution("loan", 12_500), -12_500);
});

test("a transfer into debt reduces the liability balance", () => {
  assert.equal(destinationTransferDelta("loan", 750), -750);
  assert.equal(destinationTransferDelta("cash", 750), 750);
  assert.equal(destinationTransferDelta("investment", 750), 750);
});

test("source-side activity uses liability accounting signs", () => {
  assert.equal(sourceTransactionDelta("cash", "transfer", 750), -750);
  assert.equal(sourceTransactionDelta("loan", "transfer", 750), 750);
  assert.equal(sourceTransactionDelta("loan", "expense", 100), 100);
  assert.equal(sourceTransactionDelta("loan", "income", 100), -100);
});

test("investment snapshot dates must be real dates no later than today", () => {
  assert.equal(isValidYmdOnOrBefore("2026-07-17", "2026-07-17"), true);
  assert.equal(isValidYmdOnOrBefore("2026-07-16", "2026-07-17"), true);
  assert.equal(isValidYmdOnOrBefore("2026-07-18", "2026-07-17"), false);
  assert.equal(isValidYmdOnOrBefore("2026-02-31", "2026-07-17"), false);
  assert.equal(isValidYmdOnOrBefore("not-a-date", "2026-07-17"), false);
});
