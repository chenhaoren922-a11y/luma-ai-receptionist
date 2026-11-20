import { withNetlifyDatabase } from "@/lib/db/netlify";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminOverview } from "@/lib/data/admin";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  try {
    requireAdmin(request);
    return json(getAdminOverview(await getDb()));
  } catch (error) {
    return routeError(error);
  }
}

export const GET = withNetlifyDatabase(handleGET);
