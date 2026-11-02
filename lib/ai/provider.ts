import { z } from "zod";

import { AppError } from "@/lib/errors";

export type ModelProvider = "deepseek" | "groq" | "openai-compatible";
export type ModelToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ModelToolCall[];
  tool_call_id?: string;
  name?: string;
};
export type ModelToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type ModelConfig = {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
};
export type ModelStatus = {
  provider: string;
  model: string;
  configured: boolean;
  mode: "live" | "fallback";
  error?: string;
};
type Env = Record<string, string | undefined>;
type ToolChoice = "auto" | { type: "function"; function: { name: string } };

function value(env: Env, key: string, fallback = ""): string {
  return env[key]?.trim() || fallback;
}

/** Never infer a provider from another provider's key or send a key across providers. */
export function getModelConfig(env: Env = process.env): ModelConfig {
  const providerName = value(env, "AI_PROVIDER", "deepseek");
  if (!["deepseek", "groq", "openai-compatible"].includes(providerName)) {
    throw new AppError("AI_INVALID_PROVIDER", "AI_PROVIDER must be deepseek, groq, or openai-compatible.", 503);
  }
  const provider = providerName as ModelProvider;
  const config = provider === "groq"
    ? {
        baseUrl: value(env, "GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        model: value(env, "GROQ_MODEL", "openai/gpt-oss-120b"),
        apiKey: value(env, "GROQ_API_KEY"),
      }
    : provider === "openai-compatible"
      ? {
          baseUrl: value(env, "OPENAI_COMPATIBLE_BASE_URL"),
          model: value(env, "OPENAI_COMPATIBLE_MODEL"),
          apiKey: value(env, "OPENAI_COMPATIBLE_API_KEY"),
        }
      : {
          baseUrl: value(env, "DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
          model: value(env, "DEEPSEEK_MODEL", "deepseek-flash"),
          apiKey: value(env, "DEEPSEEK_API_KEY"),
        };
  const rawTimeout = Number(value(env, "AI_TIMEOUT_MS", "30000"));
  const timeoutMs = Number.isFinite(rawTimeout)
    ? Math.max(1000, Math.min(60000, rawTimeout))
    : 30000;
  return { provider, ...config, baseUrl: config.baseUrl.replace(/\/+$/, ""), timeoutMs };
}

function baseUrlIsUsable(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return (
    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    !/\/chat\/completions\/?$/.test(url.pathname)
  );
}

export function isUsableBaseUrl(value: string): boolean {
  return baseUrlIsUsable(value);
}

export function isModelConfigured(env: Env = process.env): boolean {
  try {
    const config = getModelConfig(env);
    return Boolean(config.apiKey && config.model && baseUrlIsUsable(config.baseUrl));
  } catch {
    return false;
  }
}

export function modelMode(env: Env = process.env): "live" | "fallback" {
  if (env.AI_MODE === "fallback") return "fallback";
  return isModelConfigured(env) ? "live" : "fallback";
}

/** Safe admin status; never return base URLs, keys, or raw upstream errors. */
export function modelStatus(env: Env = process.env): ModelStatus {
  const requestedProvider = env.AI_PROVIDER?.trim() || "deepseek";
  if (env.AI_MODE === "fallback") {
    return {
      provider: requestedProvider,
      model: "",
      configured: false,
      mode: "fallback",
      error: "AI_MODE_FALLBACK",
    };
  }
  try {
    const config = getModelConfig(env);
    const credentials = Boolean(config.apiKey && config.model);
    const configured = credentials && baseUrlIsUsable(config.baseUrl);
    return {
      provider: config.provider,
      model: config.model,
      configured,
      mode: configured ? "live" : "fallback",
      ...(configured
        ? {}
        : {
            error: credentials ? "AI_INVALID_BASE_URL" : "MISSING_CREDENTIALS",
          }),
    };
  } catch (error) {
    return {
      provider: requestedProvider,
      model: "",
      configured: false,
      mode: "fallback",
      error: error instanceof AppError ? error.code : "AI_INVALID_CONFIG",
    };
  }
}

function completionUrl(config: ModelConfig): string {
  if (!baseUrlIsUsable(config.baseUrl)) {
    throw new AppError("AI_INVALID_BASE_URL", "Use an HTTPS API base URL without credentials, query strings, fragments, or /chat/completions. HTTP is allowed only for loopback testing.", 503);
  }
  return `${config.baseUrl}/chat/completions`;
}

export function buildModelRequest(
  config: ModelConfig,
  messages: ModelMessage[],
  tools: ModelToolDefinition[],
  toolChoice: ToolChoice = "auto",
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  if (config.provider === "groq") {
    body.max_completion_tokens = 4096;
    if (tools.length) body.parallel_tool_calls = false;
    if (config.model.startsWith("openai/gpt-oss-")) body.reasoning_effort = "low";
  } else {
    body.max_tokens = 1500;
    body.temperature = 0.3;
    // Keep the legacy DeepSeek behavior only on its own official endpoint.
    if (config.provider === "deepseek" && new URL(config.baseUrl).hostname === "api.deepseek.com") {
      body.thinking = { type: "disabled" };
    }
  }
  return body;
}

const responseSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({
      role: z.literal("assistant").optional(),
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string().min(1),
        type: z.literal("function"),
        function: z.object({ name: z.string().min(1), arguments: z.string() }),
      })).max(16).optional(),
    }),
  })).min(1),
});

