import { formatInTimeZone } from "date-fns-tz";

import type { Appointment, BusinessSettings } from "@/lib/types";

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 73) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

function utcStamp(iso: string): string {
  return formatInTimeZone(new Date(iso), "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

export function buildIcs(appointment: Appointment, settings: BusinessSettings): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Luma Studio//AI Receptionist//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointment.code}@luma-receptionist.local`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(appointment.startAt)}`,
    `DTEND:${utcStamp(appointment.endAt)}`,
    `SUMMARY:${escapeIcs(`Appointment · ${appointment.serviceName}`)}`,
    `DESCRIPTION:${escapeIcs(
      `Booking code: ${appointment.code}\nTeam member: ${appointment.staffName}\nService: ${appointment.serviceName}\nStudio: ${settings.businessName}\nAddress: ${settings.address}`,
    )}`,
    `LOCATION:${escapeIcs(settings.address)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
