const base = process.env.APP_URL || "http://localhost:3000";

async function get(path) {
  const response = await fetch(new URL(path, base));
  const data = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

const health = await get("/api/health");
const bootstrap = await get("/api/bootstrap");

const chatResponse = await fetch(new URL("/api/chat", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello" }),
});
const chat = await chatResponse.json();
if (!chatResponse.ok) throw new Error(`chat failed: ${JSON.stringify(chat)}`);

console.log(
  JSON.stringify(
    {
      ok: true,
      business: health.business,
      timezone: health.timezone,
      services: bootstrap.services.length,
      staff: bootstrap.staff.length,
      aiMode: bootstrap.aiMode,
      chatMode: chat.mode,
      reply: chat.message?.content?.slice(0, 120),
    },
    null,
    2,
  ),
);
