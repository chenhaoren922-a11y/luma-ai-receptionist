import { requireAdmin } from "@/lib/auth/admin";
import { getAdminOverview } from "@/lib/data/admin";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json(getAdminOverview());
  } catch (error) {
    return routeError(error);
  }
}
