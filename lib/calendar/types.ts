export type CalendarBusyInterval = {
  startAt: string;
  endAt: string;
  allDay?: boolean;
  localDate?: string;
  localEndDate?: string;
  staffId?: string | null;
  source: "google" | "external" | "local";
  summary?: string;
};

export type CalendarEventInput = {
  summary: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  timezone: string;
  bookingCode: string;
  serviceId: string;
  staffId: string;
  customerName: string;
  phone: string;
  notes: string;
};

export type CalendarEventResult = {
  id: string;
  htmlLink?: string;
};

export type CalendarProvider = {
  readonly kind: "local" | "google";
  isConnected(): boolean;
  listBusy(startIso: string, endIso: string): Promise<CalendarBusyInterval[]>;
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(eventId: string, input: CalendarEventInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  testConnection?(): Promise<{ ok: boolean; calendarId: string; summary?: string }>;
};

export type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  calendarId: string;
  message: string;
};