function parseResponse(data: unknown): ModelMessage {
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError("AI_BAD_RESPONSE", "The model returned an invalid chat-completion response.", 502);
  }
  const choice = parsed.data.choices[0];
  if (choice.finish_reason === "length" || choice.finish_reason === "content_filter") {
    throw new AppError("AI_INCOMPLETE_RESPONSE", "The model response was incomplete; no partial tool calls were executed.", 502);
  }
  const message = choice.message;
  const calls = message.tool_calls ?? [];
  if (!message.content?.trim() && !calls.length) {
    throw new AppError("AI_EMPTY_RESPONSE", "The model returned no answer or tool call.", 502);
  }
  if (new Set(calls.map((call) => call.id)).size !== calls.length) {
    throw new AppError("AI_BAD_RESPONSE", "The model returned duplicate tool-call identifiers.", 502);
  }
  // Discard reasoning, provider metadata, and other non-standard fields.
  return { role: "assistant", content: message.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) };
}

class ModelHttpError extends AppError {
  constructor(
    readonly upstreamStatus: number,
    readonly retryAfterMs = 0,
  ) {
    const hint = upstreamStatus === 401
      ? "Check the selected provider's API key."
      : upstreamStatus === 403
        ? "Check model permissions for the selected provider."
        : upstreamStatus === 404
          ? "Check the API base URL and model name."
          : upstreamStatus === 429
            ? "The selected provider is rate-limiting requests. Wait and try again, or use a higher rate-limit tier."
            : upstreamStatus === 400 || upstreamStatus === 422
              ? "The selected model rejected the request; verify tool-calling support and parameters."
              : "The selected model service is temporarily unavailable.";
    super("AI_REQUEST_FAILED", `Model API returned HTTP ${upstreamStatus}. ${hint}`, 502);
  }
}

export async function callChatModel(
  messages: ModelMessage[],
  tools: ModelToolDefinition[],
  options: { toolChoice?: ToolChoice } = {},
): Promise<ModelMessage> {
  const config = getModelConfig();
  if (!config.apiKey || !config.model) {
    throw new AppError("AI_NOT_CONFIGURED", "Configure the selected provider's API key and model on the server.", 503);
  }
  const url = completionUrl(config);
  const body = JSON.stringify(buildModelRequest(config, messages, tools, options.toolChoice));
  // Retry only explicit rate-limit/server responses; never switch provider/model.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body,
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        let providerType = "";
        let providerCode = "";
        try {
          const parsed = JSON.parse(raw) as {
            error?: { type?: string; code?: string };
          };
          providerType = parsed.error?.type ?? "";
          providerCode = parsed.error?.code ?? "";
        } catch {
          // Ignore unreadable provider error bodies.
        }
        console.error(
          `[model-api] HTTP ${response.status}${providerType ? ` type=${providerType}` : ""}${
            providerCode ? ` code=${providerCode}` : ""
          }`,
        );
        if (process.env.AI_DEBUG_MODEL_ERRORS === "true") {
          // Temporary, server-only diagnostics. Do not enable in production.
          console.error("[model-api-debug]", raw.slice(0, 2000));
        }
        const retryAfterHeader = Number(response.headers.get("retry-after"));
        const retryAfterMatch = /try again in\s+([\d.]+)\s*s/i.exec(raw);
        const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : retryAfterMatch
            ? Number(retryAfterMatch[1]) * 1000
            : 0;
        throw new ModelHttpError(response.status, retryAfterMs);
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        if (controller.signal.aborted) throw new AppError("AI_TIMEOUT", "The model service took too long to respond.", 504);
        throw new AppError("AI_BAD_RESPONSE", "The model returned an unreadable response.", 502);
      }
      return parseResponse(data);
    } catch (error) {
      if (error instanceof ModelHttpError && attempt === 0 && (error.upstreamStatus === 429 || error.upstreamStatus >= 500)) {
        clearTimeout(timer);
        // Respect the provider's Retry-After hint, but never hold a chat open for
        // more than ten seconds. A second 429 falls through to the fallback bot.
        const delayMs = error.upstreamStatus === 429
          ? Math.min(10_000, Math.max(1_000, error.retryAfterMs || 1_000))
          : 300;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError("AI_TIMEOUT", "The model service took too long to respond.", 504);
      throw new AppError("AI_UNAVAILABLE", "The selected model service could not be reached. Check the server's network and provider configuration.", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError("AI_UNAVAILABLE", "The selected model service is unavailable.", 502);
}
