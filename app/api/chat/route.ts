import { checkRateLimit, clientIp } from "@/lib/auth/rate-limit";
import { handleChat } from "@/lib/ai/orchestrator";
import { json, readJson, routeError, stringField } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`chat:${ip}`, 30, 60_000);
    if (!limit.ok) {
      return json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "You're sending messages a little quickly. Please wait a moment.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
        },
      );
    }

    const body = await readJson(request);
    const message = stringField(body, "message", { required: true, max: 2000 });
    const sessionId = stringField(body, "sessionId", { max: 64 });
    const response = await handleChat({
      sessionId,
      message: message ?? "",
    });
    return json(response);
  } catch (error) {
    return routeError(error);
  }
}
