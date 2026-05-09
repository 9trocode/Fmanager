import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);

/**
 * Owner-scoping column on every user-owned table. NULL = "belongs to
 * the host" (the implicit settings-admin and every shared-scope user
 * read/write these rows). A concrete user id pins the row to that
 * user's isolated tenant.
 *
 * Forward-referenced via thunk so the helper can sit above the users
 * table definition. `onDelete: cascade` so removing an isolated user
 * cleans up their data.
 */
const ownerUserId = () =>
  integer("owner_user_id").references((): any => users.id, {
    onDelete: "cascade",
  });

export const accountTypes = [
  "cash",
  "brokerage",
  "crypto",
  "real_estate",
  "equity",
  "retirement",
  "loan",
  "other",
] as const;
export type AccountType = (typeof accountTypes)[number];

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type", { enum: accountTypes }).notNull(),
    currency: text("currency").notNull(),
    institution: text("institution"),
    notes: text("notes"),
    // Optional account-detail fields. All free-text, all optional.
    // Stored locally — anyone with disk access can read these. Use disk
    // encryption if you put sensitive numbers here.
    accountNumber: text("account_number"),
    routingOrIban: text("routing_or_iban"),
    swiftBic: text("swift_bic"),
    holderName: text("holder_name"),
    branch: text("branch"),
    loginUrl: text("login_url"),
    contactPhone: text("contact_phone"),
    statementsUrl: text("statements_url"),
    /**
     * Loan-only fields — populated when `type = "loan"`. Optional even
     * for loans (the user might not know the rate yet) but the advisor
     * needs them to give meaningful debt-vs-emergency-fund advice.
     *
     * Without these, the advisor can see "you have a NGN 700k loan" but
     * can't price its cost of capital, so it asks the user for them
     * conversationally — fine for a one-off, painful for a recurring chat.
     */
    interestRatePct: real("interest_rate_pct"),
    originalPrincipal: real("original_principal"),
    loanTermMonths: integer("loan_term_months"),
    paymentDayOfMonth: integer("payment_day_of_month"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    archivedIdx: index("accounts_archived_idx").on(t.archived),
    ownerIdx: index("accounts_owner_idx").on(t.ownerUserId),
  }),
);

