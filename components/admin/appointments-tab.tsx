"use client";

import { CalendarDays, RefreshCw, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";
import type { AppointmentSummary } from "@/lib/types";

import { Button, Card, Select, StatusPill, TextInput } from "./ui";

type Mutate = (
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  successMessage?: string,
) => Promise<unknown>;

export function AppointmentsTab({
  overview,
  onMutate,
  onError,
  onSuccess,
}: {
  overview: AdminOverview;
  onMutate: Mutate;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overview.appointments.filter((appointment) => {
      if (status !== "all" && appointment.status !== status) return false;
      if (!q) return true;
      return [appointment.code, appointment.serviceName, appointment.staffName, appointment.customerName, appointment.phone]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [overview.appointments, query, status]);

  async function act(appointment: AppointmentSummary, action: "cancel" | "sync") {
    if (action === "cancel") {
      const ok = window.confirm(
        `Cancel ${appointment.serviceName} for ${appointment.customerName} on ${appointment.startLocal}?`,
      );
      if (!ok) return;
    }
    setBusy(`${appointment.id}:${action}`);
    try {
      await onMutate(
        "/api/admin/appointments/action",
        "POST",
        { id: appointment.id, action },
        action === "cancel" ? "Appointment cancelled." : "Appointment synced.",
      );
      onSuccess(action === "cancel" ? "Appointment cancelled." : "Appointment synced.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, code, service…"
              className="pl-9"
            />
          </div>
          <div className="w-[150px]">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
            </Select>
          </div>
          <p className="ml-auto text-[11px] text-muted">
            {filtered.length} of {overview.appointments.length}
          </p>
        </div>
      </Card>

      <Card className="p-0">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarDays size={22} className="mx-auto text-muted" />
            <p className="mt-2 text-[12px] font-medium text-ink">No appointments match.</p>
            <p className="mt-1 text-[11px] text-muted">Try clearing the search or status filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((appointment) => (
              <div key={appointment.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink">{appointment.serviceName}</p>
                      <StatusPill
                        tone={
                          appointment.status === "confirmed"
                            ? "success"
                            : appointment.status === "cancelled"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {appointment.status}
                      </StatusPill>
                      <StatusPill
                        tone={appointment.syncStatus === "synced" ? "success" : "warning"}
                      >
                        {appointment.syncStatus === "synced" ? "google synced" : "local only"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      {appointment.startLocal} – {appointment.endLocal} · {appointment.staffName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {appointment.customerName} · {appointment.phone} ·{" "}
                      <span className="font-mono">{appointment.code}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {appointment.status === "confirmed" && (
                      <>
                        {appointment.syncStatus !== "synced" && (
                          <Button
                            variant="secondary"
                            disabled={busy === `${appointment.id}:sync`}
                            onClick={() => void act(appointment, "sync")}
                          >
                            <RefreshCw
                              size={11}
                              className={busy === `${appointment.id}:sync` ? "animate-spin" : ""}
                            />
                            Sync
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          disabled={busy === `${appointment.id}:cancel`}
                          onClick={() => void act(appointment, "cancel")}
                        >
                          <XCircle size={11} />
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
