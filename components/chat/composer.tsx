"use client";

import { ArrowUp } from "lucide-react";
import { useRef } from "react";

export function Composer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!value.trim() || disabled) return;
    onSend();
    if (ref.current) ref.current.style.height = "auto";
  }

  return (
    <div className="border-t border-line bg-card/70 px-3 py-3 backdrop-blur sm:px-5 sm:py-4">
      <div className="flex items-end gap-2 rounded-[22px] border border-line bg-paper/70 p-1.5 pl-3 transition focus-within:border-accent/45 focus-within:bg-card">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder="Ask about services, times, or your appointment…"
          onChange={(event) => {
            onChange(event.target.value);
            const element = event.currentTarget;
            element.style.height = "auto";
            element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-[120px] min-h-[34px] flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted/70 disabled:opacity-60"
          aria-label="Message"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          aria-label="Send message"
        >
          <ArrowUp size={16} strokeWidth={2.2} />
        </button>
      </div>
      <p className="mt-2 px-1 text-center text-[10px] leading-relaxed text-muted">
        Luma can make mistakes. For urgent changes, call the studio.
      </p>
    </div>
  );
}