export const valueSnapshots = sqliteTable(
  "value_snapshots",
  {
    id: id(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    value: real("value").notNull(),
    currency: text("currency").notNull(),
    asOf: text("as_of").notNull(),
    source: text("source").notNull().default("manual"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
  },
  (t) => ({
    accountAsOfIdx: index("value_snapshots_account_as_of_idx").on(
      t.accountId,
      t.asOf,
    ),
    ownerIdx: index("value_snapshots_owner_idx").on(t.ownerUserId),
  }),
);

export const equityGrants = sqliteTable(
  "equity_grants",
  {
    id: id(),
    accountId: integer("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    company: text("company").notNull(),
    grantType: text("grant_type", {
      enum: ["iso", "nso", "rsu", "founder_shares", "safe", "other"],
    })
      .notNull()
      .default("nso"),
    totalShares: real("total_shares").notNull(),
    vestedShares: real("vested_shares").notNull().default(0),
    strikePrice: real("strike_price"),
    currency: text("currency").notNull().default("USD"),
    fmvPerShare: real("fmv_per_share"),
    exitPricePerShare: real("exit_price_per_share"),
    vestingStartDate: text("vesting_start_date"),
    vestingMonths: integer("vesting_months").default(48),
    cliffMonths: integer("cliff_months").default(12),
    expectedExitMonths: integer("expected_exit_months"),
    taxRatePct: real("tax_rate_pct"),
    vestingNotes: text("vesting_notes"),
    grantedAt: text("granted_at"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    accountIdx: index("equity_grants_account_idx").on(t.accountId),
    ownerIdx: index("equity_grants_owner_idx").on(t.ownerUserId),
  }),
);

export const fxRates = sqliteTable(
  "fx_rates",
  {
    id: id(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: real("rate").notNull(),
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    // getRate() runs constantly — every aggregator hits this table.
    // Composite covers the WHERE base=? AND quote=? plus the
    // ORDER BY fetchedAt DESC LIMIT 1 in one b-tree walk.
    pairFetchedIdx: index("fx_rates_pair_fetched_idx").on(
      t.base,
      t.quote,
      t.fetchedAt,
    ),
  }),
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: id(),
    question: text("question").notNull(),
    context: text("context"),
    status: text("status", { enum: ["open", "decided", "deferred"] })
      .notNull()
      .default("open"),
    decidedAt: text("decided_at"),
    outcome: text("outcome"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    statusIdx: index("decisions_status_idx").on(t.status),
    ownerIdx: index("decisions_owner_idx").on(t.ownerUserId),
  }),
);

export const flowCadences = ["weekly", "monthly", "yearly"] as const;
export type FlowCadence = (typeof flowCadences)[number];

export const flowKinds = ["income", "expense"] as const;
export type FlowKind = (typeof flowKinds)[number];

export const recurringFlows = sqliteTable(
  "recurring_flows",
  {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: flowKinds }).notNull(),
  category: text("category"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  cadence: text("cadence", { enum: flowCadences }).notNull().default("monthly"),
  /**
   * Account the cash flows from (kind=expense) or to (kind=income).
   * Optional for back-compat with existing rows. New entries should require it.
   */
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /**
   * Last calendar period (`YYYY-MM-DD`) for which an auto-accrued
   * transaction has already been posted. Drives `accrueDueFlows()` so a
   * monthly salary turns into a real transaction on the linked account
   * once each month has elapsed — making net worth actually reflect the
   * recurring inflow instead of it being a "plan" that never materialises.
   *
   * Null means the flow has never been accrued. New flows are seeded with
   * the period boundary at creation time so the first accrual fires after
   * one full cadence has passed (no surprise back-dated transactions).
   */
  lastPostedAt: text("last_posted_at"),
  /**
   * Optional explicit next-due date (`YYYY-MM-DD`). When set, the
   * accruer posts the next transaction ON THIS DATE (rather than
   * `lastPostedAt + cadence`). On each post the date is advanced by
   * one cadence, so a monthly salary anchored to the 25th keeps
   * landing on the 25th forever — even if the user opens the app
   * weeks late.
   *
   * When null, falls back to the original "since lastPostedAt"
   * behavior. Editable from the flow form so the user can retarget
   * payday ("starting next month it's the 30th").
   */
  nextDueAt: text("next_due_at"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  ownerUserId: ownerUserId(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  },
  (t) => ({
    accountIdx: index("recurring_flows_account_idx").on(t.accountId),
    archivedIdx: index("recurring_flows_archived_idx").on(t.archived),
    ownerIdx: index("recurring_flows_owner_idx").on(t.ownerUserId),
  }),
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: updatedAt(),
});

export const transactionKinds = ["expense", "income", "transfer"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

export const goalKinds = [
  "savings",
  "net_worth",
  "fire",
  "debt_payoff",
] as const;
export type GoalKind = (typeof goalKinds)[number];

/**
 * Unified goals table (originally `savings_goals`; kept that table name for
 * back-compat). Each row represents one of four kinds:
 *
 *  - savings:     Save toward target via monthly contribution. Manual current.
 *  - net_worth:   Reach a target total net worth. Current = computed (floor).
 *  - fire:        Financial independence. Target = computed (annual_expenses ×
 *                 fireMultiplier). Current = computed (floor net worth).
 *  - debt_payoff: Drive a linked loan account's balance to zero. Current =
 *                 effective balance of that account.
 */
export const savingsGoals = sqliteTable(
  "savings_goals",
  {
    id: id(),
    kind: text("kind", { enum: goalKinds }).notNull().default("savings"),
    name: text("name").notNull(),
    category: text("category"),
    targetAmount: real("target_amount"),
    currentAmount: real("current_amount").notNull().default(0),
    currency: text("currency").notNull(),
    monthlyContribution: real("monthly_contribution").notNull().default(0),
    expectedReturnPct: real("expected_return_pct").notNull().default(0),
    horizonMonths: integer("horizon_months").notNull().default(12),
    /** Optional explicit target date (ISO YYYY-MM-DD). If null, horizonMonths is used. */
    targetDate: text("target_date"),
    /** Multiplier for FIRE kind (default 25 = 4% rule). */
    fireMultiplier: real("fire_multiplier"),
    startedAt: text("started_at").notNull(),
    accountId: integer("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    archivedIdx: index("savings_goals_archived_idx").on(t.archived),
    accountIdx: index("savings_goals_account_idx").on(t.accountId),
    ownerIdx: index("savings_goals_owner_idx").on(t.ownerUserId),
  }),
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    category: text("category").notNull(),
    monthlyLimit: real("monthly_limit").notNull(),
    currency: text("currency").notNull(),
    /**
     * Optional. When set, the budget only counts transactions on THIS
     * account (handy when one category — say "Food" — is split across
     * multiple accounts and you only want to budget the Naira side, or
     * when you want a per-card cap). When null, the budget counts every
     * transaction in its category across all accounts.
     */
    accountId: integer("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    accountIdx: index("budgets_account_idx").on(t.accountId),
    ownerIdx: index("budgets_owner_idx").on(t.ownerUserId),
  }),
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // For transfers: optional destination account
    destAccountId: integer("dest_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: transactionKinds }).notNull(),
    amount: real("amount").notNull(), // always positive; sign comes from kind
    currency: text("currency").notNull(),
    category: text("category"), // free-text; reuse the same suggestions as flows (lib/flows.ts)
    occurredAt: text("occurred_at").notNull(), // ISO date YYYY-MM-DD
    notes: text("notes"),
    flowId: integer("flow_id").references(() => recurringFlows.id, {
      onDelete: "set null",
    }),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    occurredAtIdx: index("transactions_occurred_at_idx").on(t.occurredAt),
    accountIdx: index("transactions_account_idx").on(t.accountId),
    destAccountIdx: index("transactions_dest_account_idx").on(t.destAccountId),
    categoryIdx: index("transactions_category_idx").on(t.category),
    flowIdx: index("transactions_flow_idx").on(t.flowId),
    accountOccurredIdx: index("transactions_account_occurred_idx").on(
      t.accountId,
      t.occurredAt,
    ),
    ownerIdx: index("transactions_owner_idx").on(t.ownerUserId),
    flowOccurredUniq: uniqueIndex("transactions_flow_occurred_uniq")
      .on(t.flowId, t.occurredAt)
      .where(sql`${t.flowId} IS NOT NULL`),
  }),
);

/**
 * Advisor chat history. Sessions are independent threads; messages are
 * the full UIMessage v6 shape persisted as JSON so we round-trip text,
 * file attachments, and tool-call parts without a column-per-part-type
 * schema. Messages cascade on session delete.
 */
/**
 * Prediction conversations on /projections. Distinct from advisor
 * `chatSessions` because the message payload is different — each
 * advisor turn carries an array of scenario blocks (each with
 * proposedEdits, per-block saved/applied flags, etc), not a v6
 * UIMessage. JSON-blob the whole ChatMessage shape so the UI's
 * client-side type can evolve without migrations.
 */
export const predictionSessions = sqliteTable(
  "prediction_sessions",
  {
    id: id(),
    title: text("title").notNull().default("New prediction"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    ownerIdx: index("prediction_sessions_owner_idx").on(t.ownerUserId),
  }),
);

export const predictionMessageRoles = ["user", "advisor", "error"] as const;
export type PredictionMessageRole = (typeof predictionMessageRoles)[number];

export const predictionMessages = sqliteTable(
  "prediction_messages",
  {
    id: id(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => predictionSessions.id, { onDelete: "cascade" }),
    /** Stable client-generated id so retries / partial state updates dedupe. */
    clientId: text("client_id").notNull(),
    role: text("role", { enum: predictionMessageRoles }).notNull(),
    /** Full ChatMessage JSON — text + scenarios + per-block state. */
    payloadJson: text("payload_json").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    sessionCreatedIdx: index("prediction_messages_session_created_idx").on(
      t.sessionId,
      t.createdAt,
    ),
    sessionClientIdx: index("prediction_messages_session_client_idx").on(
      t.sessionId,
      t.clientId,
    ),
  }),
);

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: id(),
    title: text("title").notNull().default("New conversation"),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    ownerIdx: index("chat_sessions_owner_idx").on(t.ownerUserId),
  }),
);

