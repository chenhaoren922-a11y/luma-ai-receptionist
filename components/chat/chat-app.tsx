"use client";

import { ArrowUpRight, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  AppointmentSummary,
  BootstrapResponse,
  ChatResponse,
  UiBlock,
} from "@/lib/types";

import { Logo } from "@/components/ui/logo";
import { BrandPanel } from "./brand-panel";
import { Composer } from "./composer";
import { MessageBubble, type ChatMessage } from "./message-bubble";
import { QuickPrompts } from "./quick-prompts";
import { TypingIndicator } from "./typing-indicator";

const SESSION_KEY = "luma_receptionist_session";

type HistoryResponse = {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    ui?: UiBlock[];
  }>;
};

type ConfirmResponse = {
  appointment: AppointmentSummary;
  googleSynced: boolean;
  message: { id: string; role: "assistant"; content: string } | null;
};

function greeting(bootstrap: BootstrapResponse): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: `Hello — I'm ${bootstrap.business.aiName}, the AI receptionist at ${bootstrap.business.businessName}. I can help you choose a service, find a real opening, or look after an existing appointment. What brings you in?`,
    ui: [{ type: "services", services: bootstrap.services }],
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || "Something went wrong. Please try again.");
  }
  return data;
}

export function ChatApp() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "fallback" | "degraded">("fallback");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/bootstrap", { cache: "no-store" });
        if (!response.ok) throw new Error("The studio is not available right now.");
        const data = (await response.json()) as BootstrapResponse;
        if (cancelled) return;
        setBootstrap(data);
        setMode(data.aiMode);

        const stored = window.localStorage.getItem(SESSION_KEY);
        if (stored) {
          setSessionId(stored);
          try {
            const historyResponse = await fetch(
              `/api/chat/history?sessionId=${encodeURIComponent(stored)}`,
              { cache: "no-store" },
            );
            if (historyResponse.ok) {
              const history = (await historyResponse.json()) as HistoryResponse;
              if (!cancelled && history.messages.length) {
                setMessages(
                  history.messages.map((message) => ({
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    ui: message.ui ?? [],
                  })),
                );
                setHistoryLoaded(true);
                return;
              }
            }
          } catch {
            // Fall through to the welcome message.
          }
        }
        if (!cancelled) {
          setMessages([greeting(data)]);
          setHistoryLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "The studio is not available.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const hasUserMessage = messages.some((message) => message.role === "user");
    if (!hasUserMessage) {
      element.scrollTo({ top: 0 });
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages, sending, confirmingDraftId]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || !bootstrap) return;
    setInput("");
    setSending(true);
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await postJson<ChatResponse>("/api/chat", {
        sessionId: sessionId ?? undefined,
        message: trimmed,
      });
      setSessionId(response.sessionId);
      window.localStorage.setItem(SESSION_KEY, response.sessionId);
      setMode(response.mode);
      setMessages((current) => [
        ...current,
        {
          id: response.message.id,
          role: "assistant",
          content: response.message.content,
          ui: response.message.ui ?? [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I couldn't complete that just now. Please try again or call the studio.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function confirmBooking(draftId: string) {
    if (confirmingDraftId) return;
    setConfirmingDraftId(draftId);
    try {
      const response = await postJson<ConfirmResponse>("/api/bookings/confirm", { draftId });
      setMessages((current) => [
        ...current,
        {
          id: response.message?.id ?? `local-booking-${Date.now()}`,
          role: "assistant",
          content:
            response.message?.content ??
            `You're booked. Your booking code is ${response.appointment.code}.`,
          ui: [
            {
              type: "booking",
              appointment: response.appointment,
              icsUrl: `/api/ics/${response.appointment.code}`,
            },
          ],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `local-confirm-error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "I couldn't confirm that booking. Please try again.",
        },
      ]);
    } finally {
      setConfirmingDraftId(null);
    }
  }

  function startNewChat() {
    window.localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setConfirmingDraftId(null);
    if (bootstrap) setMessages([greeting(bootstrap)]);
  }

  if (loadError) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        <div className="paper-card max-w-md rounded-3xl p-8 text-center">
          <Logo size="lg" />
          <h1 className="mt-4 font-display text-2xl">The studio is taking a moment.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="focus-ring mt-5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!bootstrap || !historyLoaded) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Opening the studio…
        </div>
      </div>
    );
  }

  const hasUserMessage = messages.some((message) => message.role === "user");

  return (
    <div className="min-h-[100dvh] px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
      <div className="mx-auto flex max-w-[1360px] gap-7">
        <BrandPanel
          business={bootstrap.business}
          staff={bootstrap.staff}
          serviceCount={bootstrap.services.length}
        />

        <main className="paper-card relative flex h-[calc(100dvh-1.5rem)] min-h-[620px] flex-1 flex-col overflow-hidden rounded-[28px] sm:h-[calc(100dvh-2.5rem)] lg:h-[calc(100dvh-3.5rem)]">
          <header className="z-10 flex items-center justify-between gap-3 border-b border-line bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo size="sm" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-display text-[19px] leading-none text-ink">
                    {bootstrap.business.businessName}
                  </p>
                  <span className="hidden rounded-full border border-sage/30 bg-sage-soft/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sage sm:inline">
                    AI receptionist
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                  Online · replies in a moment
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {mode !== "live" && (
                <span className="hidden rounded-full border border-accent/25 bg-accent-soft/40 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-dark sm:inline">
                  Demo mode
                </span>
              )}
              <button
                type="button"
                onClick={startNewChat}
                className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
                aria-label="Start a new conversation"
                title="New conversation"
              >
                <RotateCcw size={14} />
              </button>
              <a
                href="/admin"
                className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-paper hover:text-ink lg:hidden"
                aria-label="Studio admin"
              >
                <Settings2 size={14} />
              </a>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="chat-scroll chat-surface grain flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-[720px] flex-col gap-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onAction={send}
                  onConfirm={confirmBooking}
                  confirmingDraftId={confirmingDraftId}
                />
              ))}
              {sending && <TypingIndicator />}
            </div>
          </div>

          {!hasUserMessage && (
            <QuickPrompts onSelect={send} />
          )}

          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void send(input)}
            disabled={sending}
          />
        </main>
      </div>

      <div className="mx-auto mt-3 hidden max-w-[1360px] items-center justify-between px-2 text-[10px] text-muted lg:flex lg:pl-[335px]">
        <span>
          {bootstrap.business.address} · {bootstrap.business.phone}
        </span>
        <a
          href="/admin"
          className="focus-ring hidden items-center gap-1 rounded transition hover:text-accent lg:inline-flex"
        >
          Studio login <ArrowUpRight size={10} />
        </a>
      </div>
    </div>
  );
}
