"use client";

import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  RefreshCw,
  Scissors,
  Settings,
  Store,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";

import { Logo } from "@/components/ui/logo";
import { AppointmentsTab } from "./appointments-tab";
import { ConversationsTab } from "./conversations-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { OverviewTab } from "./overview-tab";
import { ServicesTab } from "./services-tab";
import { SettingsTab } from "./settings-tab";

export type AdminTab =
  | "overview"
  | "appointments"
  | "services"
  | "knowledge"
  | "conversations"
  | "settings";

const TABS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "services", label: "Services & Team", icon: Scissors },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "conversations", label: "Conversations", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AdminApp() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ tone: "ok" | "error"; message: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = (await response.json()) as AdminOverview & {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data.error?.message || "Could not load the studio.");
      setOverview(data);
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load the studio.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected") {
      setToast({ tone: "ok", message: "Google Calendar connected." });
    } else if (google === "not_configured") {
      setToast({
        tone: "error",
        message: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.",
      });
    } else if (google === "error") {
      setToast({
        tone: "error",
        message: params.get("message") || "Google Calendar authorization failed.",
      });
    }
    if (google) {
      params.delete("google");
      params.delete("message");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function mutate(
    url: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    body?: unknown,
    successMessage?: string,
  ) {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401) {
      window.location.href = "/admin/login";
      return null;
    }
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(data.error?.message || "That change could not be saved.");
    }
    await load();
    if (successMessage) setToast({ tone: "ok", message: successMessage });
    return data;
  }

  async function handleGoogle(action: "test" | "backfill" | "disconnect") {
    try {
      if (action === "disconnect" && !window.confirm("Disconnect Google Calendar?")) return;
      const response = await fetch(`/api/google/${action}`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        synced?: number;
        failed?: number;
        errors?: string[];
      };
      if (!response.ok) throw new Error(data.error?.message || "Google request failed.");
      if (action === "test") {
        setToast({ tone: "ok", message: "Google Calendar is reachable." });
      } else if (action === "backfill") {
        const firstError = data.errors?.[0];
        setToast({
          tone: data.failed ? "error" : "ok",
          message: `Backfilled ${data.synced ?? 0} appointments${
            data.failed ? `; ${data.failed} failed` : ""
          }${firstError ? `. ${firstError}` : "."}`,
        });
      } else {
        setToast({ tone: "ok", message: "Google Calendar disconnected." });
      }
      await load();
    } catch (error) {
      setToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Google request failed.",
      });
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  if (!overview) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {loading ? "Opening the studio dashboard…" : "Redirecting to sign in…"}
        </div>
      </div>
    );
  }

  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="min-h-[100dvh] p-3 sm:p-5 lg:p-7">
      <div className="mx-auto flex max-w-[1440px] gap-6">
        <aside className="hidden w-[230px] shrink-0 flex-col justify-between rounded-[26px] bg-ink p-5 text-paper shadow-[0_30px_80px_-50px_rgba(31,42,37,0.9)] lg:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size="sm" />
              <div>
                <p className="font-display text-[20px] leading-none">{overview.settings.businessName}</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-paper/55">
                  Studio dashboard
                </p>
              </div>
            </div>
            <nav className="mt-8 space-y-1">
              {TABS.map((item) => {
                const Icon = item.icon;
                const selected = item.id === tab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12px] transition ${
                      selected
                        ? "bg-paper/10 text-paper"
                        : "text-paper/65 hover:bg-paper/5 hover:text-paper"
                    }`}
                  >
                    <Icon size={15} strokeWidth={selected ? 2.2 : 1.8} />
                    {item.label}
                    {item.id === "conversations" && overview.stats.openHandoffs > 0 && (
                      <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-paper">
                        {overview.stats.openHandoffs}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="space-y-2 border-t border-paper/10 pt-4">
            <a
              href="/"
              className="focus-ring flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-paper/65 transition hover:bg-paper/5 hover:text-paper"
            >
              <Store size={14} /> View customer site
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-paper/65 transition hover:bg-paper/5 hover:text-paper"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                {overview.settings.businessName}
              </p>
              <h1 className="mt-1 font-display text-[32px] leading-none text-ink">
                {active.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-2 text-[11px] font-semibold text-ink-soft transition hover:border-accent/40 disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <a
                href="/"
                className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[11px] font-semibold text-paper transition hover:bg-ink-soft lg:hidden"
              >
                View site
              </a>
            </div>
          </div>

          <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 lg:hidden">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`focus-ring shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  item.id === tab
                    ? "bg-ink text-paper"
                    : "border border-line bg-card/60 text-ink-soft"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <OverviewTab
              overview={overview}
              onNavigate={setTab}
              onGoogleAction={(action) => void handleGoogle(action)}
            />
          )}
          {tab === "appointments" && (
            <AppointmentsTab
              overview={overview}
              onMutate={mutate}
              onError={(message) => setToast({ tone: "error", message })}
              onSuccess={(message) => setToast({ tone: "ok", message })}
            />
          )}
          {tab === "services" && (
            <ServicesTab
              overview={overview}
              onMutate={mutate}
              onError={(message) => setToast({ tone: "error", message })}
              onSuccess={(message) => setToast({ tone: "ok", message })}
            />
          )}
          {tab === "knowledge" && (
            <KnowledgeTab
              overview={overview}
              onMutate={mutate}
              onError={(message) => setToast({ tone: "error", message })}
              onSuccess={(message) => setToast({ tone: "ok", message })}
            />
          )}
          {tab === "conversations" && <ConversationsTab overview={overview} />}
          {tab === "settings" && (
            <SettingsTab
              overview={overview}
              onMutate={mutate}
              onGoogleAction={(action) => void handleGoogle(action)}
              onError={(message) => setToast({ tone: "error", message })}
              onSuccess={(message) => setToast({ tone: "ok", message })}
            />
          )}
        </main>
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-[12px] shadow-xl ${
            toast.tone === "ok"
              ? "border-sage/30 bg-sage-soft/95 text-ink"
              : "border-accent/30 bg-accent-soft/95 text-accent-dark"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
