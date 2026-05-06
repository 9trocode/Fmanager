"use client";

import { useTransition } from "react";
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
  updateAdvisorModel,
  updateAnthropicKey,
  updateBaseCurrency,
} from "@/lib/actions/settings";
import { useRole } from "@/components/app/role-context";

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

export function AnthropicKeyForm({ keySet }: { keySet: boolean }) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            await updateAnthropicKey(fd);
            toast.success("Anthropic key saved.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed.");
          }
        })
      }
      className="space-y-3"
    >
      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="anthropic_api_key">API key</Label>
        <Input
          id="anthropic_api_key"
          name="anthropic_api_key"
          type="password"
          placeholder={keySet ? "•••• stored — paste a new key to replace" : "sk-ant-..."}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Stored in your local SQLite. Sent only to Anthropic when the advisor runs.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : keySet ? "Replace" : "Save"}
      </Button>
    </form>
  );
}

export function AdvisorModelForm({ current }: { current: string }) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
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
      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="advisor_model">Model ID</Label>
        <Input
          id="advisor_model"
          name="advisor_model"
          defaultValue={current}
          placeholder="claude-sonnet-4-6"
        />
        <p className="text-xs text-muted-foreground">
          Native Anthropic model ID. Sonnet is the right default for advisor use.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
