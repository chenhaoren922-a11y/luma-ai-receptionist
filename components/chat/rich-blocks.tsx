"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  MapPin,
  Phone,
  Sparkles,
  UserRound,
  XCircle,
} from "lucide-react";

import type {
  AppointmentSummary,
  DraftSummary,
  ServiceSummary,
  UiBlock,
} from "@/lib/types";

import { formatDateLabel, formatMoney } from "./format";

type Action = (message: string) => void;

export function RichBlocks({
  blocks,
  onAction,
  onConfirm,
  confirmingDraftId,
}: {
  blocks: UiBlock[];
  onAction: Action;
  onConfirm: (draftId: string) => void;
  confirmingDraftId?: string | null;
}) {
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "services":
            return <ServicesBlock key={index} services={block.services} onAction={onAction} />;
          case "slots":
            return (
              <SlotsBlock
                key={index}
                date={block.date}
                timezone={block.timezone}
                slots={block.slots}
                onAction={onAction}
              />
            );
          case "draft":
            return (
              <DraftBlock
                key={index}
                draft={block.draft}
                onConfirm={onConfirm}
                confirming={confirmingDraftId === block.draft.draftId}
                onAction={onAction}
              />
            );
          case "booking":
            return <BookingBlock key={index} appointment={block.appointment} />;
          case "appointments":
            return <AppointmentsBlock key={index} appointments={block.appointments} />;
          case "handoff":
            return <HandoffBlock key={index} phone={block.phone} reason={block.reason} />;
          case "error":
            return <p key={index} className="text-[12px] text-accent-dark">{block.message}</p>;
          default:
            return null;
        }
      })}
    </div>
  );
}