/**
 * User-saved projection scenarios. Each row is one named projection
 * configuration the user wanted to keep — either manually authored or
 * generated by `suggestScenarios()`. The full ProjectionInputs blob
 * (monthlyContribution + return + horizon + events) lives in
 * `inputs_json` so we can evolve the event shape without a migration.
 */
export const savedScenarioSources = ["user", "ai"] as const;
export type SavedScenarioSource = (typeof savedScenarioSources)[number];

export const savedScenarios = sqliteTable(
  "saved_scenarios",
  {
    id: id(),
    name: text("name").notNull(),
    /** Free-text rationale, populated for AI-generated scenarios. */
    rationale: text("rationale"),
    /** JSON-serialised ProjectionInputs. */
    inputsJson: text("inputs_json").notNull(),
    source: text("source", { enum: savedScenarioSources })
      .notNull()
      .default("user"),
    /** Optional context: which goal was selected when this was saved. */
    goalId: integer("goal_id").references(() => savingsGoals.id, {
      onDelete: "set null",
    }),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    createdIdx: index("saved_scenarios_created_idx").on(t.createdAt),
    goalIdx: index("saved_scenarios_goal_idx").on(t.goalId),
    ownerIdx: index("saved_scenarios_owner_idx").on(t.ownerUserId),
  }),
);

