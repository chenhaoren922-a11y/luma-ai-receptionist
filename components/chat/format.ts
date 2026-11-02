import type { BusinessHours, BusinessSettings } from "@/lib/types";

export function formatTime12(value: string): string {
  const [hourRaw, minute] = value.split(":").map(Number);
  const hour = hourRaw % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${hourRaw >= 12 ? "PM" : "AM"}`;
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDateLabel(dateKey: string, timezone: string): string {
  try {
    const date = new Date(`${dateKey}T12:00:00`);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateKey;
  }
}

function storeParts(timezone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { day: day === -1 ? 0 : day, minutes: hour * 60 + minute };
}

export function storeStatus(settings: BusinessSettings): { open: boolean; label: string } {
  const { day, minutes } = storeParts(settings.timezone);
  const hours = settings.hours[String(day)];
  if (!hours || hours.closed) return { open: false, label: "Closed today" };
  const open = Number(hours.open.split(":")[0]) * 60 + Number(hours.open.split(":")[1]);
  const close = Number(hours.close.split(":")[0]) * 60 + Number(hours.close.split(":")[1]);
  const breakStart = hours.breakStart
    ? Number(hours.breakStart.split(":")[0]) * 60 + Number(hours.breakStart.split(":")[1])
    : null;
  const breakEnd = hours.breakEnd
    ? Number(hours.breakEnd.split(":")[0]) * 60 + Number(hours.breakEnd.split(":")[1])
    : null;
  const onBreak =
    breakStart !== null && breakEnd !== null && minutes >= breakStart && minutes < breakEnd;
  if (minutes < open) return { open: false, label: `Opens at ${formatTime12(hours.open)}` };
  if (minutes >= close) return { open: false, label: "Closed for today" };
  if (onBreak) return { open: false, label: `Back at ${formatTime12(hours.breakEnd ?? hours.close)}` };
  return { open: true, label: `Open until ${formatTime12(hours.close)}` };
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function signature(hours: BusinessHours[string] | undefined): string {
  if (!hours || hours.closed) return "closed";
  return `${hours.open}-${hours.close}-${hours.breakStart ?? ""}-${hours.breakEnd ?? ""}`;
}

export function summarizeHours(hours: BusinessHours): string[] {
  const groups: Array<{ days: number[]; signature: string }> = [];
  for (const day of DAY_ORDER) {
    const sig = signature(hours[String(day)]);
    const last = groups[groups.length - 1];
    if (last && last.signature === sig) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], signature: sig });
    }
  }
  return groups.map((group) => {
    const first = DAY_LABEL[group.days[0]];
    const last = DAY_LABEL[group.days[group.days.length - 1]];
    const dayLabel =
      group.days.length === 1 ? first : group.days.length === 2 ? `${first}–${last}` : `${first}–${last}`;
    if (group.signature === "closed") return `${dayLabel} · Closed`;
    const day = hours[String(group.days[0])];
    const breakText =
      day.breakStart && day.breakEnd
        ? ` · break ${formatTime12(day.breakStart)}–${formatTime12(day.breakEnd)}`
        : "";
    return `${dayLabel} · ${formatTime12(day.open)}–${formatTime12(day.close)}${breakText}`;
  });
}