function ServicesBlock({
  services,
  onAction,
}: {
  services: ServiceSummary[];
  onAction: Action;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {services.map((service) => (
        <div
          key={service.id}
          className="group rounded-2xl border border-line bg-card/80 p-3.5 transition hover:border-accent/40 hover:bg-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: service.color }}
              />
              <div>
                <p className="text-[13px] font-semibold leading-snug text-ink">
                  {service.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {service.durationMin} min · {formatMoney(service.priceCents, service.currency)}
                </p>
              </div>
            </div>
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent/60" />
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted">
            {service.description}
          </p>
          <button
            type="button"
            onClick={() => onAction(`I'd like to book the ${service.name}`)}
            className="focus-ring mt-3 inline-flex items-center gap-1 rounded-full border border-line bg-paper/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft transition hover:border-accent/40 hover:text-accent"
          >
            Check times
          </button>
        </div>
      ))}
    </div>
  );
}

function SlotsBlock({
  date,
  timezone,
  slots,
  onAction,
}: {
  date: string;
  timezone: string;
  slots: Array<{ startAt: string; label: string; staffNames: string[] }>;
  onAction: Action;
}) {
  if (!slots.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-card/80 p-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        <CalendarDays size={13} />
        {formatDateLabel(date, timezone)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {slots.map((slot) => (
          <button
            key={slot.startAt}
            type="button"
            onClick={() => onAction(`I'll take ${slot.label}`)}
            className="focus-ring group rounded-xl border border-line bg-paper/50 px-3 py-2 text-left transition hover:border-accent/50 hover:bg-accent-soft/40"
          >
            <span className="block text-[12px] font-semibold text-ink">{slot.label}</span>
            {slot.staffNames.length > 0 && (
              <span className="mt-0.5 block text-[10px] text-muted">
                with {slot.staffNames.slice(0, 2).join(" or ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function DraftBlock({
  draft,
  onConfirm,
  confirming,
  onAction,
}: {
  draft: DraftSummary;
  onConfirm: (draftId: string) => void;
  confirming: boolean;
  onAction: Action;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-accent/25 bg-accent-soft/30">
      <div className="flex items-start justify-between gap-3 border-b border-accent/15 bg-card/50 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-dark">
            Review your booking
          </p>
          <p className="mt-1 font-display text-[19px] leading-tight text-ink">
            {draft.serviceName}
          </p>
        </div>
        <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold text-ink-soft">
          {formatMoney(draft.priceCents, draft.currency)}
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-[12px] text-ink-soft">
        <Detail icon={<Clock3 size={13} />} value={`${draft.startLocal} – ${draft.endLocal}`} />
        <Detail icon={<UserRound size={13} />} value={`${draft.staffName} · ${draft.durationMin} min`} />
        <Detail icon={<MapPin size={13} />} value={draft.address} />
        <Detail icon={<Phone size={13} />} value={`${draft.customerName} · ${draft.phone}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-accent/15 px-4 py-3">
        <button
          type="button"
          disabled={confirming}
          onClick={() => onConfirm(draft.draftId)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[11px] font-semibold text-paper transition hover:bg-ink-soft disabled:cursor-wait disabled:opacity-60"
        >
          <Check size={13} />
          {confirming ? "Confirming…" : "Confirm booking"}
        </button>
        <button
          type="button"
          onClick={() => onAction("I'd like a different time")}
          className="focus-ring rounded-full border border-line bg-card/70 px-3 py-2 text-[11px] font-medium text-ink-soft transition hover:border-accent/40"
        >
          Choose another time
        </button>
      </div>
    </div>
  );
}

function BookingBlock({ appointment }: { appointment: AppointmentSummary }) {
  const cancelled = appointment.status === "cancelled";
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        cancelled ? "border-line bg-card/60" : "border-sage/35 bg-sage-soft/35"
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-start gap-2.5">
          {cancelled ? (
            <XCircle size={18} className="mt-0.5 text-muted" />
          ) : (
            <CheckCircle2 size={18} className="mt-0.5 text-sage" />
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {cancelled ? "Cancelled" : "Confirmed appointment"}
            </p>
            <p className="mt-1 font-display text-[19px] leading-tight text-ink">
              {appointment.serviceName}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-line bg-card/80 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-ink-soft">
          {appointment.code}
        </span>
      </div>
      <div className="space-y-2 px-4 pb-3 text-[12px] text-ink-soft">
        <Detail icon={<CalendarDays size={13} />} value={`${appointment.startLocal} – ${appointment.endLocal}`} />
        <Detail icon={<UserRound size={13} />} value={appointment.staffName} />
        <Detail icon={<MapPin size={13} />} value={appointment.address} />
      </div>
      {!cancelled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-sage/20 px-4 py-3">
          <a
            href={appointment.code ? `/api/ics/${appointment.code}` : "#"}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[11px] font-semibold text-paper transition hover:bg-ink-soft"
          >
            <Download size={13} />
            Add to calendar
          </a>
          <span className="text-[10px] text-muted">
            {appointment.syncStatus === "synced" ? "Synced to studio calendar" : "Saved to studio schedule"}
          </span>
        </div>
      )}
    </div>
  );
}

function AppointmentsBlock({ appointments }: { appointments: AppointmentSummary[] }) {
  return (
    <div className="space-y-2">
      {appointments.map((appointment) => (
        <div
          key={appointment.id}
          className="rounded-2xl border border-line bg-card/80 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-ink">{appointment.serviceName}</p>
            <span className="font-mono text-[10px] text-muted">{appointment.code}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            {appointment.startLocal} – {appointment.endLocal}
          </p>
          <p className="text-[11px] text-muted">
            {appointment.staffName} · {appointment.status}
          </p>
        </div>
      ))}
    </div>
  );
}

function HandoffBlock({ phone, reason }: { phone: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/25 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-dark">
        A person will help
      </p>
      <p className="mt-1 text-[12px] text-ink-soft">{reason}</p>
      <a
        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
        className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper"
      >
        <Phone size={12} />
        {phone}
      </a>
    </div>
  );
}

function Detail({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <p className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span>{value}</span>
    </p>
  );
}
