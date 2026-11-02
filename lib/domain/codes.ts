import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBookingCode(): string {
  let value = "";
  for (let index = 0; index < 6; index += 1) {
    value += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `LUMA-${value}`;
}
