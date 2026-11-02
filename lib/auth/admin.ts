import { createHmac, createHash, timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/errors";

export const ADMIN_COOKIE = "luma_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function secret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new AppError(
      "ADMIN_NOT_CONFIGURED",
      "Admin login is not configured. Set ADMIN_PASSWORD in .env.local and restart.",
      503,
    );
  }
  const left = createHash("sha256").update(password).digest();
  const right = createHash("sha256").update(expected).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminCookie(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = String(expires);
  const value = `${payload}.${sign(payload)}`;
  const secure =
    process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://");
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${
    secure ? "; Secure" : ""
  }`;
}

export function clearAdminCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function hasValidAdminCookie(cookieHeader: string | null): boolean {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[ADMIN_COOKIE];
  if (!raw) return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Math.floor(Date.now() / 1000);
}

export function requireAdmin(request: Request): void {
  if (!hasValidAdminCookie(request.headers.get("cookie"))) {
    throw new AppError("UNAUTHORIZED", "Please sign in to the admin dashboard.", 401);
  }
}

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
}
