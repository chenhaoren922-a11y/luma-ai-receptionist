import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "./client";

export const databaseScope = new AsyncLocalStorage<Db>();

export function requestDatabase() {
  return databaseScope.getStore();
}
