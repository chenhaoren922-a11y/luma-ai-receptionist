import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminOverview } from "@/lib/data/admin";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json(getAdminOverview(await getDb()));
  } catch (error) {
    return routeError(error);
  }
}
