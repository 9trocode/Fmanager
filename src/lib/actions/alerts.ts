"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";

export async function dismissAlert(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid alert id.");
  await db
    .update(schema.advisorAlerts)
    .set({ dismissedAt: new Date().toISOString() })
    .where(eq(schema.advisorAlerts.id, id));
  revalidatePath("/", "layout");
}

export async function dismissAllAlerts() {
  await assertAdmin();
  await db
    .update(schema.advisorAlerts)
    .set({ dismissedAt: new Date().toISOString() })
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
      ),
    );
  revalidatePath("/", "layout");
}
