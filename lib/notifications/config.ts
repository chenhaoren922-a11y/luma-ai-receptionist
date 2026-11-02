import { createHash } from "node:crypto";

export const MAKE_TIMEOUT_MS = 5_000;
export const MAKE_STALE_ATTEMPT_MS = 30_000;

export type MakeConfig = {
  configured: boolean;
  url?: string;
  secret?: string;
  destinationHash?: string;
  includePhone: boolean;
  error?: "INVALID_WEBHOOK_URL" | "INVALID_WEBHOOK_SECRET";
};

// Never include the submitted URL or key in validation errors, logs, or status output.
export function getMakeConfig(): MakeConfig {
  const raw = process.env.MAKE_WEBHOOK_URL?.trim();
  const includePhone = process.env.MAKE_INCLUDE_CUSTOMER_PHONE === "true";
  if (!raw) return { configured: false, includePhone };
  try {
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const localTest = process.env.NODE_ENV === "test" && loopback && url.protocol === "http:";
    if ((url.protocol !== "https:" && !localTest) || url.username || url.password || url.hash) {
      return { configured: true, includePhone, error: "INVALID_WEBHOOK_URL" };
    }
    const secret = process.env.MAKE_WEBHOOK_SECRET || undefined;
    if (secret && /[\r\n]/.test(secret)) {
      return { configured: true, includePhone, error: "INVALID_WEBHOOK_SECRET" };
    }
    return {
      configured: true,
      url: url.toString(),
      secret,
      destinationHash: createHash("sha256").update(url.toString()).digest("hex"),
      includePhone,
    };
  } catch {
    return { configured: true, includePhone, error: "INVALID_WEBHOOK_URL" };
  }
}
