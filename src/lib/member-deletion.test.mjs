import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function applyMigrations(databasePath) {
  const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databasePath },
    encoding: "utf8",
  });

  assert.equal(
    migration.status,
    0,
    `migration failed:\n${migration.stdout}\n${migration.stderr}`,
  );
}

test("deleting a member cascades through their isolated financial data", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cairn-member-delete-"));
  const databasePath = join(tempDir, "member-delete.db");

  try {
    applyMigrations(databasePath);

    const database = new Database(databasePath);
    try {
      database.pragma("foreign_keys = ON");
      const user = database
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, data_scope)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "Delete Repro",
          "delete-repro@example.com",
          "test",
          "viewer",
          "isolated",
        );

      const account = database
        .prepare(
          `INSERT INTO accounts (name, type, currency, owner_user_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run("Private investment", "investment", "USD", user.lastInsertRowid);

      database
        .prepare(
          `INSERT INTO value_snapshots
             (account_id, value, currency, as_of, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          account.lastInsertRowid,
          25_000,
          "USD",
          "2026-07-17",
          user.lastInsertRowid,
        );
      database
        .prepare(
          `INSERT INTO transactions
             (account_id, kind, amount, currency, occurred_at, owner_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          account.lastInsertRowid,
          "income",
          500,
          "USD",
          "2026-07-17",
          user.lastInsertRowid,
        );
      database
        .prepare(
          `INSERT INTO equity_grants
             (account_id, company, total_shares, currency, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          account.lastInsertRowid,
          "Example Co",
          100,
          "USD",
          user.lastInsertRowid,
        );
      database
        .prepare(
          `INSERT INTO recurring_flows
             (name, kind, amount, currency, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("Salary", "income", 1_000, "USD", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO budgets
             (category, monthly_limit, currency, owner_user_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run("Food", 250, "USD", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO decisions (question, owner_user_id) VALUES (?, ?)`,
        )
        .run("Should I invest?", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO prediction_sessions (title, owner_user_id) VALUES (?, ?)`,
        )
        .run("Private prediction", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO chat_sessions (title, owner_user_id) VALUES (?, ?)`,
        )
        .run("Private advice", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO savings_goals
             (name, target_amount, currency, horizon_months, started_at, owner_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "Emergency fund",
          10_000,
          "USD",
          12,
          "2026-07-17",
          user.lastInsertRowid,
        );
      database
        .prepare(
          `INSERT INTO saved_scenarios
             (name, inputs_json, owner_user_id)
           VALUES (?, ?, ?)`,
        )
        .run("Private plan", "{}", user.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO advisor_alerts
             (kind, severity, title, body, dedup_key, owner_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "test",
          "info",
          "Private alert",
          "Test alert",
          "member-delete-test",
          user.lastInsertRowid,
        );

      assert.doesNotThrow(() => {
        database
          .prepare("DELETE FROM users WHERE id = ?")
          .run(user.lastInsertRowid);
      });
      assert.equal(
        database.prepare("SELECT count(*) AS count FROM users").get().count,
        0,
      );
      for (const table of [
        "accounts",
        "advisor_alerts",
        "budgets",
        "chat_sessions",
        "decisions",
        "equity_grants",
        "prediction_sessions",
        "recurring_flows",
        "saved_scenarios",
        "savings_goals",
        "transactions",
        "value_snapshots",
      ]) {
        assert.equal(
          database.prepare(`SELECT count(*) AS count FROM ${table}`).get()
            .count,
          0,
          `${table} should be deleted with its owner`,
        );
      }
    } finally {
      database.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("the corrective migration upgrades a populated pre-fix database", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cairn-member-upgrade-"));
  const databasePath = join(tempDir, "member-upgrade.db");

  try {
    applyMigrations(databasePath);

    let database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.exec(`
      DROP TRIGGER users_delete_owned_data;
      DELETE FROM __drizzle_migrations WHERE created_at = 1784286642845;
    `);
    const user = database
      .prepare(
        `INSERT INTO users (email, password_hash, role, data_scope)
         VALUES (?, ?, ?, ?)`,
      )
      .run("upgrade-repro@example.com", "test", "viewer", "isolated");
    database
      .prepare(
        `INSERT INTO accounts (name, type, currency, owner_user_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run("Pre-migration account", "investment", "USD", user.lastInsertRowid);
    database.close();

    applyMigrations(databasePath);

    database = new Database(databasePath);
    try {
      database.pragma("foreign_keys = ON");
      assert.doesNotThrow(() => {
        database
          .prepare("DELETE FROM users WHERE id = ?")
          .run(user.lastInsertRowid);
      });
      assert.equal(
        database.prepare("SELECT count(*) AS count FROM users").get().count,
        0,
      );
      assert.equal(
        database.prepare("SELECT count(*) AS count FROM accounts").get().count,
        0,
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("member deletion fails closed instead of cascading another owner's data", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "cairn-member-boundary-"));
  const databasePath = join(tempDir, "member-boundary.db");

  try {
    applyMigrations(databasePath);
    const database = new Database(databasePath);
    try {
      database.pragma("foreign_keys = ON");
      const victim = database
        .prepare(
          `INSERT INTO users (email, password_hash, role, data_scope)
           VALUES (?, ?, ?, ?)`,
        )
        .run("victim@example.com", "test", "viewer", "isolated");
      const other = database
        .prepare(
          `INSERT INTO users (email, password_hash, role, data_scope)
           VALUES (?, ?, ?, ?)`,
        )
        .run("other@example.com", "test", "viewer", "isolated");
      const victimAccount = database
        .prepare(
          `INSERT INTO accounts (name, type, currency, owner_user_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run("Victim account", "investment", "USD", victim.lastInsertRowid);
      const victimFlow = database
        .prepare(
          `INSERT INTO recurring_flows
             (name, kind, amount, currency, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("Victim flow", "income", 100, "USD", victim.lastInsertRowid);
      const victimBudget = database
        .prepare(
          `INSERT INTO budgets
             (category, monthly_limit, currency, owner_user_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run("Victim budget", 100, "USD", victim.lastInsertRowid);
      const crossOwnerTransaction = database
        .prepare(
          `INSERT INTO transactions
             (account_id, kind, amount, currency, occurred_at, owner_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          victimAccount.lastInsertRowid,
          "income",
          100,
          "USD",
          "2026-07-17",
          other.lastInsertRowid,
        );
      const crossOwnerSnapshot = database
        .prepare(
          `INSERT INTO value_snapshots
             (account_id, value, currency, as_of, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          victimAccount.lastInsertRowid,
          100,
          "USD",
          "2026-07-17",
          other.lastInsertRowid,
        );
      const crossOwnerFlowOverride = database
        .prepare(
          `INSERT INTO recurring_flow_overrides
             (flow_id, month_key, amount, currency, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          victimFlow.lastInsertRowid,
          "2026-08",
          100,
          "USD",
          other.lastInsertRowid,
        );
      const crossOwnerBudgetOverride = database
        .prepare(
          `INSERT INTO budget_overrides
             (budget_id, month_key, monthly_limit, currency, owner_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          victimBudget.lastInsertRowid,
          "2026-08",
          100,
          "USD",
          other.lastInsertRowid,
        );

      const deleteVictim = () =>
        database
          .prepare("DELETE FROM users WHERE id = ?")
          .run(victim.lastInsertRowid);
      const assertProtected = () => {
        assert.throws(
          deleteVictim,
          /cross-owner reference prevents member deletion/,
        );
      };

      assertProtected();
      database
        .prepare("DELETE FROM transactions WHERE id = ?")
        .run(crossOwnerTransaction.lastInsertRowid);
      assertProtected();
      database
        .prepare("DELETE FROM value_snapshots WHERE id = ?")
        .run(crossOwnerSnapshot.lastInsertRowid);
      assertProtected();
      database
        .prepare("DELETE FROM recurring_flow_overrides WHERE id = ?")
        .run(crossOwnerFlowOverride.lastInsertRowid);
      assertProtected();
      database
        .prepare("DELETE FROM budget_overrides WHERE id = ?")
        .run(crossOwnerBudgetOverride.lastInsertRowid);
      assert.doesNotThrow(deleteVictim);

      assert.equal(
        database.prepare("SELECT count(*) AS count FROM users").get().count,
        1,
      );
      assert.equal(
        database.prepare("SELECT count(*) AS count FROM transactions").get()
          .count,
        0,
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
