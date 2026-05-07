"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import {
  updateAdvisorKey,
  updateAdvisorModel,
  updateAdvisorProvider,
  updateBaseCurrency,
} from "@/lib/actions/settings";
import { useRole } from "@/components/app/role-context";
import {
  ADVISOR_PROVIDERS,
  DEFAULT_MODEL,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
  PROVIDER_MODELS,
  isKnownModel,
  type AdvisorProvider,
} from "@/lib/ai/providers";

export function BaseCurrencyForm({ current }: { current: string }) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateBaseCurrency(fd);
            toast.success("Base currency updated.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed.");
          }
        })
      }
      className="space-y-3"
    >
      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="base_currency">Currency</Label>
        <Select name="base_currency" defaultValue={current}>
          <SelectTrigger id="base_currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

const PROVIDER_HINT: Record<AdvisorProvider, string> = {
  anthropic: "Claude Opus / Sonnet / Haiku. Best for nuanced advice + reasoning.",
  openai: "GPT-4o / GPT-4.1 / GPT-5. Best for structured output + tool use.",
  google: "Gemini 2.0 Flash / 1.5 Pro. Cheap, fast, large context.",
};

export function AdvisorProviderForm({
  current,
  keysSet,
}: {
  current: AdvisorProvider;
  keysSet: Record<AdvisorProvider, boolean>;
}) {
  const role = useRole();
  const [provider, setProvider] = useState<AdvisorProvider>(current);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateAdvisorProvider(fd);
            toast.success(`Provider switched to ${PROVIDER_LABEL[provider]}.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed.");
          }
        })
      }
      className="space-y-3"
    >
      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="advisor_provider">AI provider</Label>
        <Select
          name="advisor_provider"
          value={provider}
          onValueChange={(v) => setProvider(v as AdvisorProvider)}
        >
          <SelectTrigger id="advisor_provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADVISOR_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                <span className="flex items-center gap-2">
                  {PROVIDER_LABEL[p]}
                  {keysSet[p] ? (
                    <span className="text-[10px] text-emerald-300">●</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">○</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PROVIDER_HINT[provider]}</p>
      </div>
      <Button type="submit" disabled={pending || provider === current}>
        {pending ? "Saving…" : "Switch provider"}
      </Button>
    </form>
  );
}

export function AdvisorKeyForm({
  provider,
  keySet,
}: {
  provider: AdvisorProvider;
  keySet: boolean;
}) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;

  const placeholders: Record<AdvisorProvider, string> = {
    anthropic: keySet
      ? "•••• stored — paste a new key to replace"
      : "sk-ant-…",
    openai: keySet ? "•••• stored — paste a new key to replace" : "sk-…",
    google: keySet ? "•••• stored — paste a new key to replace" : "AIza…",
  };

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateAdvisorKey(fd);
            toast.success(`${PROVIDER_LABEL[provider]} key saved.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed.");
          }
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="provider" value={provider} />
      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="api_key">{PROVIDER_LABEL[provider]} API key</Label>
        <Input
          id="api_key"
          name="api_key"
          type="password"
          placeholder={placeholders[provider]}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Stored in your local SQLite. Sent only to{" "}
          {PROVIDER_LABEL[provider].split(" ")[0]} when the advisor runs.{" "}
          <a
            href={PROVIDER_KEY_URL[provider]}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Get a key →
          </a>
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : keySet ? "Replace" : "Save"}
      </Button>
    </form>
  );
}

const CUSTOM_MODEL_VALUE = "__custom__";

export function AdvisorModelForm({
  current,
  provider,
}: {
  current: string;
  provider: AdvisorProvider;
}) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  const known = isKnownModel(provider, current);
  // If the stored model is unknown for this provider, treat it as custom and
  // surface a text input pre-filled with the value.
  const initialSelection = known ? current : CUSTOM_MODEL_VALUE;
  const initialCustom = known ? "" : current;
  const [selection, setSelection] = useState<string>(initialSelection);
  const [customId, setCustomId] = useState<string>(initialCustom);

  if (role === "viewer") return null;

  const isCustom = selection === CUSTOM_MODEL_VALUE;
  const submittedValue = isCustom ? customId.trim() : selection;
  const models = PROVIDER_MODELS[provider];
  const providerName = PROVIDER_LABEL[provider].split(" ")[0];

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateAdvisorModel(fd);
            toast.success("Advisor model updated.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed.");
          }
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="advisor_model" value={submittedValue} />

      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="model_select">Model</Label>
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger id="model_select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col items-start">
                  <span>{m.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.id} · {m.hint}
                  </span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_MODEL_VALUE}>
              <div className="flex flex-col items-start">
                <span>Other model ID…</span>
                <span className="text-[10px] text-muted-foreground">
                  Paste any native {providerName} model id
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        {!isCustom ? (
          <p className="text-[11px] text-muted-foreground font-mono">
            {selection}
          </p>
        ) : null}
      </div>

      {isCustom ? (
        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="custom_model_id">Custom model id</Label>
          <Input
            id="custom_model_id"
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            placeholder={DEFAULT_MODEL[provider]}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Useful for newly released models that aren&apos;t in the dropdown
            yet. Leave blank to fall back to{" "}
            <code className="font-mono">{DEFAULT_MODEL[provider]}</code>.
          </p>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={pending || (isCustom && customId.trim() === "")}
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** Legacy alias — kept so older callers building still works. */
export const AnthropicKeyForm = ({ keySet }: { keySet: boolean }) => (
  <AdvisorKeyForm provider="anthropic" keySet={keySet} />
);
