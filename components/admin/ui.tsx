"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card/80 p-4 shadow-[0_18px_40px_-36px_rgba(31,42,37,0.45)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[24px] leading-tight text-ink">{title}</h2>
        {description && <p className="mt-1 text-[12px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  type = "button",
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-ink text-paper hover:bg-ink-soft"
      : variant === "secondary"
        ? "border border-line bg-card text-ink-soft hover:border-accent/40 hover:text-accent"
        : variant === "danger"
          ? "border border-accent/30 bg-accent-soft/40 text-accent-dark hover:bg-accent-soft"
          : "text-muted hover:bg-paper hover:text-ink";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-paper/50 px-3 py-2 text-[12px] text-ink outline-none transition focus:border-accent/50 focus:bg-card";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputClass} min-h-[76px] resize-y ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative h-5 w-9 rounded-full transition ${
          checked ? "bg-sage" : "bg-line"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      {label}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-paper p-5 shadow-2xl sm:rounded-3xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-[22px] text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-card hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const styles =
    tone === "success"
      ? "bg-sage-soft/60 text-sage border-sage/25"
      : tone === "warning"
        ? "bg-accent-soft/50 text-accent-dark border-accent/25"
        : tone === "danger"
          ? "bg-accent-soft/70 text-accent-dark border-accent/30"
          : "bg-paper text-muted border-line";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${styles}`}
    >
      {children}
    </span>
  );
}
