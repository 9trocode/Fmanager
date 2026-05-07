"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  History,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createChatSession,
  deleteChatSession,
  type ChatSessionRow,
} from "@/lib/actions/chat";

/**
 * Streaming agent UI with persisted multi-session history.
 *
 * Sessions live in the DB. The active one is keyed by ?s=<id> in the
 * URL — the server component reads that, hydrates `initialMessages` from
 * SQLite, and we feed them into useChat. On first send (when there's no
 * session yet), we lazily create one via a server action and replace
 * the URL so subsequent sends persist into the same thread.
 *
 * "Resumable" in this app means: refresh the page mid-conversation and
 * everything you've sent + every assistant turn that completed comes
 * back. The current in-flight stream itself isn't piped across requests
 * (that needs a stream-store like Redis); if you refresh while the
 * model is still typing, you can ask it to continue.
 */
export function AdvisorChat({
  sessionId: initialSessionId,
  initialMessages,
  sessions,
}: {
  sessionId: number | null;
  initialMessages: UIMessage[];
  sessions: ChatSessionRow[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Live session id (mutable when we lazily create a session on first
  // send). Mirrors `?s=<id>` in the URL.
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);

  const { messages, status, error, sendMessage, setMessages, stop } = useChat({
    messages: initialMessages,
    // `id` keys the chat — switching it makes useChat treat it as a new
    // thread (clears in-memory state). We pass our DB session id so
    // navigating between threads via the history menu is clean.
    id: sessionId ? `session-${sessionId}` : undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Forward the active sessionId on every request so the API route
      // can persist messages to the right thread.
      body: () => ({ sessionId }),
    }),
  });

  // Auto-scroll to the bottom whenever messages stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isStreaming = status === "streaming" || status === "submitted";
  const canSend = !isStreaming && (text.trim().length > 0 || (files?.length ?? 0) > 0);

  function startNewChat() {
    startTransition(async () => {
      const id = await createChatSession();
      setSessionId(id);
      setMessages([]);
      router.replace(`/advisor?s=${id}`);
      router.refresh();
    });
  }

  function switchSession(id: number) {
    if (id === sessionId) return;
    router.push(`/advisor?s=${id}`);
  }

  function deleteSession(id: number) {
    startTransition(async () => {
      try {
        await deleteChatSession(id);
        toast.success("Conversation deleted");
        // If we deleted the active one, fall back to the next available
        // or to a brand-new empty state.
        if (id === sessionId) {
          const next = sessions.find((s) => s.id !== id);
          if (next) {
            router.push(`/advisor?s=${next.id}`);
          } else {
            setSessionId(null);
            setMessages([]);
            router.replace("/advisor");
            router.refresh();
          }
        } else {
          router.refresh();
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't delete conversation.",
        );
      } finally {
        setConfirmDelete(null);
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    // Lazy-create a session on first send so empty threads don't clutter
    // the history.
    let activeId = sessionId;
    if (activeId == null) {
      activeId = await createChatSession();
      setSessionId(activeId);
      // Replace the URL silently — no full navigation, no flash.
      window.history.replaceState({}, "", `/advisor?s=${activeId}`);
    }

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
    // Refresh the server-rendered sessions list so the new title shows
    // in the history menu after the assistant turn finishes.
    setTimeout(() => router.refresh(), 1500);
  }

  const activeSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/40 backdrop-blur-md gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Sparkles className="size-3.5 shrink-0" />
          <span className="truncate">
            {activeSession?.title ?? "New conversation"}
          </span>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono shrink-0">
              <Loader2 className="size-3 animate-spin" />
              thinking…
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground">
                <History className="size-3.5" />
                History
                <span className="text-[10px] font-mono opacity-70 ml-1">
                  {sessions.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-[60vh] overflow-y-auto">
              <DropdownMenuLabel>Conversations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sessions.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No past conversations yet.
                </div>
              ) : (
                sessions.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      switchSession(s.id);
                      setHistoryOpen(false);
                    }}
                    className="group flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          "text-sm truncate " +
                          (s.id === sessionId ? "font-medium" : "")
                        }
                      >
                        {s.title}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {new Date(s.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConfirmDelete(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="xs"
            onClick={startNewChat}
            className="text-muted-foreground"
          >
            <MessageSquarePlus className="size-3.5" />
            New
          </Button>
        </div>
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

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The thread and all of its messages are gone permanently. This
              doesn&apos;t affect any data the advisor created on your behalf
              (transactions, budgets, accounts) — those stay in your books.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete != null) deleteSession(confirmDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
