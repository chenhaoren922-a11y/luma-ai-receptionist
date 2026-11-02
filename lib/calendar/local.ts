import { AppError } from "@/lib/errors";
import type {
  CalendarBusyInterval,
  CalendarEventInput,
  CalendarEventResult,
  CalendarProvider,
} from "./types";

export class LocalCalendarProvider implements CalendarProvider {
  readonly kind = "local" as const;

  isConnected(): boolean {
    return true;
  }

  async listBusy(): Promise<CalendarBusyInterval[]> {
    return [];
  }

  async createEvent(): Promise<CalendarEventResult> {
    throw new AppError(
      "CALENDAR_NOT_CONNECTED",
      "Google Calendar is not connected. The booking was saved locally only.",
    );
  }

  async updateEvent(_eventId: string, _input: CalendarEventInput): Promise<void> {
    throw new AppError("CALENDAR_NOT_CONNECTED", "Google Calendar is not connected.");
  }

  async deleteEvent(): Promise<void> {
    throw new AppError("CALENDAR_NOT_CONNECTED", "Google Calendar is not connected.");
  }
}
