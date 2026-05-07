"use server";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/db/queries";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { assertAdmin } from "@/lib/auth/session";
import {
  ADVISOR_PROVIDERS,
  PROVIDER_KEY_SETTING,
  type AdvisorProvider,
} from "@/lib/ai/providers";

export async function updateBaseCurrency(formData: FormData) {
  await assertAdmin();
  const value = String(formData.get("base_currency") ?? "").toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(value as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new Error(`Unsupported currency: ${value}`);
  }
  await setSetting("base_currency", value);
  revalidatePath("/", "layout");
}

export async function updateAdvisorProvider(formData: FormData) {
  await assertAdmin();
  const raw = String(formData.get("advisor_provider") ?? "").toLowerCase();
  if (!ADVISOR_PROVIDERS.includes(raw as AdvisorProvider)) {
    throw new Error(`Unsupported provider: ${raw}`);
  }
  await setSetting("advisor_provider", raw);
  // Switching provider invalidates the previous model id (it was for a
  // different vendor). Clear it so the per-provider default kicks in until
  // the user explicitly sets a new model.
  await setSetting("advisor_model", null);
  revalidatePath("/settings");
  revalidatePath("/advisor");
}

export async function updateAdvisorKey(formData: FormData) {
  await assertAdmin();
  const provider = String(formData.get("provider") ?? "").toLowerCase();
  if (!ADVISOR_PROVIDERS.includes(provider as AdvisorProvider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const raw = String(formData.get("api_key") ?? "").trim();
  await setSetting(
    PROVIDER_KEY_SETTING[provider as AdvisorProvider],
    raw || null,
  );
  revalidatePath("/settings");
  revalidatePath("/advisor");
}

/** Legacy single-key form action — kept for back-compat. */
export async function updateAnthropicKey(formData: FormData) {
  await assertAdmin();
  const raw = String(formData.get("anthropic_api_key") ?? "").trim();
  await setSetting("anthropic_api_key", raw || null);
  revalidatePath("/settings");
}

export async function updateAdvisorModel(formData: FormData) {
  await assertAdmin();
  const raw = String(formData.get("advisor_model") ?? "").trim();
  await setSetting("advisor_model", raw || null);
  revalidatePath("/settings");
}
