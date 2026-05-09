"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { setSetting } from "@/lib/db/queries";
import { getOwner } from "@/lib/db/scope";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { accountTypes } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";
import { refreshFxRates } from "@/lib/actions/fx";
import { localToday } from "@/lib/dates";

export async function welcomeSetup(formData: FormData) {
  await assertAdmin();
  const currency = String(formData.get("base_currency") ?? "").toUpperCase();
  if (
    !SUPPORTED_CURRENCIES.includes(
      currency as (typeof SUPPORTED_CURRENCIES)[number],
    )
  ) {
    redirect("/welcome?step=2&error=currency");
  }
  await setSetting("base_currency", currency);
  // Best-effort FX refresh; ignore errors.
  try {
    await refreshFxRates(currency);
  } catch {
    // no-op — they can refresh later in Settings.
  }
  revalidatePath("/", "layout");
  redirect("/welcome?step=3");
}

export async function welcomeAdvisorKey(formData: FormData) {
  await assertAdmin();
  const raw = String(formData.get("anthropic_api_key") ?? "").trim();
  if (raw) {
    await setSetting("anthropic_api_key", raw);
  }
  redirect("/welcome?step=4");
}

export async function welcomeFirstAccount(formData: FormData) {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/welcome?step=4&error=name");
  const typeRaw = String(formData.get("type") ?? "cash");
  if (!accountTypes.includes(typeRaw as (typeof accountTypes)[number])) {
    redirect("/welcome?step=4&error=type");
  }
  const type = typeRaw as (typeof accountTypes)[number];
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const openingRaw = String(formData.get("opening_balance") ?? "0").replace(
    /[, ]/g,
    "",
  );
  const opening = Number(openingRaw);
  const safeOpening = Number.isFinite(opening) ? opening : 0;

  const owner = await getOwner();
  const [created] = await db
    .insert(schema.accounts)
    .values({ name, type, currency, institution, ownerUserId: owner })
    .returning();

  if (created) {
    await db.insert(schema.valueSnapshots).values({
      accountId: created.id,
      value: safeOpening,
      currency,
      asOf: localToday(),
      source: "manual",
      ownerUserId: owner,
    });
  }
  revalidatePath("/", "layout");
  redirect("/welcome?step=5");
}

export async function completeOnboarding() {
  await assertAdmin();
  await setSetting("onboarding_complete", "true");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function welcomeSeedAndComplete() {
  await assertAdmin();
  const { seedSampleData } = await import("@/lib/actions/seed");
  await seedSampleData();
  await setSetting("onboarding_complete", "true");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
