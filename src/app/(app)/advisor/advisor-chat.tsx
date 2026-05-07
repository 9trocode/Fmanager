"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "advisor-chat-history";

/**
 * The advisor chat is a streaming agent. The model sees the user's full
 * balance sheet in its system prompt and can call tools to actually
 * create transactions, budgets, savings goals, accounts, and recurring
 * flows on behalf of the user. It can also accept image uploads
 * (receipts, statements) and extract numbers from them.
 *
 * UI features:
 *   - Streaming text from the model (incremental render).
 *   - Multimodal input: images alongside text.
 *   - Tool-call rendering — when the model calls a tool, we show what
 *     it ran and the result inline so the user sees exactly what
 *     changed.
 *   - Markdown rendering with remark-gfm (tables, lists, code).
 *   - Conversation persistence via localStorage so refreshing the page
 *     doesn't wipe the thread.
 *   - "Clear" button to start a fresh conversation.
 */
export function AdvisorChat() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate prior conversation from localStorage on mount.
  const [initialMessages, setInitialMessages] = useState<
    UIMessage[] | undefined
  >(undefined);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setInitialMessages(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const { messages, status, error, sendMessage, setMessages, stop } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // Persist on every message change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, hydrated]);

  // Auto-scroll to the bottom whenever messages stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isStreaming = status === "streaming" || status === "submitted";
  const canSend = !isStreaming && (text.trim().length > 0 || (files?.length ?? 0) > 0);

  function clearChat() {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    // Build message parts: optional file attachments + user text.
    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];

    if (files && files.length > 0) {
      for (const f of Array.from(files)) {
        const url = await fileToDataUrl(f);
        parts.push({ type: "file", mediaType: f.type, url });
      }
    }
    if (text.trim()) parts.push({ type: "text", text: text.trim() });

    sendMessage({ role: "user", parts });
    setText("");
    setFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          Advisor
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono">
              <Loader2 className="size-3 animate-spin" />
              thinking…
            </span>
          ) : null}
        </div>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={clearChat}
            className="text-muted-foreground"
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 ? (
          <EmptyHints onPick={(s) => setText(s)} />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {error ? (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
            {error.message ?? "Advisor request failed."}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-3 py-3 space-y-2"
      >
        {files && files.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Array.from(files).map((f) => (
              <div
                key={f.name + f.size}
                className="inline-flex items-center gap-2 rounded-md bg-secondary/60 px-2 py-1 text-[11px]"
              >
                <Paperclip className="size-3 shrink-0" />
                <span className="truncate max-w-[140px]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFiles(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  aria-label="Remove file"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            className="text-muted-foreground"
          >
            <Paperclip className="size-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              isStreaming
                ? "Streaming…"
                : "Ask, or upload a receipt to log a transaction…"
            }
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={stop}
              aria-label="Stop"
            >
              <X className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function EmptyHints({ onPick }: { onPick: (s: string) => void }) {
  const examples = [
    "Should I prioritise the emergency fund or paying down the loan?",
    "Log a NGN 50,000 expense in Groceries today.",
    "Create a budget of NGN 200,000/month for Food.",
    "Set up a recurring NGN 2,000,000 monthly salary into my Checking account.",
  ];
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground py-4 text-center">
        Ask anything about your money — or tell the advisor to do
        something. It can read your balance sheet and write to it.
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {examples.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded-md px-3 py-2 transition-colors bg-secondary/30 hover:bg-secondary/60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type ChatMessage = ReturnType<typeof useChat>["messages"][number];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[88%] rounded-lg px-3.5 py-2 text-sm space-y-2 " +
          (isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-foreground")
        }
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return isUser ? (
              <div key={i} className="whitespace-pre-wrap">
                {part.text}
              </div>
            ) : (
              <div key={i} className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === "file") {
            const isImage = (part.mediaType ?? "").startsWith("image/");
            return isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={part.url}
                alt="attachment"
                className="max-w-full max-h-48 rounded-md border border-border/40"
              />
            ) : (
              <div
                key={i}
                className="text-[11px] font-mono text-muted-foreground"
              >
                attached: {part.mediaType ?? "file"}
              </div>
            );
          }
          // Tool calls in v6 come as parts named "tool-<toolName>".
          if (part.type.startsWith("tool-")) {
            return <ToolPart key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

type ToolPartShape = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolPart({ part }: { part: ToolPartShape }) {
  const name = part.type.replace(/^tool-/, "");
  const state = part.state ?? "input-available";
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px] font-mono space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Wrench className="size-3" />
        <span className="text-foreground">{name}</span>
        <span className="text-[10px]">
          {state === "output-available"
            ? "✓ done"
            : state === "output-error"
              ? "✗ failed"
              : "running…"}
        </span>
      </div>
      {part.errorText ? (
        <div className="text-destructive">{part.errorText}</div>
      ) : null}
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
