import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema";
import { seedDatabase } from "./seed";
import { newId, nowIso, tableCount } from "./utils";

export type Db = DatabaseSync;

export { newId, nowIso, tableCount };

const DEFAULT_DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");

export function openDatabase(
  filename: string = DEFAULT_DB_PATH,
  options: { seed?: boolean; demo?: boolean } = {},
): Db {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
  }
  db.exec(SCHEMA_SQL);
  if (options.seed !== false) {
    seedDatabase(db, {
      demo: options.demo ?? process.env.SEED_DEMO !== "false",
    });
  }
  return db;
}

const globalForDb = globalThis as unknown as { __lumaDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__lumaDb) {
    globalForDb.__lumaDb = openDatabase();
  }
  return globalForDb.__lumaDb;
}

export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures; the original error is more useful.
    }
    throw error;
  }
}
