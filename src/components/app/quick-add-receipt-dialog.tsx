"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  QuickAddPreview,
  type ParsedSuggestion,
} from "@/components/app/quick-add-preview";
import { useRole } from "@/components/app/role-context";
import type { TransactionAccountOption } from "@/components/app/transaction-form-fields";

type Phase =
  | { kind: "idle" }
  | { kind: "extracting"; previewUrl: string }
  | { kind: "ready"; previewUrl: string; parsed: ParsedSuggestion }
  | { kind: "error"; message: string; previewUrl?: string };

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // Convert to base64 in chunks to avoid call-stack issues on large images.
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function QuickAddReceiptDialog({
  accounts,
  trigger,
}: {
  accounts: TransactionAccountOption[];
  trigger?: React.ReactNode;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (role === "viewer") return null;

  function reset() {
    if (phase.kind !== "idle" && "previewUrl" in phase && phase.previewUrl) {
      URL.revokeObjectURL(phase.previewUrl);
    }
    setPhase({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setPhase({ kind: "error", message: "Please select an image file." });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPhase({ kind: "extracting", previewUrl });
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/extract-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Extraction failed (${res.status})`);
      }
      const parsed = (await res.json()) as ParsedSuggestion;
      setPhase({ kind: "ready", previewUrl, parsed });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Extraction failed.",
        previewUrl,
      });
    }
  }

  function onChoose() {
    fileInputRef.current?.click();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ScanLine className="size-4" />
            Scan receipt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan a receipt</DialogTitle>
          <DialogDescription>
            Take or upload a photo. Claude will read it and pre-fill a
            transaction for you to review before saving.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />

        {phase.kind === "idle" ? (
          <button
            type="button"
            onClick={onChoose}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-12 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Camera className="size-8" />
            <span className="font-medium text-foreground">
              Take a photo or upload an image
            </span>
            <span className="text-xs">JPEG, PNG, HEIC — up to a few MB.</span>
          </button>
        ) : null}

        {phase.kind === "extracting" ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={phase.previewUrl}
              alt="Receipt preview"
              className="max-h-48 w-full rounded-md object-contain ring-1 ring-border"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading receipt…
            </div>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="space-y-3">
            {phase.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={phase.previewUrl}
                alt="Receipt preview"
                className="max-h-32 w-full rounded-md object-contain ring-1 ring-border"
              />
            ) : null}
            <p className="text-sm text-destructive">{phase.message}</p>
            <Button size="sm" variant="outline" onClick={reset}>
              Try another image
            </Button>
          </div>
        ) : null}

        {phase.kind === "ready" ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={phase.previewUrl}
              alt="Receipt preview"
              className="max-h-32 w-full rounded-md object-contain ring-1 ring-border"
            />
            <QuickAddPreview
              parsed={phase.parsed}
              accounts={accounts}
              onSubmitted={() => handleOpenChange(false)}
              defaultKind="expense"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
