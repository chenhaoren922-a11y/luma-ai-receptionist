"use client";

import { ArrowUpRight, CalendarRange, Check, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";
import type { BusinessSettings, DayHours } from "@/lib/types";

import {
  Button,
  Card,
  Field,
  SectionTitle,
  StatusPill,
  TextInput,
} from "./ui";

type Mutate = (
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  successMessage?: string,
) => Promise<unknown>;

const DAYS = [
  { key: "0", label: "Sunday" },
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
];

const TIMEZONES = [
  "Etc/GMT+4",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Shanghai",
  "UTC",
];

export function SettingsTab({
  overview,
  onMutate,
  onGoogleAction,
  onError,
  onSuccess,
}: {
  overview: AdminOverview;
  onMutate: Mutate;
  onGoogleAction: (action: "test" | "backfill" | "disconnect") => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [form, setForm] = useState<BusinessSettings>(() =>
    JSON.parse(JSON.stringify(overview.settings)) as BusinessSettings,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(JSON.parse(JSON.stringify(overview.settings)) as BusinessSettings);
  }, [overview.settings]);

  function update<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDay(day: string, patch: Partial<DayHours>) {
    setForm((current) => ({
      ...current,
      hours: {
        ...current.hours,
        [day]: { ...current.hours[day], ...patch },
      },
    }));
  }

  async function save() {
    setBusy(true);
    try {
      await onMutate("/api/admin/settings", "PUT", form, "Studio settings saved.");
      onSuccess("Studio settings saved.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save the settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Studio settings"
        description="The details Luma uses for availability, confirmations, and customer answers."
        action={
          <Button onClick={() => void save()} disabled={busy}>
            <Check size={12} /> {busy ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Business profile
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              <TextInput
                value={form.businessName}
                onChange={(event) => update("businessName", event.target.value)}
              />
            </Field>
            <Field label="AI receptionist name">
              <TextInput
                value={form.aiName}
                onChange={(event) => update("aiName", event.target.value)}
              />
            </Field>
            <Field label="Tagline" className="sm:col-span-2">
              <TextInput
                value={form.tagline}
                onChange={(event) => update("tagline", event.target.value)}
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <TextInput
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>
            <Field label="Email">
              <TextInput
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
              />
            </Field>
            <Field label="Time zone" hint="IANA name, e.g. America/New_York.">
              <TextInput
                list="timezone-options"
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
              />
              <datalist id="timezone-options">
                {TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>
            </Field>
            <Field label="Currency">
              <TextInput
                value={form.currency}
                onChange={(event) => update("currency", event.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Scheduling rules
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Slot interval (minutes)">
              <TextInput
                type="number"
                min={5}
                max={120}
                step={5}
                value={form.slotIntervalMin}
                onChange={(event) => update("slotIntervalMin", Number(event.target.value))}
              />
            </Field>
            <Field label="Lead time (minutes)">
              <TextInput
                type="number"
                min={0}
                max={10080}
                step={15}
                value={form.leadTimeMin}
                onChange={(event) => update("leadTimeMin", Number(event.target.value))}
              />
            </Field>
            <Field label="Book ahead (days)">
              <TextInput
                type="number"
                min={1}
                max={365}
                value={form.maxAdvanceDays}
                onChange={(event) => update("maxAdvanceDays", Number(event.target.value))}
              />
            </Field>
            <Field label="Change cutoff (hours)">
              <TextInput
                type="number"
                min={0}
                max={168}
                value={form.cancellationCutoffHours}
                onChange={(event) =>
                  update("cancellationCutoffHours", Number(event.target.value))
                }
              />
            </Field>
          </div>
          <div className="mt-4 rounded-xl bg-paper/60 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
            <CalendarRange size={13} className="mr-1 inline" />
            Availability is generated from opening hours, service duration, buffers, existing
            bookings, and any busy events in Google Calendar.
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              AI model
            </p>
            <p className="mt-1 text-[13px] font-semibold text-ink">
              {overview.ai.provider}
              <span className="mx-1.5 text-muted">·</span>
              <span className="font-normal text-ink-soft">
                {overview.ai.model || "not configured"}
              </span>
            </p>
          </div>
          <StatusPill tone={overview.ai.mode === "live" ? "success" : "warning"}>
            {overview.ai.mode === "live" ? "live" : "fallback"}
          </StatusPill>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
          {overview.ai.mode === "live"
            ? "Customer chat is using the selected model provider."
            : "The deterministic fallback bot is active until the selected provider is configured."}
        </p>
        {overview.ai.error && (
          <p className="mt-2 rounded-xl bg-accent-soft/30 px-3 py-2 text-[10px] text-accent-dark">
            Configuration status:{" "}
            {overview.ai.error === "MISSING_CREDENTIALS"
              ? "the selected provider's key or model is missing."
              : overview.ai.error === "AI_MODE_FALLBACK"
                ? "AI_MODE is set to fallback."
                : overview.ai.error}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Set <code>AI_PROVIDER</code>, the provider key, and the model in{" "}
          <code>.env.local</code>, then restart the server. Supported:{" "}
          <code>deepseek</code>, <code>groq</code>, <code>openai-compatible</code>.
        </p>
      </Card>

      <Card>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Opening hours
        </p>
        <div className="mt-3 space-y-2">
          {DAYS.map((day) => {
            const hours = form.hours[day.key] ?? {
              closed: true,
              open: "10:00",
              close: "19:00",
            };
            return (
              <div
                key={day.key}
                className="grid items-center gap-2 rounded-xl border border-line bg-paper/40 px-3 py-2 sm:grid-cols-[110px_90px_1fr_1fr_1fr_1fr]"
              >
                <p className="text-[11px] font-semibold text-ink">{day.label}</p>
                <label className="flex items-center gap-1.5 text-[10px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={!hours.closed}
                    onChange={(event) =>
                      updateDay(day.key, { closed: !event.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-[#c96f4a]"
                  />
                  Open
                </label>
                <input
                  type="time"
                  value={hours.open}
                  disabled={hours.closed}
                  onChange={(event) => updateDay(day.key, { open: event.target.value })}
                  className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11px] disabled:opacity-40"
                />
                <input
                  type="time"
                  value={hours.close}
                  disabled={hours.closed}
                  onChange={(event) => updateDay(day.key, { close: event.target.value })}
                  className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11px] disabled:opacity-40"
                />
                <input
                  type="time"
                  value={hours.breakStart ?? ""}
                  disabled={hours.closed}
                  onChange={(event) => updateDay(day.key, { breakStart: event.target.value })}
                  className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11px] disabled:opacity-40"
                  title="Break start"
                />
                <input
                  type="time"
                  value={hours.breakEnd ?? ""}
                  disabled={hours.closed}
                  onChange={(event) => updateDay(day.key, { breakEnd: event.target.value })}
                  className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11px] disabled:opacity-40"
                  title="Break end"
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted">
          The last two time fields are an optional daily break. Leave both empty if there is no
          break.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              <PlugZap size={13} /> Google Calendar
            </p>
            <p className="mt-2 max-w-[560px] text-[11px] leading-relaxed text-ink-soft">
              {overview.google.message}
            </p>
          </div>
          <StatusPill tone={overview.google.connected ? "success" : "warning"}>
            {overview.google.connected ? "connected" : "local mode"}
          </StatusPill>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Calendar ID" hint="Use primary for the connected account's main calendar.">
            <TextInput
              value={form.googleCalendarId}
              onChange={(event) => update("googleCalendarId", event.target.value)}
              placeholder="primary"
            />
          </Field>
          <div className="flex items-end gap-2 pb-0.5">
            {!overview.google.connected ? (
              <a
                href="/api/google/connect"
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-[11px] font-semibold text-paper transition hover:bg-ink-soft"
              >
                Connect <ArrowUpRight size={12} />
              </a>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onGoogleAction("test")}>
                  Test
                </Button>
                <Button variant="secondary" onClick={() => onGoogleAction("backfill")}>
                  Backfill
                </Button>
                <Button variant="danger" onClick={() => onGoogleAction("disconnect")}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        {!overview.google.configured && (
          <div className="mt-3 rounded-xl border border-line bg-paper/60 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
            <p className="font-semibold text-ink-soft">Setup checklist</p>
            <p className="mt-1">
              1. In Google Cloud, enable the Calendar API and create an OAuth web client.
            </p>
            <p>2. Add the redirect URI shown in the setup guide.</p>
            <p>
              3. Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in{" "}
              <code>.env.local</code>, restart, then click Connect.
            </p>
            <a
              className="mt-1 inline-flex items-center gap-1 font-semibold text-accent"
              href="/docs/google-calendar-setup"
            >
              Setup guide <ArrowUpRight size={10} />
            </a>
          </div>
        )}
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={() => void save()} disabled={busy}>
          <Check size={12} /> {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
