import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import {
  createService,
  deactivateService,
  updateService,
  type ServiceInput,
} from "@/lib/data/admin";
import { getServices, getStaff } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import { AppError } from "@/lib/errors";
import {
  booleanField,
  json,
  numberField,
  readJson,
  routeError,
  stringArrayField,
  stringField,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readServiceInput(body: unknown, fallbackCurrency: string): ServiceInput {
  const name = stringField(body, "name", { required: true, max: 100 });
  if (!name) throw new AppError("MISSING_NAME", "Service name is required.");
  return {
    name,
    description: stringField(body, "description", { max: 1000 }) ?? "",
    durationMin: numberField(body, "durationMin", { required: true, min: 5, max: 480 }) ?? 60,
    bufferMin: numberField(body, "bufferMin", { min: 0, max: 120, fallback: 0 }) ?? 0,
    priceCents: numberField(body, "priceCents", { required: true, min: 0, max: 10_000_000 }) ?? 0,
    currency: stringField(body, "currency", { max: 8 }) ?? fallbackCurrency,
    category: stringField(body, "category", { max: 50 }) ?? "",
    color: stringField(body, "color", { max: 20 }) ?? "#c96f4a",
    active: booleanField(body, "active", true),
    sortOrder: numberField(body, "sortOrder", { min: 0, max: 9999, fallback: 0 }) ?? 0,
    staffIds: stringArrayField(body, "staffIds"),
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    return json({ services: getServices(db, false), staff: getStaff(db, false) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const body = await readJson(request);
    const input = readServiceInput(body, getSettings(db).currency);
    return json({ service: createService(db, input) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    if (!id) throw new AppError("MISSING_ID", "Service id is required.");
    const input = readServiceInput(body, getSettings(db).currency);
    return json({ service: updateService(db, id, input) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    if (!id) throw new AppError("MISSING_ID", "Service id is required.");
    deactivateService(getDb(), id);
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
