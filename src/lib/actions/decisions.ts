"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";

const STARTER_DECISIONS = [
  {
    question:
      "Should I shift 30–40% of my NGN cash to USD this quarter, given continued naira volatility?",
    context:
      "Most real obligations (cloud, contractors, travel) are USD-denominated. NGN exposure beyond ~3 months of local burn is risk.",
  },
  {
    question:
      "Should I early-exercise my vested options now to start the long-term cap-gains clock, or hold and avoid the AMT/cash hit?",
    context:
      "Decision depends on strike, FMV spread, and how much liquid USD I can actually part with without dropping below floor runway.",
  },
  {
    question:
      "Assuming my company equity is worth $0, what is my honest monthly burn floor — and am I above or below the 18-month runway threshold?",
    context:
      "Floor scenario must sustain at least 18 months of personal living without raising. If not, every other decision (exercise, hedge, lifestyle) gets re-prioritized.",
  },
];

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/advisor");
  revalidatePath("/", "layout");
}

export async function createDecision(formData: FormData) {
  await assertAdmin();
  const question = String(formData.get("question") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim() || null;
  if (!question) throw new Error("Question is required.");
  await db.insert(schema.decisions).values({ question, context });
  revalidate();
}

export async function updateDecision(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const question = String(formData.get("question") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim() || null;
  if (!question) throw new Error("Question is required.");
  await db
    .update(schema.decisions)
    .set({ question, context, updatedAt: new Date().toISOString() })
    .where(eq(schema.decisions.id, id));
  revalidate();
}

export async function setDecisionStatus(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "open") as
    | "open"
    | "decided"
    | "deferred";
  const outcome = String(formData.get("outcome") ?? "").trim() || null;
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.decisions)
    .set({
      status,
      outcome,
      decidedAt: status === "decided" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.decisions.id, id));
  revalidate();
}

export async function deleteDecision(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.decisions).where(eq(schema.decisions.id, id));
  revalidate();
}

export async function seedStarterDecisions() {
  await assertAdmin();
  const existing = await db.select().from(schema.decisions).limit(1);
  if (existing.length > 0) return { seeded: false };
  await db.insert(schema.decisions).values(STARTER_DECISIONS);
  revalidate();
  return { seeded: true };
}
