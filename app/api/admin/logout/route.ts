import { clearAdminCookie } from "@/lib/auth/admin";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearAdminCookie() } });
}
