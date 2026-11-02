import { Sparkles } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="rise-in flex items-start gap-2.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-card text-accent shadow-sm">
        <Sparkles size={14} strokeWidth={1.8} />
      </span>
      <div className="flex items-center gap-2 rounded-[22px] rounded-tl-md border border-line bg-card/90 px-4 py-3">
        <span className="flex items-center gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent [animation-delay:150ms]" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent [animation-delay:300ms]" />
        </span>
        <span className="text-[11px] text-muted">Luma is checking…</span>
      </div>
    </div>
  );
}
