"use server";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/db/queries";
import { SUPPORTED_CURRENCIES } from "@/lib/format";

export async function updateBaseCurrency(formData: FormData) {
  const value = String(formData.get("base_currency") ?? "").toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(value as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new Error(`Unsupported currency: ${value}`);
  }
  await setSetting("base_currency", value);
  revalidatePath("/", "layout");
}

export async function updateAnthropicKey(formData: FormData) {
  const raw = String(formData.get("anthropic_api_key") ?? "").trim();
  await setSetting("anthropic_api_key", raw || null);
  revalidatePath("/settings");
}

export async function updateAdvisorModel(formData: FormData) {
  const raw = String(formData.get("advisor_model") ?? "").trim();
  await setSetting("advisor_model", raw || null);
  revalidatePath("/settings");
}
