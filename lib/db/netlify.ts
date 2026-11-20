import { randomFillSync } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { getStore } from "@netlify/blobs";

import { AppError } from "@/lib/errors";
import { routeError } from "@/lib/http";
import { openPortableDatabase } from "./client";
import { databaseScope } from "./scope";

const databaseKey = "app.db";
const lockDurationMs = 120_000;
function useNetlifyStorage() {
  return process.env.LUMA_NETLIFY_BLOBS === "1" ||
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT ||
      (globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext);
}

function storage() {
  return getStore({
    name: "luma-sqlite",
    consistency: "strong",
    fetch: async (input, init) => {
      try {
        const response = await fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (response.status < 500 && response.status !== 429) return response;
        console.error("[sqlite storage]", init?.method, "HTTP", response.status);
        await response.body?.cancel();
      } catch (error) {
        console.error("[sqlite storage]", init?.method, error instanceof Error ? error.name : "fetch failed");
      }
      // Let the request fail promptly rather than exhausting the function's execution time in SDK retries.
      return new Response("Storage is temporarily unavailable.", { status: 400 });
    },
  });
}

async function read(store: ReturnType<typeof storage>) {
  return store.getWithMetadata(databaseKey, { type: "arrayBuffer" });
}

function bytes(value: ArrayBuffer) {
  return new Uint8Array(value, 16);
}

function versioned(data: Uint8Array): ArrayBuffer {
  // Each lease must have a distinct ETag even when the SQLite contents are unchanged.
  const version = new Uint8Array(16 + data.length);
  randomFillSync(version.subarray(0, 16));
  version.set(data, 16);
  return version.buffer;
}

async function load(store: ReturnType<typeof storage>) {
  const snapshot = await read(store);
  if (snapshot) return snapshot;

  const db = await openPortableDatabase();
  try {
    await store.set(databaseKey, versioned(new Uint8Array(db.snapshot())), { onlyIfNew: true });
    console.info("[sqlite storage] initial snapshot submitted");
  } finally {
    db.close();
  }
  const initial = await read(store);
  if (!initial) throw new Error("SQLite snapshot could not be initialized.");
  return initial;
}

async function runWithStorage<T>(write: boolean, run: () => Promise<T>): Promise<T> {
  const store = storage();

  for (let attempt = 0; attempt < 12; attempt++) {
    const snapshot = await load(store);
    if (!write) {
      const db = await openPortableDatabase(bytes(snapshot.data));
      try {
        return await databaseScope.run(db, run);
      } finally {
        db.close();
      }
    }

    if (!snapshot.etag) throw new Error("SQLite snapshot has no ETag.");
    if (Number(snapshot.metadata.lockUntil ?? 0) <= Date.now()) {
      const lease = await store.set(databaseKey, versioned(bytes(snapshot.data)), {
        onlyIfMatch: snapshot.etag,
        metadata: { lockUntil: Date.now() + lockDurationMs },
      });
      if (lease.modified) {
        const etag = lease.etag;
        if (!etag) throw new Error("SQLite write lease has no ETag.");
        let committed = false;
        try {
          const db = await openPortableDatabase(bytes(snapshot.data));
          try {
            const result = await databaseScope.run(db, run);
            const saved = await store.set(databaseKey, versioned(new Uint8Array(db.snapshot())), { onlyIfMatch: etag });
            if (!saved.modified) throw new Error("SQLite write lease expired before commit.");
            committed = true;
            return result;
          } finally {
            db.close();
          }
        } finally {
          if (!committed) {
            await store.set(databaseKey, versioned(bytes(snapshot.data)), { onlyIfMatch: etag }).catch((error) => {
              console.error("[sqlite lease]", error);
            });
          }
        }
      }
    }
    await setTimeout(120 + Math.random() * 80);
  }

  throw new AppError("DATABASE_BUSY", "The booking system is busy. Please try again.", 503);
}

export function withNetlifyDatabase<Args extends unknown[], T>(
  handler: (...args: Args) => Promise<T>,
  write = false,
): (...args: Args) => Promise<T | Response> {
  return async (...args) => {
    if (!useNetlifyStorage()) return handler(...args);
    try {
      return await runWithStorage(write, () => handler(...args));
    } catch (error) {
      return routeError(error);
    }
  };
}
