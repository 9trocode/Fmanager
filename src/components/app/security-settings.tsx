"use client";

import { useState, useTransition } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  setPanicRedirectUrl,
  setScreenLockTimeout,
} from "@/lib/actions/screen-lock";

const TIMEOUT_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "1 minute" },
  { value: "5", label: "5 minutes" },
  { value: "10", label: "10 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
];

export function SecuritySettings({
  initialIdleMinutes,
  initialPanicUrl,
}: {
  initialIdleMinutes: number;
  initialPanicUrl: string;
}) {
  const [idle, setIdle] = useState<string>(String(initialIdleMinutes ?? 0));
  const [panic, setPanic] = useState(initialPanicUrl ?? "");
  const [pending, startPending] = useTransition();

  function saveIdle(value: string) {
    setIdle(value);
    startPending(async () => {
      try {
        await setScreenLockTimeout(Number(value) || 0);
        toast.success(
          Number(value) === 0
            ? "Idle screen lock disabled."
            : `Screen will lock after ${value} minute${value === "1" ? "" : "s"} idle.`,
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't save timeout.",
        );
      }
    });
  }

  function savePanic() {
    startPending(async () => {
      try {
        await setPanicRedirectUrl(panic);
        toast.success(
          panic.trim()
            ? `Panic will redirect to ${panic.trim()}`
            : "Panic redirect cleared. Defaults to /login.",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't save panic URL.",
        );
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            Screen lock
          </CardTitle>
          <CardDescription>
            Hide every page behind a password prompt after a period of
            no activity. Your session stays signed in — the lock is a
            UI-side defensive layer for when you step away from your
            machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="idle-timeout">Lock after idle</Label>
            <Select value={idle} onValueChange={saveIdle} disabled={pending}>
              <SelectTrigger id="idle-timeout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            You can also lock manually via the lock icon in the sidebar
            footer or with{" "}
            <kbd className="font-mono text-[10px] bg-secondary px-1 rounded">
              ⌘⇧L
            </kbd>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" />
            Panic mode
          </CardTitle>
          <CardDescription>
            One-click sign-out + redirect to a benign destination. Use
            the panic icon in the sidebar or{" "}
            <kbd className="font-mono text-[10px] bg-secondary px-1 rounded">
              ⌘⇧P
            </kbd>{" "}
            when someone walks up. The session is destroyed; you&apos;ll
            need to sign in again to come back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="panic-url">Redirect to</Label>
            <div className="flex items-center gap-2">
              <Input
                id="panic-url"
                value={panic}
                onChange={(e) => setPanic(e.target.value)}
                placeholder="https://google.com"
                disabled={pending}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={savePanic}
                disabled={pending}
              >
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Leave empty to use the login page (
              <span className="font-mono">/login</span>). Absolute URLs and
              same-origin paths both work.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
