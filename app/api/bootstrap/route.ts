import { withNetlifyDatabase } from "@/lib/db/netlify";
import { getDb } from "@/lib/db/client";
import { getBootstrap } from "@/lib/bootstrap";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    return json(getBootstrap(await getDb()));
  } catch (error) {
    return routeError(error);
  }
}

export const GET = withNetlifyDatabase(handleGET);
