"use client";

import {
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  MessageSquare,
  PhoneCall,
  Scissors,
  Users,
} from "lucide-react";

import type { AdminOverview } from "@/lib/data/admin";

import type { AdminTab } from "./admin-app";
import { Button, Card, SectionTitle, StatusPill } from "./ui";

export function OverviewTab({
  overview,
  onNavigate,
  onGoogleAction,
}: {
  overview: AdminOverview;
  onNavigate: (tab: AdminTab) => void;
  onGoogleAction: (action: "test" | "backfill" | "disconnect") => void;
}) {
  const upcoming = overview.appointments
    .filter((appointment) => appointment.status === "confirmed")
    .filter((appointment) => new Date(appointment.startAt).getTime() > Date.now())
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={<CalendarDays size={17} />}
          label="Today"
          value={overview.stats.today}
          hint="confirmed appointments"
          tone="accent"
        />
        <StatCard
          icon={<CalendarClock size={17} />}
          label="Next 7 days"
          value={overview.stats.upcoming7}
          hint="on the books"
          tone="sage"
        />
        <StatCard
          icon={<PhoneCall size={17} />}
          label="Handoffs"
          value={overview.stats.openHandoffs}
          hint="waiting for a person"
          tone="plain"
        />
        <StatCard
          icon={<Scissors size={17} />}
          label="Services"
          value={overview.stats.totalServices}
          hint={`${overview.stats.totalStaff} active team members`}
          tone="plain"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionTitle
            title="Today at the studio"
            description={overview.todayAppointments.length ? "A quiet view of the day." : "No appointments booked for today yet."}
            action={
              <Button variant="secondary" onClick={() => onNavigate("appointments")}>
                All appointments <ArrowUpRight size={12} />
              </Button>
            }
          />
          {overview.todayAppointments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-paper/40 px-4 py-8 text-center">
              <CheckCircle2 size={22} className="mx-auto text-sage" />
              <p className="mt-2 text-[12px] font-medium text-ink">The day is clear.</p>
              <p className="mt-1 text-[11px] text-muted">New bookings will appear here instantly.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {overview.todayAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-ink">
                      {appointment.serviceName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {appointment.startLocal} · {appointment.staffName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] text-muted">{appointment.code}</p>
                    <StatusPill tone="success">confirmed</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="Google Calendar" description={overview.google.message} />
          <div className="flex items-center gap-2">
            <StatusPill tone={overview.google.connected ? "success" : "warning"}>
              {overview.google.connected ? "connected" : "local mode"}
            </StatusPill>
            <span className="text-[11px] text-muted">
              {overview.google.connected ? overview.google.calendarId : "no external sync"}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!overview.google.connected ? (
              <a
                href="/api/google/connect"
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[11px] font-semibold text-paper transition hover:bg-ink-soft"
              >
                Connect calendar <ArrowUpRight size={12} />
              </a>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onGoogleAction("test")}>
                  Test connection
                </Button>
                <Button variant="secondary" onClick={() => onGoogleAction("backfill")}>
                  Backfill bookings
                </Button>
                <Button variant="danger" onClick={() => onGoogleAction("disconnect")}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
          {!overview.google.configured && (
            <p className="mt-3 rounded-xl bg-paper/70 px-3 py-2 text-[10px] leading-relaxed text-muted">
              Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to{" "}
              <code>.env.local</code>, restart, then connect from this panel.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionTitle
            title="Upcoming"
            description="The next few appointments across the studio."
            action={
              <Button variant="secondary" onClick={() => onNavigate("appointments")}>
                View all <ArrowUpRight size={12} />
              </Button>
            }
          />
          {upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[11px] text-muted">
              Nothing on the books yet.
            </p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper/40 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-ink">
                      {appointment.serviceName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {appointment.startLocal} · {appointment.staffName}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {appointment.code}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Open handoffs" description="Customers waiting for a person." />
            {overview.handoffs.length === 0 ? (
              <p className="text-[11px] text-muted">Nothing waiting. Nice.</p>
            ) : (
              <div className="space-y-2">
                {overview.handoffs.slice(0, 4).map((handoff) => (
                  <button
                    key={handoff.id}
                    type="button"
                    onClick={() => onNavigate("conversations")}
                    className="focus-ring block w-full rounded-xl border border-accent/20 bg-accent-soft/25 px-3 py-2 text-left"
                  >
                    <p className="line-clamp-2 text-[11px] text-ink-soft">{handoff.reason}</p>
                    <p className="mt-1 text-[10px] text-muted">Open conversation</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Recent conversations" />
            {overview.conversations.length === 0 ? (
              <p className="text-[11px] text-muted">No conversations yet.</p>
            ) : (
              <div className="space-y-2">
                {overview.conversations.slice(0, 4).map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onNavigate("conversations")}
                    className="focus-ring flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-paper/60"
                  >
                    <MessageSquare size={13} className="mt-0.5 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-ink">
                        {conversation.customerName || "Guest"}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        {conversation.lastMessage || "No messages yet"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: "accent" | "sage" | "plain";
}) {
  const iconClass =
    tone === "accent"
      ? "bg-accent-soft/60 text-accent-dark"
      : tone === "sage"
        ? "bg-sage-soft/60 text-sage"
        : "bg-paper text-ink-soft";
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-full ${iconClass}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 font-display text-[30px] leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-[10px] text-muted">{hint}</p>
    </Card>
  );
}
