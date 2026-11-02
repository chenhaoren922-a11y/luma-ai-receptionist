import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import {
  createStaff,
  deactivateStaff,
  updateStaff,
  type StaffInput,
} from "@/lib/data/admin";
import { getServices, getStaff } from "@/lib/data/catalog";
import { AppError } from "@/lib/errors";
import {
  booleanField,
  json,
  readJson,
  routeError,
  stringArrayField,
  stringField,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readStaffInput(body: unknown): StaffInput {
  const name = stringField(body, "name", { required: true, max: 100 });
  if (!name) throw new AppError("MISSING_NAME", "Team member name is required.");
  return {
    name,
    title: stringField(body, "title", { max: 100 }) ?? "",
    bio: stringField(body, "bio", { max: 1000 }) ?? "",
    color: stringField(body, "color", { max: 20 }) ?? "#7c8f7b",
    active: booleanField(body, "active", true),
    serviceIds: stringArrayField(body, "serviceIds"),
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    return json({ staff: getStaff(db, false), services: getServices(db, false) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const body = await readJson(request);
    return json({ staff: createStaff(db, readStaffInput(body)) }, { status: 201 });
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
    if (!id) throw new AppError("MISSING_ID", "Team member id is required.");
    return json({ staff: updateStaff(db, id, readStaffInput(body)) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    if (!id) throw new AppError("MISSING_ID", "Team member id is required.");
    deactivateStaff(getDb(), id);
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
