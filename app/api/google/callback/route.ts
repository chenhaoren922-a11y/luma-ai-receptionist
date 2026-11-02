import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { parseCookies } from "@/lib/auth/admin";
import { exchangeCode } from "@/lib/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "luma_google_state";

function errorRedirect(request: Request, message: string): NextResponse {
  const url = new URL("/admin", request.url);
  url.searchParams.set("google", "error");
  url.searchParams.set("message", message.slice(0, 300));
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return errorRedirect(request, "Google authorization was cancelled.");

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const cookieState = parseCookies(request.headers.get("cookie"))[STATE_COOKIE] ?? "";
  if (!state || !cookieState || state.length !== cookieState.length) {
    return errorRedirect(request, "The Google authorization state did not match. Try again.");
  }
  if (!timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
    return errorRedirect(request, "The Google authorization state did not match. Try again.");
  }
  if (!code) return errorRedirect(request, "Google did not return an authorization code.");

  try {
    await exchangeCode(code);
    const response = NextResponse.redirect(new URL("/admin?google=connected", request.url));
    response.headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; Max-Age=0`);
    return response;
  } catch (errorValue) {
    const message =
      errorValue instanceof Error ? errorValue.message : "Google authorization failed.";
    return errorRedirect(request, message);
  }
}
