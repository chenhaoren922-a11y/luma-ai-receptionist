import { NextResponse } from "next/server";

import { AppError, errorResponse } from "@/lib/errors";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function routeError(error: unknown): NextResponse {
  const { status, body } = errorResponse(error);
  return NextResponse.json(body, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "Please send valid JSON.");
  }
}

export function numberField(
  body: unknown,
  field: string,
  options: { required?: boolean; min?: number; max?: number; fallback?: number } = {},
): number | undefined {
  if (!body || typeof body !== "object") {
    if (options.required) throw new AppError("INVALID_BODY", "A JSON body is required.");
    return options.fallback;
  }
  const raw = (body as Record<string, unknown>)[field];
  if (raw === undefined || raw === null || raw === "") {
    if (options.required) throw new AppError("MISSING_FIELD", `Missing field: ${field}.`);
    return options.fallback;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new AppError("INVALID_FIELD", `${field} must be a number.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new AppError("INVALID_FIELD", `${field} must be at least ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new AppError("INVALID_FIELD", `${field} must be at most ${options.max}.`);
  }
  return value;
}

export function booleanField(
  body: unknown,
  field: string,
  fallback = false,
): boolean {
  if (!body || typeof body !== "object") return fallback;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "boolean" ? value : Boolean(value);
}

export function stringArrayField(body: unknown, field: string): string[] {
  if (!body || typeof body !== "object") return [];
  const value = (body as Record<string, unknown>)[field];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function stringField(
  body: unknown,
  field: string,
  options: { required?: boolean; max?: number } = {},
): string | undefined {
  if (!body || typeof body !== "object") {
    if (options.required) throw new AppError("INVALID_BODY", "A JSON body is required.");
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new AppError("MISSING_FIELD", `Missing field: ${field}.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AppError("INVALID_FIELD", `${field} must be a string.`);
  }
  if (options.max && value.length > options.max) {
    throw new AppError("FIELD_TOO_LONG", `${field} is too long.`);
  }
  return value;
}
