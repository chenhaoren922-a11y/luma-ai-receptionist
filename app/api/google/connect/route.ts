import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { getAuthUrl, isGoogleConfigured } from "@/lib/calendar/google";
import { routeError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "luma_google_state";

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    if (!isGoogleConfigured()) {
      return NextResponse.redirect(
        new URL("/admin?google=not_configured", request.url),
      );
    }
    const state = randomBytes(24).toString("base64url");
    const authUrl = getAuthUrl(state);
    const response = NextResponse.redirect(authUrl);
    response.headers.append(
      "Set-Cookie",
      `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return response;
  } catch (error) {
    return routeError(error);
  }
}
