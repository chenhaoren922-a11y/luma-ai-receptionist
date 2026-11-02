import type { Db } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { getServices, getStaff } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { calendarStatus } from "@/lib/calendar/google";
import { modelStatus } from "@/lib/ai/provider";
import type { BootstrapResponse, ServiceSummary, StaffSummary } from "@/lib/types";

export function getBootstrap(db: Db = getDb()): BootstrapResponse {
  const settings = getSettings(db);
  const services: ServiceSummary[] = getServices(db).map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMin: service.durationMin,
    priceCents: service.priceCents,
    currency: service.currency,
    category: service.category,
    color: service.color,
  }));
  const staff: StaffSummary[] = getStaff(db).map((member) => ({
    id: member.id,
    name: member.name,
    title: member.title,
    color: member.color,
  }));
  const google = calendarStatus(db);
  const ai = modelStatus();
  return {
    business: settings,
    services,
    staff,
    googleConnected: google.connected,
    googleConfigured: google.configured,
    aiMode: ai.mode,
    aiProvider: ai.provider,
    aiModel: ai.model,
    aiConfigured: ai.configured,
    ...(ai.error ? { aiError: ai.error } : {}),
    serverNow: new Date().toISOString(),
  };
}
