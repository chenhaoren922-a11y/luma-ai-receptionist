import { afterEach, expect, test, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { withNetlifyDatabase } from "@/lib/db/netlify";

const store = vi.hoisted(() => {
  let entry: { data: ArrayBuffer; etag: string; metadata: Record<string, unknown> } | null = null;
  let revision = 0;
  return {
    reset() { entry = null; revision = 0; },
    async getWithMetadata() { return entry; },
    async set(_key: string, data: ArrayBuffer, options: {
      onlyIfNew?: boolean;
      onlyIfMatch?: string;
      metadata?: Record<string, unknown>;
    }) {
      if ((options.onlyIfNew && entry) ||
          (options.onlyIfMatch && options.onlyIfMatch !== entry?.etag)) return { modified: false };
      const etag = String(++revision);
      entry = { data, etag, metadata: options.metadata ?? {} };
      return { modified: true, etag };
    },
  };
});

vi.mock("@netlify/blobs", () => ({ getStore: () => store }));

afterEach(() => {
  store.reset();
  vi.unstubAllEnvs();
});

test("Netlify write requests serialize and persist in SQLite across reads", async () => {
  vi.stubEnv("LUMA_NETLIFY_BLOBS", "1");
  vi.stubEnv("SEED_DEMO", "false");
  const increment = withNetlifyDatabase(async () => {
    const db = await getDb();
    db.prepare(`INSERT INTO settings(key, value) VALUES ('counter', '1')
      ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`).run();
    return "saved";
  }, true);

  await expect(Promise.all([increment(), increment()])).resolves.toEqual(["saved", "saved"]);
  const read = withNetlifyDatabase(async () => {
    const db = await getDb();
    return db.prepare("SELECT value FROM settings WHERE key = 'counter'").get()?.value;
  });
  await expect(read()).resolves.toBe("2");
});
