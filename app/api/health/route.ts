import { withNetlifyDatabase } from "@/lib/db/netlify";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/data/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  try {
    const db = await getDb();
    const settings = getSettings(db);
    db.prepare("SELECT 1").get();
    return NextResponse.json({
      ok: true,
      business: settings.businessName,
      timezone: settings.timezone,
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = withNetlifyDatabase(handleGET);