/**
 * Proactive advisor alerts. Generated by `runAdvisorChecks()` on app
 * load (throttled) when deterministic rules trip — runway dropping
 * below 3 months, a budget blowing past 100%, a savings goal going
 * off-pace, etc. The user can dismiss each one; dedupKey ensures the
 * same condition in the same period doesn't spam multiple rows.
 */
export const alertSeverities = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof alertSeverities)[number];

export const advisorAlerts = sqliteTable(
  "advisor_alerts",
  {
    id: id(),
    /** Stable kind identifier for grouping/filtering: e.g. "runway_critical", "budget_over", "goal_off_pace". */
    kind: text("kind").notNull(),
    severity: text("severity", { enum: alertSeverities }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Optional in-app destination, e.g. /budgets/12 or /savings/4. */
    actionUrl: text("action_url"),
    /** JSON blob of related entity refs (budgetId, goalId, etc.) for the UI to deep-link off. */
    contextJson: text("context_json"),
    /**
     * Period-scoped dedup key so the same condition in the same period
     * (month for budget alerts, day for runway alerts) only ever
     * inserts once. Uniqueness is enforced via the index below — the
     * detection loop INSERT … ON CONFLICT DO NOTHING and moves on.
     */
    dedupKey: text("dedup_key").notNull(),
    ownerUserId: ownerUserId(),
    createdAt: createdAt(),
    dismissedAt: text("dismissed_at"),
    /** Set when the underlying condition is no longer true (auto-resolution). */
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    // Per-owner uniqueness — same dedup_key can exist across different
    // tenants (each computes runway/budget alerts independently).
    dedupUniq: uniqueIndex("advisor_alerts_dedup_uniq").on(
      t.ownerUserId,
      t.dedupKey,
    ),
    ownerIdx: index("advisor_alerts_owner_idx").on(t.ownerUserId),
    // Hot path: "give me the active alerts" — neither dismissed nor resolved.
    activeIdx: index("advisor_alerts_active_idx").on(
      t.dismissedAt,
      t.resolvedAt,
      t.createdAt,
    ),
  }),
);

