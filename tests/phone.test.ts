import { describe, expect, it } from "vitest";

import { isConfirmationUtterance } from "@/lib/ai/confirmation";
import { formatPhone, normalizePhone, phoneMatches } from "@/lib/domain/phone";

describe("phone handling", () => {
  it("normalizes punctuation and country codes", () => {
    expect(normalizePhone("+1 (555) 018-8200")).toBe("15550188200");
    expect(normalizePhone("555.018.8200")).toBe("5550188200");
    expect(phoneMatches("5550188200", "+1 (555) 018-8200")).toBe(true);
    expect(phoneMatches("15550188200", "+1 (555) 018-8200")).toBe(true);
  });

  it("formats common US numbers", () => {
    expect(formatPhone("5550188200")).toBe("(555) 018-8200");
    expect(formatPhone("15550188200")).toBe("+1 (555) 018-8200");
  });
});

describe("confirmation detection", () => {
  it("accepts clear confirmations", () => {
    for (const phrase of ["yes", "confirm", "book it", "sounds good", "确认", "可以"]) {
      expect(isConfirmationUtterance(phrase)).toBe(true);
    }
  });

  it("rejects negations and questions", () => {
    for (const phrase of ["no", "not yet", "wait", "取消", "先不"]) {
      expect(isConfirmationUtterance(phrase)).toBe(false);
    }
  });
});
