import { Sparkles } from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dimensions =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  const icon = size === "sm" ? 16 : size === "lg" ? 24 : 19;
  return (
    <div
      className={`${dimensions} grid place-items-center rounded-full border border-white/40 bg-ink text-paper shadow-[0_10px_30px_-18px_rgba(31,42,37,0.9)]`}
      aria-hidden="true"
    >
      <Sparkles size={icon} strokeWidth={1.7} />
    </div>
  );
}
