"use client";

const PROMPTS = [
  "What services do you offer?",
  "Do you have anything tomorrow afternoon?",
  "Where are you located?",
  "I need to change my appointment",
];

export function QuickPrompts({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:overflow-visible sm:px-6">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="focus-ring shrink-0 rounded-full border border-line bg-card/70 px-3 py-1.5 text-[11px] font-medium text-ink-soft transition hover:border-accent/40 hover:bg-card hover:text-accent"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