/**
 * Additional members the admin has invited (family, partner, etc.).
 *
 * The original "settings-based admin" still exists and remains the
 * implicit owner of this instance — see `auth/session.ts`. Rows here
 * are *additional* accounts the owner has provisioned; they sign in
 * with their own email/password and carry a per-row role.
 *
 * Single-user installs that never invite anyone leave this table empty.
 */
export const userRoles = ["admin", "viewer"] as const;
export type UserRole = (typeof userRoles)[number];

/**
 * How a user's reads + writes are scoped against the data tables.
 *
 * - "shared":   Family / co-founder model. The user reads + writes the
 *               host's data (rows where owner_user_id IS NULL). Their role
 *               (admin vs viewer) gates whether they can mutate.
 * - "isolated": Multi-tenant model. The user has their own data silo
 *               (rows where owner_user_id = users.id). They never see the
 *               host's data and the host never sees theirs. Always
 *               role="admin" within their own silo.
 *
 * Determined at signup: invites default to "shared", open registration
 * defaults to "isolated".
 */
export const dataScopes = ["shared", "isolated"] as const;
export type DataScope = (typeof dataScopes)[number];

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: userRoles }).notNull(),
    /** Defaults to "shared" so existing/invited members keep current behavior. */
    dataScope: text("data_scope", { enum: dataScopes })
      .notNull()
      .default("shared"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    emailUniq: uniqueIndex("users_email_uniq").on(t.email),
  }),
);

/**
 * One-time codes the admin generates so a specific person can register.
 *
 * The admin can also flip "registration_enabled" to allow open signup
 * without a code — invites are the safer default though, since the app
 * is internet-reachable when self-hosted.
 *
 * On successful signup the row's `usedAt` is stamped and `usedByUserId`
 * is set. Codes are single-use.
 */
/**
 * Per-tenant override for settings that aren't host-instance-wide.
 *
 * The host's global `settings` table holds:
 *   • host-only config (admin_email/name/password_hash, registration_mode)
 *   • global defaults (FX last refresh, baseline base_currency, etc.)
 *
 * `user_settings` overrides scoped settings on a per-user basis. When
 * an isolated tenant changes their base_currency, AI key, screen-lock
 * timeout, or panic URL, the row lands here keyed by their user id —
 * not in the host's global table. Host (settings-admin) + shared users
 * keep using the global table because they share the host's tenancy.
 */
export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: updatedAt(),
  },
  (t) => ({
    pk: uniqueIndex("user_settings_user_key_uniq").on(t.userId, t.key),
  }),
);

export const invites = sqliteTable(
  "invites",
  {
    id: id(),
    code: text("code").notNull(),
    email: text("email"),
    role: text("role", { enum: userRoles }).notNull(),
    /**
     * Whether the invited user joins the host's shared data (default,
     * for family/partner use) or gets their own isolated tenant
     * (for resell / hosted-for-others use).
     */    dataScope: text("data_scope", { enum: dataScopes })
      .notNull()
      .default("shared"),
    expiresAt: text("expires_at"),
    usedAt: text("used_at"),
    usedByUserId: integer("used_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => ({
    codeUniq: uniqueIndex("invites_code_uniq").on(t.code),
  }),
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    // Stable client id (UIMessage.id) so re-sends from useChat dedupe
    // against existing rows instead of inserting duplicates.
    clientId: text("client_id").notNull(),
    role: text("role").notNull(),
    /** JSON-serialised full UIMessage (text/file/tool parts). */
    uiJson: text("ui_json").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    // getChatSession() reads by sessionId ordered by created_at then id.
    // Composite covers the lookup and the ordering.
    sessionCreatedIdx: index("chat_messages_session_created_idx").on(
      t.sessionId,
      t.createdAt,
    ),
    // upsertChatMessage's "find existing by clientId" uses both columns.
    sessionClientIdx: index("chat_messages_session_client_idx").on(
      t.sessionId,
      t.clientId,
    ),
  }),
);

