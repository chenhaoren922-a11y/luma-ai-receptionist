import { randomUUID } from "node:crypto";

import type { Db } from "./client";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  return `${prefix}${randomUUID()}`;
}

export function tableCount(db: Db, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
    | { count: number }
    | undefined;
  return Number(row?.count ?? 0);
}
