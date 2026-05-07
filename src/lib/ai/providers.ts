// Client-safe constants. No server-only imports here so this can be pulled
// into "use client" components (settings forms, advisor badges).

export const ADVISOR_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type AdvisorProvider = (typeof ADVISOR_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<AdvisorProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

export type ModelOption = {
  id: string;
  label: string;
  hint: string;
};

/**
 * Curated list of supported models per provider, surfaced in the Settings
 * Advisor model dropdown. The first entry of each list is the default.
 *
 * Add new model IDs as providers release them. Users can also paste any
 * native model ID via the "Other model ID" custom input as an escape hatch.
 */
export const PROVIDER_MODELS: Record<AdvisorProvider, ModelOption[]> = {
  anthropic: [
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      hint: "Balanced — recommended",
    },
    {
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      hint: "Most capable · slowest · most expensive",
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      hint: "Fast and cheap",
    },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o", hint: "Balanced — recommended" },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      hint: "Fast and cheap",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      hint: "Long context · structured output",
    },
    {
      id: "o3-mini",
      label: "o3-mini",
      hint: "Reasoning model · slower · stronger on logic",
    },
  ],
  google: [
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      hint: "Balanced — recommended",
    },
    {
      id: "gemini-2.0-flash-lite",
      label: "Gemini 2.0 Flash Lite",
      hint: "Cheapest · smallest",
    },
    {
      id: "gemini-1.5-pro",
      label: "Gemini 1.5 Pro",
      hint: "1M-token context",
    },
  ],
};

/** Sensible default model per provider when the user hasn't set one. */
export const DEFAULT_MODEL: Record<AdvisorProvider, string> = {
  anthropic: PROVIDER_MODELS.anthropic[0].id,
  openai: PROVIDER_MODELS.openai[0].id,
  google: PROVIDER_MODELS.google[0].id,
};

export function isKnownModel(
  provider: AdvisorProvider,
  modelId: string,
): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === modelId);
}

/** Settings key used to store each provider's API key. */
export const PROVIDER_KEY_SETTING: Record<
  AdvisorProvider,
  "anthropic_api_key" | "openai_api_key" | "google_api_key"
> = {
  anthropic: "anthropic_api_key",
  openai: "openai_api_key",
  google: "google_api_key",
};

/** Env var that's checked as a fallback if the DB key is empty. */
export const PROVIDER_ENV: Record<AdvisorProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Marketing URL for "where do I get a key" — surfaced in Settings UI. */
export const PROVIDER_KEY_URL: Record<AdvisorProvider, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/app/apikey",
};

export function isProvider(value: unknown): value is AdvisorProvider {
  return (
    typeof value === "string" &&
    (ADVISOR_PROVIDERS as readonly string[]).includes(value)
  );
}
