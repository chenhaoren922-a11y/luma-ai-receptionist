# AI provider setup

Luma can use DeepSeek, Groq, or another OpenAI-compatible chat-completions endpoint. The reservation engine, Google Calendar sync, and admin dashboard are independent of the model provider.

The provider is selected only through server-side environment variables. Keys are never sent to the browser.

## Provider selection

```env
# deepseek | groq | openai-compatible
AI_PROVIDER=deepseek
AI_TIMEOUT_MS=30000

# auto | live | fallback
AI_MODE=auto
```

`AI_MODE=fallback` always uses the deterministic booking bot. `AI_MODE=auto` uses the selected provider when its key, base URL, and model are present; otherwise it falls back safely. There is no cross-provider key fallback: a DeepSeek key is never sent to Groq, and a Groq key is never sent to DeepSeek.

After changing `.env.local`, restart the app. In **Admin → Settings** the **AI model** card shows the active provider, model, and `live` or `fallback` state.

## DeepSeek

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

The DeepSeek-specific `thinking: disabled` request field is sent only to the official `api.deepseek.com` host. It is omitted when a custom DeepSeek-compatible base URL is used.

## Groq

Create a key at <https://console.groq.com/keys>, then use:

```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-120b
```

`openai/gpt-oss-120b` is an open-weight model served by Groq. It is not GPT-6 and is not the same model as DeepSeek. Tool calling must be enabled for the model/account before the receptionist can use it.

The Groq adapter sends:

- `max_completion_tokens` instead of the deprecated `max_tokens`
- `parallel_tool_calls: false`
- `reasoning_effort: "low"` for `openai/gpt-oss-*` models
- no DeepSeek `thinking` field
- no `temperature` override

Groq's API reference documents `max_completion_tokens`, `parallel_tool_calls`, and `reasoning_effort` for GPT-OSS models. Local tool calling is supported through the standard OpenAI-style `tools` / `tool_calls` flow. See:

- [Groq API reference](https://console.groq.com/docs/api-reference#chat-create)
- [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)
- [Groq reasoning](https://console.groq.com/docs/reasoning)
- [GPT-OSS 120B on Groq](https://console.groq.com/docs/model/openai/gpt-oss-120b)

### Verify Groq

1. Fill the variables above in `.env.local`.
2. Restart with `npm run dev`.
3. Open `/admin` and check **Settings → AI model**: it should show `groq · openai/gpt-oss-120b · live`.
4. Open the customer page and ask: “What services do you offer?”
5. Then test a booking: “Do you have anything tomorrow afternoon for a Signature Facial?”

If the model returns a 401/403/404/400, the UI falls back to the deterministic bot; the server log includes the provider status but not the key or full upstream response. Common causes:

| Status | Check |
|---|---|
| 401 | `GROQ_API_KEY` is present, current, and belongs to the right organization |
| 403 | The key has permission to use the model |
| 404 | `GROQ_BASE_URL` and `GROQ_MODEL` are exact |
| 400 / 422 | The selected model does not support the request or tool calling |
| 429 | Groq rate limit or quota |

Groq's on-demand/free tier can use a low tokens-per-minute limit (for example 8,000 TPM). A single booking turn may make two model calls (tool call + final answer), so a multi-turn conversation can hit 429 even when the first answer works. The app honors `Retry-After` for up to 10 seconds and retries once; if the limit persists it falls back to the deterministic bot. For production, use a higher Groq tier or reduce the prompt/history size.

## Other OpenAI-compatible providers

```env
AI_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_BASE_URL=https://provider.example/v1
OPENAI_COMPATIBLE_MODEL=provider/model-name
```

Rules for the base URL:

- Must be HTTPS, except `http://localhost`, `http://127.0.0.1`, or `http://[::1]` for local testing.
- Must not contain a username, password, query string, or fragment.
- Must be the base path only. Do **not** append `/chat/completions`; the app adds it.

The endpoint must implement the OpenAI chat-completions API with:

- `messages`
- `tools` with function schemas
- assistant `tool_calls`
- `tool` role messages
- a string or null `message.content`

The generic adapter sends `max_tokens` and `temperature`. If your provider uses different parameter names or rejects those parameters, use the Groq/DeepSeek adapters or extend `buildModelRequest` in [lib/ai/provider.ts](../lib/ai/provider.ts).

## Security and reliability

- Keys are read only on the server.
- The client never receives keys, base URLs, or raw upstream error bodies.
- HTTPS is required except loopback testing.
- Redirects are rejected so an `Authorization` header cannot be forwarded to another origin.
- The request has a bounded timeout (`AI_TIMEOUT_MS`, clamped between 1 and 60 seconds).
- Automatic retry happens only for explicit 429/5xx responses. The client never switches providers or models automatically.
- An invalid or incomplete model response does not execute partial tool calls.
- If the selected provider is unavailable, the app uses the fallback bot and reports `degraded` mode in the chat response.

## What remains provider-independent

The model only chooses tools and writes customer-facing text. The following remains authoritative in the app:

- service catalog and prices
- business hours and buffers
- availability calculation
- booking drafts and confirmation guard
- SQLite appointment records
- Google Calendar reads/writes
- cancellation cutoff policy
- admin authentication
