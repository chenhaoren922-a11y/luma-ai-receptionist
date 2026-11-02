import { AppError } from "@/lib/errors";

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= 10 && digits.length <= 15;
}

export function requirePhone(input: string): string {
  const normalized = normalizePhone(input);
  if (normalized.length < 10 || normalized.length > 15) {
    throw new AppError(
      "INVALID_PHONE",
      "Please share a phone number with 10 to 15 digits so we can confirm your appointment.",
    );
  }
  return normalized;
}

export function formatPhone(input: string): string {
  const digits = normalizePhone(input);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return input;
}

export function phoneMatches(stored: string, provided: string): boolean {
  const left = normalizePhone(stored);
  const right = normalizePhone(provided);
  if (left === right) return true;
  if (left.length === 10 && right.length === 11 && right.startsWith("1")) {
    return right.slice(1) === left;
  }
  if (right.length === 10 && left.length === 11 && left.startsWith("1")) {
    return left.slice(1) === right;
  }
  return false;
}
