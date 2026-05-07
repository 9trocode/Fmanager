import "server-only";
import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getSetting } from "@/lib/db/queries";
import {
  DEFAULT_MODEL,
  PROVIDER_ENV,
  PROVIDER_KEY_SETTING,
  PROVIDER_LABEL,
  isProvider,
  type AdvisorProvider,
} from "@/lib/ai/providers";

// Re-export everything from the client-safe module for backwards compat with
// existing import paths (`@/lib/ai/provider`).
export {
  ADVISOR_PROVIDERS,
  DEFAULT_MODEL,
  PROVIDER_ENV,
  PROVIDER_KEY_SETTING,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
  isProvider,
} from "@/lib/ai/providers";
export type { AdvisorProvider } from "@/lib/ai/providers";

export async function getAdvisorProvider(): Promise<AdvisorProvider> {
  const raw = await getSetting("advisor_provider");
  return isProvider(raw) ? raw : "anthropic";
}

export async function getAdvisorModelId(
  provider?: AdvisorProvider,
): Promise<string> {
  const p = provider ?? (await getAdvisorProvider());
  const stored = (await getSetting("advisor_model")) ?? "";
  return stored.trim() || DEFAULT_MODEL[p];
}

async function getApiKey(provider: AdvisorProvider): Promise<string | null> {
  const stored = await getSetting(PROVIDER_KEY_SETTING[provider]);
  if (stored) return stored;
  const fromEnv = process.env[PROVIDER_ENV[provider]];
  return fromEnv ?? null;
}

export type AdvisorClient = {
  provider: AdvisorProvider;
  modelId: string;
  model: LanguageModel;
};

export async function buildAdvisorClient(): Promise<AdvisorClient> {
  const provider = await getAdvisorProvider();
  const modelId = await getAdvisorModelId(provider);
  const apiKey = await getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `No API key configured for ${PROVIDER_LABEL[provider]}. Add one in Settings → Advisor or set ${PROVIDER_ENV[provider]} in your env.`,
    );
  }

  let model: LanguageModel;
  switch (provider) {
    case "anthropic":
      model = createAnthropic({ apiKey })(modelId);
      break;
    case "openai":
      model = createOpenAI({ apiKey })(modelId);
      break;
    case "google":
      model = createGoogleGenerativeAI({ apiKey })(modelId);
      break;
  }
  return { provider, modelId, model };
}

export async function isAdvisorConfigured(): Promise<boolean> {
  const provider = await getAdvisorProvider();
  return (await getApiKey(provider)) != null;
}
