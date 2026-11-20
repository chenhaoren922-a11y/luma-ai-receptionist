import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Database } from "sql.js";
import initSqlJs from "sql.js/dist/sql-asm.js";

import { requestDatabase } from "./scope";
import { SCHEMA_SQL } from "./schema";
import { seedDatabase } from "./seed";
import { newId, nowIso, tableCount } from "./utils";

type Value = Exclude<SQLInputValue, ArrayBufferView> | Uint8Array;
type Row = Record<string, unknown>;
type Statement = {
  get(...values: Value[]): Row | undefined;
  all(...values: Value[]): Row[];
  run(...values: Value[]): void;
};

export type Db = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
};

export { newId, nowIso, tableCount };

const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.join(process.env.LUMA_DATA_DIR || path.join(process.cwd(), "data"), "app.db");

function initializeDatabase(db: Db, options: { seed?: boolean; demo?: boolean }): Db {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  if (options.seed !== false) {
    seedDatabase(db, { demo: options.demo ?? process.env.SEED_DEMO !== "false" });
  }
  return db;
}

export function openDatabase(
  filename: string = DEFAULT_DB_PATH,
  options: { seed?: boolean; demo?: boolean } = {},
): Db {
  const sqlite = process.getBuiltinModule?.("node:sqlite") as { DatabaseSync: typeof DatabaseSync } | undefined;
  if (!sqlite) throw new Error("Persistent SQLite requires Node.js 22.13+ or 24. Use npm run dev:bolt for Bolt preview.");
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new sqlite.DatabaseSync(filename);
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
  }
  return initializeDatabase(db, options);
}

function previewDatabase(database: Database): Db {
  return {
    exec: (sql) => { database.run(sql); },
    close: () => database.close(),
    prepare(sql) {
      function read(values: Value[], firstOnly: boolean): Row[] {
        const statement = database.prepare(sql);
        try {
          statement.bind(values.map((value) => typeof value === "bigint" ? value.toString() : value));
          const rows: Row[] = [];
          while (statement.step()) {
            rows.push(statement.getAsObject());
            if (firstOnly) break;
          }
          return rows;
        } finally {
          statement.free();
        }
      }
      return {
        get: (...values) => read(values, true)[0],
        all: (...values) => read(values, false),
        run: (...values) => { read(values, true); },
      };
    },
  };
}

export async function openPortableDatabase(data?: Uint8Array): Promise<Db & { snapshot(): ArrayBuffer }> {
  const sqlite = await initSqlJs();
  const database = new sqlite.Database(data);
  const db = previewDatabase(database);
  try {
    initializeDatabase(db, { seed: !data });
    return {
      ...db,
      snapshot: () => Uint8Array.from(database.export()).buffer,
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

async function createDatabase(): Promise<Db> {
  if (process.env.LUMA_BOLT_PREVIEW === "1" && process.env.NODE_ENV === "development") {
    const sqlite = await initSqlJs();
    return initializeDatabase(previewDatabase(new sqlite.Database()), {});
  }
  return openDatabase();
}

const globalForDb = globalThis as typeof globalThis & { __lumaDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  const requestDb = requestDatabase();
  if (requestDb) return Promise.resolve(requestDb);
  globalForDb.__lumaDb ??= createDatabase().catch((error) => {
    delete globalForDb.__lumaDb;
    throw error;
  });
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
      // Preserve the original error.
    }
    throw error;
  }
}
