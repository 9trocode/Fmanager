"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";

export async function dismissAlert(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid alert id.");
  const owner = await getOwner();
  await db
    .update(schema.advisorAlerts)
    .set({ dismissedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.advisorAlerts.id, id),
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
      ),
    );
  revalidatePath("/", "layout");
}

export async function dismissAllAlerts() {
  await assertAdmin();
  const owner = await getOwner();
  await db
    .update(schema.advisorAlerts)
    .set({ dismissedAt: new Date().toISOString() })
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
      ),
    );
  revalidatePath("/", "layout");
}
