const CONFIRMATION_PATTERNS = [
  /\b(yes|yeah|yep|yup|sure|okay|ok|confirm|confirmed|book it|go ahead|please do|sounds good|that works|perfect|do it)\b/i,
  /(确认|确定|可以|好的|好|就这个|就它|预约吧|帮我约|没问题)/,
];

const NEGATIVE_PATTERNS = [
  /\b(no|nope|not yet|don't|do not|cancel that|wait)\b/i,
  /(不|不要|先不|等等|取消)/,
];

export function isConfirmationUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (NEGATIVE_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  return CONFIRMATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function looksLikePhone(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
