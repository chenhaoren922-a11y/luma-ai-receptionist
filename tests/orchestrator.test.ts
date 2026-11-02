import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleChat } from "@/lib/ai/orchestrator";
import { makeTestDb } from "./helpers";

describe("chat orchestrator with a selected provider", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-120b");
    vi.stubEnv("AI_MODE", "auto");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("executes a tool call and returns the final model answer", async () => {
    const responses = [
      {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_services",
                  type: "function",
                  function: { name: "list_services", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "We offer a Test Facial for $120.",
            },
          },
        ],
      },
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const db = makeTestDb();
    const response = await handleChat({ db, message: "What services do you offer?" });

    expect(response.mode).toBe("live");
    expect(response.message.content).toContain("Test Facial");
    expect(response.message.ui?.[0]?.type).toBe("services");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      stream: false,
    });
    expect(body).toHaveProperty("tools");
  });

  it("uses the fallback bot when the selected provider has no key", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("AI_PROVIDER", "groq");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const db = makeTestDb();
    const response = await handleChat({ db, message: "Hello" });
    expect(response.mode).toBe("fallback");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
