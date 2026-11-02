"use client";

import { MessageSquare, PhoneCall } from "lucide-react";
import { useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";

import { Card, SectionTitle, StatusPill } from "./ui";

type ConversationDetail = {
  conversation: {
    id: string;
    status: string;
    customerName: string;
    phone: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
};

export function ConversationsTab({ overview }: { overview: AdminOverview }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(id: string) {
    setSelected(id);
    setLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/admin/conversations?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = (await response.json()) as ConversationDetail;
      if (response.ok) setDetail(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Conversations"
        description="What customers asked, and what Luma said. Handoffs are marked for follow-up."
      />

      {overview.handoffs.length > 0 && (
        <div className="rounded-2xl border border-accent/25 bg-accent-soft/30 px-4 py-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-accent-dark">
            <PhoneCall size={13} />
            {overview.handoffs.length} open handoff{overview.handoffs.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[11px] text-ink-soft">
            {overview.handoffs
              .slice(0, 3)
              .map((handoff) => handoff.reason)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card className="p-0">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Recent
            </p>
          </div>
          {overview.conversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageSquare size={20} className="mx-auto text-muted" />
              <p className="mt-2 text-[11px] text-muted">No conversations yet.</p>
            </div>
          ) : (
            <div className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {overview.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void open(conversation.id)}
                  className={`focus-ring block w-full px-4 py-3 text-left transition ${
                    selected === conversation.id ? "bg-accent-soft/25" : "hover:bg-paper/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-semibold text-ink">
                      {conversation.customerName || "Guest"}
                    </p>
                    {conversation.handoffOpen && <StatusPill tone="warning">handoff</StatusPill>}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted">
                    {conversation.phone || "no phone"} · {conversation.status}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
                    {conversation.lastMessage || "No messages yet."}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          {!selected ? (
            <div className="grid h-full place-items-center py-16 text-center">
              <div>
                <MessageSquare size={22} className="mx-auto text-muted" />
                <p className="mt-2 text-[12px] font-medium text-ink">Select a conversation</p>
                <p className="mt-1 text-[11px] text-muted">
                  The full transcript will appear here.
                </p>
              </div>
            </div>
          ) : loading ? (
            <p className="py-16 text-center text-[11px] text-muted">Loading transcript…</p>
          ) : !detail ? (
            <p className="py-16 text-center text-[11px] text-muted">Could not load this conversation.</p>
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {detail.conversation.customerName || "Guest"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {detail.conversation.phone || "No phone"} · {detail.conversation.status}
                  </p>
                </div>
                <p className="font-mono text-[10px] text-muted">
                  {detail.conversation.id}
                </p>
              </div>
              <div className="chat-scroll mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {detail.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed ${
                        message.role === "user"
                          ? "rounded-br-md bg-ink text-paper"
                          : "rounded-tl-md border border-line bg-paper/60 text-ink-soft"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p
                        className={`mt-1 text-[9px] ${
                          message.role === "user" ? "text-paper/50" : "text-muted"
                        }`}
                      >
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: overview.timezone,
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(message.createdAt))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
