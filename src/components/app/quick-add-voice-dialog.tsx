"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, MicOff, Wand2 } from "lucide-react";
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

// Minimal subset of the Web Speech API we use.
type SREvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>> & {
    [index: number]: ArrayLike<{ transcript: string }> & {
      isFinal?: boolean;
      [index: number]: { transcript: string };
    };
  };
};
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SREvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SRCtor = new () => SR;

function getSpeechRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "recording"; transcript: string }
  | { kind: "parsing"; transcript: string }
  | { kind: "ready"; transcript: string; parsed: ParsedSuggestion }
  | { kind: "error"; message: string; transcript?: string };

export function QuickAddVoiceDialog({
  accounts,
  trigger,
}: {
  accounts: TransactionAccountOption[];
  trigger?: React.ReactNode;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Detect Web Speech API support without triggering hydration warnings: the
  // server snapshot is `null`, the client snapshot is the real value.
  const supported = useSyncExternalStore(
    () => () => {},
    () => getSpeechRecognitionCtor() !== null,
    () => null,
  );
  const [manualText, setManualText] = useState("");
  const recognitionRef = useRef<SR | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  if (role === "viewer") return null;

  function reset() {
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setPhase({ kind: "idle" });
    setManualText("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function startRecording() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setPhase({
        kind: "error",
        message:
          "Speech recognition isn't available in this browser. Type the description below instead.",
      });
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let finalTranscript = "";

    rec.onresult = (event) => {
      let interim = "";
      const len = event.results.length;
      for (let i = 0; i < len; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        const text = alt.transcript ?? "";
        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interim += text;
        }
      }
      const combined = (finalTranscript + " " + interim).trim();
      setPhase({ kind: "recording", transcript: combined });
    };

    rec.onerror = (event) => {
      setPhase({
        kind: "error",
        message: event.error
          ? `Speech recognition error: ${event.error}`
          : "Speech recognition error.",
        transcript: finalTranscript.trim() || undefined,
      });
      recognitionRef.current = null;
    };

    rec.onend = () => {
      // Only auto-parse if we still hold this recognizer (user pressed stop).
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      const transcript = finalTranscript.trim();
      if (!transcript) {
        setPhase({
          kind: "error",
          message: "No speech captured. Try again or type the description.",
        });
        return;
      }
      void parseTranscript(transcript);
    };

    recognitionRef.current = rec;
    setPhase({ kind: "recording", transcript: "" });
    try {
      rec.start();
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not start recording.",
      });
      recognitionRef.current = null;
    }
  }

  function stopRecording() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore — onend will still fire if it can.
    }
  }

  async function parseTranscript(transcript: string) {
    setPhase({ kind: "parsing", transcript });
    try {
      const res = await fetch("/api/parse-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Parse failed (${res.status})`);
      }
      const parsed = (await res.json()) as ParsedSuggestion;
      setPhase({ kind: "ready", transcript, parsed });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Parse failed.",
        transcript,
      });
    }
  }

  function handleManualParse() {
    const t = manualText.trim();
    if (!t) return;
    void parseTranscript(t);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Mic className="size-4" />
            Voice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Voice transaction</DialogTitle>
          <DialogDescription>
            Describe the transaction in plain language — e.g. &ldquo;Spent
            ₦12,000 on dinner with Tunde yesterday.&rdquo; Claude will pre-fill
            a transaction for you to review.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "idle" ? (
          <div className="space-y-3">
            {supported ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-12 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <Mic className="size-8" />
                <span className="font-medium text-foreground">
                  Start recording
                </span>
                <span className="text-xs">
                  Tap to record, then tap stop when you&apos;re done.
                </span>
              </button>
            ) : (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                Speech recognition isn&apos;t supported in this browser
                (Firefox doesn&apos;t support the Web Speech API). Type the
                description below instead.
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="manual-transcript"
                className="text-xs font-medium text-muted-foreground"
              >
                Or type it
              </label>
              <textarea
                id="manual-transcript"
                rows={3}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Spent $42 on groceries at Whole Foods yesterday."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleManualParse}
                  disabled={!manualText.trim()}
                >
                  <Wand2 className="size-4" />
                  Parse
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {phase.kind === "recording" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-destructive" />
              </span>
              Recording…
            </div>
            <div className="min-h-16 rounded-md border border-border bg-muted/30 p-3 text-sm">
              {phase.transcript || (
                <span className="text-muted-foreground">
                  Speak now. Your words will appear here.
                </span>
              )}
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={stopRecording}>
                <MicOff className="size-4" />
                Stop &amp; parse
              </Button>
            </div>
          </div>
        ) : null}

        {phase.kind === "parsing" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              {phase.transcript}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Parsing transcript…
            </div>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="space-y-3">
            {phase.transcript ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                {phase.transcript}
              </div>
            ) : null}
            <p className="text-sm text-destructive">{phase.message}</p>
            <Button size="sm" variant="outline" onClick={reset}>
              Start over
            </Button>
          </div>
        ) : null}

        {phase.kind === "ready" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Heard:</span>{" "}
              {phase.transcript}
            </div>
            <QuickAddPreview
              parsed={phase.parsed}
              accounts={accounts}
              onSubmitted={() => handleOpenChange(false)}
              defaultKind={phase.parsed.kind ?? "expense"}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
