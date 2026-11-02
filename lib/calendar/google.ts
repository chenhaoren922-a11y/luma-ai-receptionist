import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

import type { Db } from "@/lib/db/client";
import { getSettings } from "@/lib/data/settings";
import { AppError } from "@/lib/errors";
import type {
  CalendarBusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarProvider,
  CalendarStatus,
} from "./types";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export type StoredGoogleToken = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
};

const TOKEN_PATH = path.join(process.cwd(), "data", "google-token.json");

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.APP_URL || "http://localhost:3000"}/api/google/callback`
  );
}

export function createOAuthClient() {
  if (!isGoogleConfigured()) {
    throw new AppError(
      "GOOGLE_NOT_CONFIGURED",
      "Google Calendar is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart.",
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
}

export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

export function readGoogleToken(): StoredGoogleToken | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredGoogleToken;
    return parsed.refresh_token || parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

export function hasGoogleToken(): boolean {
  return Boolean(readGoogleToken());
}

export function saveGoogleToken(token: StoredGoogleToken): void {
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function clearGoogleToken(): void {
  try {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  } catch {
    // Ignore cleanup failures; the UI will still report a disconnected state.
  }
}

export function getAuthorizedOAuthClient() {
  const token = readGoogleToken();
  if (!token) return null;
  const client = createOAuthClient();
  client.setCredentials(token);
  client.on("tokens", (fresh) => {
    const current = readGoogleToken() ?? {};
    saveGoogleToken({ ...current, ...fresh });
  });
  return client;
}

export async function exchangeCode(code: string): Promise<StoredGoogleToken> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new AppError("GOOGLE_AUTH_FAILED", "Google did not return an access token.");
  }
  saveGoogleToken(tokens as StoredGoogleToken);
  return tokens as StoredGoogleToken;
}

export async function disconnectGoogle(): Promise<void> {
  const client = getAuthorizedOAuthClient();
  if (client) {
    try {
      await client.revokeToken((readGoogleToken()?.refresh_token as string) ?? "");
    } catch {
      // Revocation is best effort; clearing the local token is what matters.
    }
  }
  clearGoogleToken();
}

export function calendarStatus(db: Db): CalendarStatus {
  const configured = isGoogleConfigured();
  const connected = configured && hasGoogleToken();
  const calendarId = getSettings(db).googleCalendarId || "primary";
  let message = "Google Calendar is not configured. Local scheduling is active.";
  if (configured && !connected) {
    message = "Google is configured. Connect your calendar in Admin → Settings.";
  } else if (connected) {
    message = "Google Calendar is connected. New bookings are synced automatically.";
  }
  return { configured, connected, calendarId, message };
}

export type GoogleEvent = {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  transparency?: string | null;
  start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
};

export function buildGoogleEventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startAt, timeZone: input.timezone },
    end: { dateTime: input.endAt, timeZone: input.timezone },
    transparency: "opaque",
    extendedProperties: {
      private: {
        aiReceptionist: "1",
        bookingCode: input.bookingCode,
        serviceId: input.serviceId,
        staffId: input.staffId,
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 },
        { method: "popup", minutes: 60 },
      ],
    },
  };
}

export function mapGoogleEventToBusy(
  event: GoogleEvent,
): CalendarBusyInterval | null {
  if (event.status === "cancelled" || event.transparency === "transparent") return null;
  const privateProps = event.extendedProperties?.private ?? {};
  if (privateProps.aiReceptionist === "1") return null;
  const staffId = privateProps.staffId || null;

  if (event.start?.date) {
    return {
      startAt: `${event.start.date}T00:00:00`,
      endAt: `${event.end?.date ?? event.start.date}T00:00:00`,
      allDay: true,
      localDate: event.start.date,
      localEndDate: event.end?.date ?? event.start.date,
      staffId,
      source: "external",
      summary: event.summary ?? undefined,
    };
  }

  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    staffId,
    source: "external",
    summary: event.summary ?? undefined,
  };
}

function isRetryable(error: unknown): boolean {
  const candidate = error as {
    code?: number;
    response?: { status?: number };
    status?: number;
  };
  const status = candidate.response?.status ?? candidate.code ?? candidate.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw lastError;
}

function googleError(error: unknown, fallbackCode: string, fallbackMessage: string): AppError {
  const candidate = error as {
    response?: { status?: number; data?: { error?: { message?: string } } };
    message?: string;
  };
  const status = candidate.response?.status;
  const providerMessage = candidate.response?.data?.error?.message || candidate.message;
  console.error(
    "[google-calendar]",
    status ?? "no-status",
    providerMessage ?? fallbackMessage,
  );

  if (status === 401) {
    return new AppError(
      "GOOGLE_AUTH_EXPIRED",
      "Google Calendar authorization has expired. Reconnect it in Admin → Settings.",
      502,
    );
  }

  if (status === 403) {
    if (
      /has not been used|disabled|accessNotConfigured|SERVICE_DISABLED|enable it/i.test(
        providerMessage ?? "",
      )
    ) {
      return new AppError(
        "CALENDAR_API_DISABLED",
        "Google Calendar API is not enabled for this Google Cloud project. Enable it in APIs & Services → Library → Google Calendar API, wait a few minutes, then reconnect in Admin → Settings.",
        502,
      );
    }
    if (/insufficient|scope|permission|forbidden/i.test(providerMessage ?? "")) {
      return new AppError(
        "CALENDAR_SCOPE_MISSING",
        "Google Calendar rejected the authorization. Disconnect and reconnect in Admin → Settings, and approve the calendar.events permission.",
        502,
      );
    }
    return new AppError(
      "CALENDAR_FORBIDDEN",
      `Google Calendar rejected the request: ${providerMessage ?? "forbidden"}.`,
      502,
    );
  }

  return new AppError(
    fallbackCode,
    providerMessage
      ? `${fallbackMessage} (${providerMessage})`
      : fallbackMessage,
    502,
  );
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly kind = "google" as const;
  private calendarId: string;
  private auth: NonNullable<ReturnType<typeof getAuthorizedOAuthClient>>;

  constructor(calendarId: string, auth: NonNullable<ReturnType<typeof getAuthorizedOAuthClient>>) {
    this.calendarId = calendarId || "primary";
    this.auth = auth;
  }

  isConnected(): boolean {
    return true;
  }

  private client() {
    return google.calendar({ version: "v3", auth: this.auth });
  }

  async listBusy(startIso: string, endIso: string): Promise<CalendarBusyInterval[]> {
    const calendar = this.client();
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    try {
      do {
        const response = await retry(() =>
          calendar.events.list({
            calendarId: this.calendarId,
            timeMin: startIso,
            timeMax: endIso,
            singleEvents: true,
            orderBy: "startTime",
            showDeleted: false,
            maxResults: 2500,
            pageToken,
          }),
        );
        events.push(...((response.data.items ?? []) as GoogleEvent[]));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      throw googleError(
        error,
        "CALENDAR_UNAVAILABLE",
        "I could not read the studio calendar just now.",
      );
    }

    return events
      .map(mapGoogleEventToBusy)
      .filter((interval): interval is CalendarBusyInterval => interval !== null);
  }

  private eventBody(input: CalendarEventInput) {
    return buildGoogleEventBody(input);
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
    const calendar = this.client();
    try {
      const existing = await retry(() =>
        calendar.events.list({
          calendarId: this.calendarId,
          privateExtendedProperty: [
            "aiReceptionist=1",
            `bookingCode=${input.bookingCode}`,
          ],
          maxResults: 10,
          showDeleted: false,
        }),
      );
      const found = existing.data.items?.[0];
      if (found?.id) {
        await retry(() =>
          calendar.events.patch({
            calendarId: this.calendarId,
            eventId: found.id as string,
            requestBody: this.eventBody(input),
          }),
        );
        return { id: found.id, htmlLink: found.htmlLink ?? undefined };
      }

      const response = await retry(() =>
        calendar.events.insert({
          calendarId: this.calendarId,
          requestBody: this.eventBody(input),
        }),
      );
      if (!response.data.id) {
        throw new Error("Google did not return an event id.");
      }
      return { id: response.data.id, htmlLink: response.data.htmlLink ?? undefined };
    } catch (error) {
      throw googleError(
        error,
        "CALENDAR_CREATE_FAILED",
        "The appointment could not be added to Google Calendar, so it was not confirmed.",
      );
    }
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<void> {
    const calendar = this.client();
    try {
      await retry(() =>
        calendar.events.patch({
          calendarId: this.calendarId,
          eventId,
          requestBody: this.eventBody(input),
        }),
      );
    } catch (error) {
      throw googleError(
        error,
        "CALENDAR_UPDATE_FAILED",
        "The appointment could not be updated in Google Calendar.",
      );
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    const calendar = this.client();
    try {
      await retry(() =>
        calendar.events.delete({
          calendarId: this.calendarId,
          eventId,
        }),
      );
    } catch (error) {
      const candidate = error as { code?: number; response?: { status?: number } };
      const status = candidate.response?.status ?? candidate.code;
      if (status === 404 || status === 410) return;
      throw googleError(
        error,
        "CALENDAR_DELETE_FAILED",
        "The appointment could not be removed from Google Calendar.",
      );
    }
  }

  async testConnection(): Promise<{ ok: boolean; calendarId: string; summary?: string }> {
    const calendar = this.client();
    try {
      // Reading one event is enough to prove the calendar.events scope works and
      // avoids requiring the broader calendar.readonly scope just for a health check.
      const response = await retry(() =>
        calendar.events.list({
          calendarId: this.calendarId,
          maxResults: 1,
          timeMin: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
          timeMax: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
          singleEvents: true,
        }),
      );
      return {
        ok: true,
        calendarId: this.calendarId,
        summary: response.data.summary ?? undefined,
      };
    } catch (error) {
      throw googleError(
        error,
        "CALENDAR_UNAVAILABLE",
        "I could not reach that Google Calendar with the current authorization.",
      );
    }
  }
}

export async function getGoogleCalendarProvider(
  db: Db,
): Promise<GoogleCalendarProvider | null> {
  if (!isGoogleConfigured() || !hasGoogleToken()) return null;
  const auth = getAuthorizedOAuthClient();
  if (!auth) return null;
  const settings = getSettings(db);
  return new GoogleCalendarProvider(settings.googleCalendarId, auth);
}
