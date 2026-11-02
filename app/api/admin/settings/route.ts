import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { getSettings, saveSettings } from "@/lib/data/settings";
import { AppError } from "@/lib/errors";
import { json, readJson, routeError } from "@/lib/http";
import type { BusinessSettings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json({ settings: getSettings(getDb()) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    if (!body || typeof body !== "object") {
      throw new AppError("INVALID_SETTINGS", "Settings must be a JSON object.");
    }
    const settings = saveSettings(body as Partial<BusinessSettings>, getDb());
    return json({ settings });
  } catch (error) {
    return routeError(error);
  }
}
