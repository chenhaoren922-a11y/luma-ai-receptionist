import { hasValidAdminCookie } from "@/lib/auth/admin";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authenticated = hasValidAdminCookie(request.headers.get("cookie"));
  return json({ authenticated });
}
