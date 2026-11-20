import { withNetlifyDatabase } from "@/lib/db/netlify";
import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { getConversationDetail } from "@/lib/data/admin";
import { listConversations } from "@/lib/data/conversations";
import { json, routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  try {
    requireAdmin(request);
    const db = await getDb();
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (id) {
      return json(getConversationDetail(db, id));
    }
    return json({ conversations: listConversations(db, 50) });
  } catch (error) {
    return routeError(error);
  }
}

export const GET = withNetlifyDatabase(handleGET);
