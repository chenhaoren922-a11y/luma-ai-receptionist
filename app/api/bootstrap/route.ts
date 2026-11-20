import { getDb } from "@/lib/db/client";
import { getBootstrap } from "@/lib/bootstrap";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(getBootstrap(await getDb()));
  } catch (error) {
    return routeError(error);
  }
}
