import {
  adminPasswordConfigured,
  checkAdminPassword,
  createAdminCookie,
  sessionExpiry,
} from "@/lib/auth/admin";
import { checkRateLimit, clientIp } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`login:${ip}`, 5, 60_000);
    if (!limit.ok) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a minute.", 429);
    }
    if (!adminPasswordConfigured()) {
      throw new AppError(
        "ADMIN_NOT_CONFIGURED",
        "Admin login is not configured. Set ADMIN_PASSWORD in .env.local and restart.",
        503,
      );
    }
    const body = await readJson(request);
    const password = stringField(body, "password", { required: true, max: 200 });
    if (!checkAdminPassword(password ?? "")) {
      throw new AppError("INVALID_PASSWORD", "That password is not correct.", 401);
    }
    return json(
      { ok: true, expiresAt: sessionExpiry() },
      { headers: { "Set-Cookie": createAdminCookie() } },
    );
  } catch (error) {
    return routeError(error);
  }
}
