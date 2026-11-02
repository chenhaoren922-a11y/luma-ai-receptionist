import { getBootstrap } from "@/lib/bootstrap";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(getBootstrap());
  } catch (error) {
    return routeError(error);
  }
}
