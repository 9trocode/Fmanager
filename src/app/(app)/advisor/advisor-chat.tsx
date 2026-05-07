"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = { role: "user" | "assistant"; content: string };

export function AdvisorChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    const text = input.trim();
    if (!text || pending) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const err = await res.text();
        setMessages([
          ...next,
          { role: "assistant", content: `⚠ ${err || "Request failed"}` },
        ]);
        return;
      }
      const data = (await res.json()) as { content: string };
      setMessages([...next, { role: "assistant", content: data.content }]);
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `⚠ ${err instanceof Error ? err.message : "Network error"}`,
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Ask about a decision. Example: <em>&ldquo;Should I exercise my options
            before year-end if my runway is 8 months?&rdquo;</em>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm"
                    : "max-w-[80%] rounded-lg bg-secondary px-3.5 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="border-t border-border px-4 py-3 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the advisor..."
          disabled={pending}
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending || !input.trim()}
          loading={pending}
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
