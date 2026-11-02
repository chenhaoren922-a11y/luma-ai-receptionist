import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildModelRequest,
  callChatModel,
  getModelConfig,
  isModelConfigured,
  isUsableBaseUrl,
  modelMode,
  modelStatus,
  type ModelConfig,
} from "@/lib/ai/provider";
import { TOOL_DEFINITIONS } from "@/lib/ai/tools";

const tools = [
  {
    type: "function" as const,
    function: {
      name: "list_services",
      description: "List services",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

function config(provider: ModelConfig["provider"], baseUrl: string, model: string): ModelConfig {
  return { provider, baseUrl, model, apiKey: "test-key", timeoutMs: 30_000 };
}

describe("model provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the selected provider only", () => {
    const groq = getModelConfig({
      AI_PROVIDER: "groq",
      GROQ_API_KEY: "gsk_test",
      GROQ_MODEL: "openai/gpt-oss-120b",
      DEEPSEEK_API_KEY: "must-not-be-used",
    });
    expect(groq).toMatchObject({
      provider: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: "gsk_test",
    });

    const deepseek = getModelConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "ds_test",
      DEEPSEEK_MODEL: "deepseek-flash",
      GROQ_API_KEY: "must-not-be-used",
    });
    expect(deepseek.provider).toBe("deepseek");
    expect(deepseek.apiKey).toBe("ds_test");
  });

  it("does not fall back to another provider's key", () => {
    const env = {
      AI_PROVIDER: "groq",
      DEEPSEEK_API_KEY: "ds_only",
    };
    expect(isModelConfigured(env)).toBe(false);
    expect(modelMode(env)).toBe("fallback");
    expect(modelStatus(env)).toMatchObject({
      provider: "groq",
      configured: false,
      mode: "fallback",
      error: "MISSING_CREDENTIALS",
    });
  });

  it("reports configured live mode without exposing the key", () => {
    const status = modelStatus({
      AI_PROVIDER: "groq",
      GROQ_API_KEY: "gsk_secret",
      GROQ_MODEL: "openai/gpt-oss-120b",
    });
    expect(status).toEqual({
      provider: "groq",
      model: "openai/gpt-oss-120b",
      configured: true,
      mode: "live",
    });
    expect(JSON.stringify(status)).not.toContain("gsk_secret");
  });

  it("reports invalid providers as fallback without throwing", () => {
    expect(isModelConfigured({ AI_PROVIDER: "unknown" })).toBe(false);
    expect(modelStatus({ AI_PROVIDER: "unknown" })).toMatchObject({
      mode: "fallback",
      configured: false,
      error: "AI_INVALID_PROVIDER",
    });
    expect(() => getModelConfig({ AI_PROVIDER: "unknown" })).toThrow("AI_PROVIDER");
  });

  it("validates base URLs and surfaces invalid ones in status", () => {
    expect(isUsableBaseUrl("https://api.groq.com/openai/v1")).toBe(true);
    expect(isUsableBaseUrl("http://127.0.0.1:4010/v1")).toBe(true);
    expect(isUsableBaseUrl("http://api.groq.com/openai/v1")).toBe(false);
    expect(isUsableBaseUrl("https://api.groq.com/openai/v1/chat/completions")).toBe(false);
    expect(isUsableBaseUrl("https://user:pass@api.groq.com/openai/v1")).toBe(false);

    expect(
      modelStatus({
        AI_PROVIDER: "groq",
        GROQ_API_KEY: "gsk_test",
        GROQ_MODEL: "openai/gpt-oss-120b",
        GROQ_BASE_URL: "http://api.groq.com/openai/v1",
      }),
    ).toMatchObject({
      configured: false,
      mode: "fallback",
      error: "AI_INVALID_BASE_URL",
    });
  });
});

describe("tool schemas", () => {
  it("keeps optional tool fields optional for Groq validation", () => {
    const availability = TOOL_DEFINITIONS.find(
      (tool) => tool.function.name === "get_availability",
    );
    const parameters = availability?.function.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(parameters.required).toEqual(expect.arrayContaining(["serviceId", "date"]));
    expect(parameters.required).not.toContain("staffId");
    expect(parameters.required).not.toContain("period");
    expect(parameters.properties).toHaveProperty("staffId");

    const prepare = TOOL_DEFINITIONS.find(
      (tool) => tool.function.name === "prepare_booking",
    );
    const prepareParameters = prepare?.function.parameters as { required?: string[] };
    expect(prepareParameters.required).not.toContain("staffId");
    expect(prepareParameters.required).not.toContain("notes");
  });
});

describe("provider-specific request bodies", () => {
  it("uses Groq's completion and reasoning parameters", () => {
    const body = buildModelRequest(
      config("groq", "https://api.groq.com/openai/v1", "openai/gpt-oss-120b"),
      [{ role: "user", content: "hello" }],
      tools,
    );
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 4096,
      reasoning_effort: "low",
      parallel_tool_calls: false,
      tool_choice: "auto",
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps DeepSeek's official thinking disable flag", () => {
    const body = buildModelRequest(
      config("deepseek", "https://api.deepseek.com", "deepseek-flash"),
      [{ role: "user", content: "hello" }],
      tools,
    );
    expect(body).toMatchObject({ max_tokens: 1500, temperature: 0.3 });
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not send DeepSeek-only flags to a custom-compatible endpoint", () => {
    const body = buildModelRequest(
      config("openai-compatible", "https://example.test/v1", "custom-model"),
      [{ role: "user", content: "hello" }],
      tools,
    );
    expect(body).toMatchObject({ max_tokens: 1500, temperature: 0.3 });
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});

describe("chat completion client", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-120b");
    vi.stubEnv("AI_MODE", "auto");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends an explicit non-streaming request to Groq", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hello" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const message = await callChatModel([{ role: "user", content: "Hi" }], []);
    expect(message.content).toBe("Hello");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer gsk_test",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.model).toBe("openai/gpt-oss-120b");
  });

  it("returns structured tool calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "list_services", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const message = await callChatModel([{ role: "user", content: "services?" }], tools);
    expect(message.tool_calls?.[0]).toMatchObject({
      id: "call_1",
      function: { name: "list_services", arguments: "{}" },
    });
  });

  it("does not leak upstream error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "secret upstream detail" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(callChatModel([{ role: "user", content: "Hi" }], [])).rejects.toMatchObject({
      code: "AI_REQUEST_FAILED",
    });
    await expect(callChatModel([{ role: "user", content: "Hi" }], [])).rejects.not.toThrow(
      /secret upstream detail/,
    );
  });

  it("rejects incomplete or unreadable responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { role: "assistant", content: "..." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(callChatModel([{ role: "user", content: "Hi" }], [])).rejects.toMatchObject({
      code: "AI_INCOMPLETE_RESPONSE",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );
    await expect(callChatModel([{ role: "user", content: "Hi" }], [])).rejects.toMatchObject({
      code: "AI_BAD_RESPONSE",
    });
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("{}", { status: 401, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(callChatModel([{ role: "user", content: "Hi" }], [])).rejects.toMatchObject({
      code: "AI_REQUEST_FAILED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a rate limit using the provider's Retry-After hint", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "Rate limit reached. Please try again in 1s.",
              type: "tokens",
              code: "rate_limit_exceeded",
            },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = callChatModel([{ role: "user", content: "Hi" }], []);
    await vi.advanceTimersByTimeAsync(1000);
    const message = await promise;
    expect(message.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
