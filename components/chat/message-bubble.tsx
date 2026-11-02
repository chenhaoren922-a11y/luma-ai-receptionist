"use client";

import { Sparkles } from "lucide-react";

import type { UiBlock } from "@/lib/types";

import { RichBlocks } from "./rich-blocks";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ui?: UiBlock[];
};

export function MessageBubble({
  message,
  onAction,
  onConfirm,
  confirmingDraftId,
}: {
  message: ChatMessage;
  onAction: (message: string) => void;
  onConfirm: (draftId: string) => void;
  confirmingDraftId?: string | null;
}) {
  if (message.role === "user") {
    return (
      <div className="rise-in flex justify-end">
        <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-ink px-4 py-2.5 text-[13px] leading-relaxed text-paper shadow-[0_12px_30px_-20px_rgba(31,42,37,0.9)] sm:max-w-[75%]">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rise-in flex items-start gap-2.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-card text-accent shadow-sm">
        <Sparkles size={14} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 max-w-[88%] sm:max-w-[78%]">
        <div className="rounded-[22px] rounded-tl-md border border-line bg-card/90 px-4 py-3 text-[13px] leading-relaxed text-ink shadow-[0_18px_40px_-32px_rgba(31,42,37,0.55)]">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.ui && message.ui.length > 0 && (
            <RichBlocks
              blocks={message.ui}
              onAction={onAction}
              onConfirm={onConfirm}
              confirmingDraftId={confirmingDraftId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
