"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";
import type {
  ProjectionInputs,
  ScenarioEvent,
} from "@/lib/projections";
import type { SavedScenarioSource } from "@/lib/db/schema";

export type SavedScenarioRow = {
  id: number;
  name: string;
  rationale: string | null;
  source: SavedScenarioSource;
  goalId: number | null;
  inputs: ProjectionInputs;
  createdAt: string;
  updatedAt: string;
};

/**
 * Parse the wire shape stored in inputs_json back into the engine's
 * `ProjectionInputs`. Defends against malformed rows by falling back to
 * a safe minimum — better to render an empty card than to throw.
 */
function parseInputs(json: string): ProjectionInputs {
  try {
    const obj = JSON.parse(json) as Partial<ProjectionInputs>;
    return {
      monthlyContribution: Number(obj.monthlyContribution) || 0,
      annualReturnPct: Number(obj.annualReturnPct) || 0,
      horizonMonths: Number(obj.horizonMonths) || 60,
      events: Array.isArray(obj.events)
        ? (obj.events as ScenarioEvent[])
        : [],
    };
  } catch {
    return {
      monthlyContribution: 0,
      annualReturnPct: 0,
      horizonMonths: 60,
      events: [],
    };
  }
}

export async function listSavedScenarios(): Promise<SavedScenarioRow[]> {
  await assertAdmin();
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.savedScenarios)
    .where(ownedBy(schema.savedScenarios.ownerUserId, owner))
    .orderBy(desc(schema.savedScenarios.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rationale: r.rationale,
    source: r.source,
    goalId: r.goalId,
    inputs: parseInputs(r.inputsJson),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function saveScenario(input: {
  name: string;
  rationale?: string | null;
  inputs: ProjectionInputs;
  source?: SavedScenarioSource;
  goalId?: number | null;
}): Promise<{ id: number }> {
  await assertAdmin();
  if (!input.name.trim()) throw new Error("Scenario name is required.");
  const owner = await getOwner();
  const [row] = await db
    .insert(schema.savedScenarios)
    .values({
      name: input.name.trim(),
      rationale: input.rationale?.trim() || null,
      inputsJson: JSON.stringify(input.inputs),
      source: input.source ?? "user",
      goalId: input.goalId ?? null,
      ownerUserId: owner,
    })
    .returning({ id: schema.savedScenarios.id });
  revalidatePath("/projections");
  return { id: row.id };
}

export async function updateSavedScenario(input: {
  id: number;
  name?: string;
  rationale?: string | null;
  inputs?: ProjectionInputs;
  goalId?: number | null;
}): Promise<void> {
  await assertAdmin();
  const set: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Scenario name is required.");
    set.name = input.name.trim();
  }
  if (input.rationale !== undefined) {
    set.rationale = input.rationale?.trim() || null;
  }
  if (input.inputs !== undefined) {
    set.inputsJson = JSON.stringify(input.inputs);
  }
  if (input.goalId !== undefined) {
    set.goalId = input.goalId;
  }
  const owner = await getOwner();
  await db
    .update(schema.savedScenarios)
    .set(set)
    .where(
      and(
        eq(schema.savedScenarios.id, input.id),
        ownedBy(schema.savedScenarios.ownerUserId, owner),
      ),
    );
  revalidatePath("/projections");
}

export async function deleteSavedScenario(id: number): Promise<void> {
  await assertAdmin();
  const owner = await getOwner();
  await db
    .delete(schema.savedScenarios)
    .where(
      and(
        eq(schema.savedScenarios.id, id),
        ownedBy(schema.savedScenarios.ownerUserId, owner),
      ),
    );
  revalidatePath("/projections");
}
