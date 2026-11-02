export type DayHours = {
  closed: boolean;
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
};

export type BusinessHours = Record<string, DayHours>;

export type BusinessSettings = {
  businessName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  hours: BusinessHours;
  slotIntervalMin: number;
  leadTimeMin: number;
  maxAdvanceDays: number;
  cancellationCutoffHours: number;
  googleCalendarId: string;
  aiName: string;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  currency: string;
  category: string;
  color: string;
  active: boolean;
  sortOrder: number;
};

export type Staff = {
  id: string;
  name: string;
  title: string;
  bio: string;
  active: boolean;
  color: string;
  serviceIds: string[];
};

export type ServiceSummary = Pick<
  Service,
  "id" | "name" | "description" | "durationMin" | "priceCents" | "currency" | "category" | "color"
>;

export type StaffSummary = Pick<Staff, "id" | "name" | "title" | "color">;

export type AvailabilitySlot = {
  startAt: string;
  startLocal: string;
  label: string;
  staffIds: string[];
  staffNames: string[];
};

export type AppointmentStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export type Appointment = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  priceCents: number;
  currency: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  bufferMin: number;
  status: AppointmentStatus;
  source: string;
  notes: string;
  googleEventId: string | null;
  googleCalendarId: string | null;
  syncStatus: "local_only" | "synced" | "sync_failed" | "not_configured";
  createdAt: string;
  updatedAt: string;
};

export type AppointmentSummary = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  status: AppointmentStatus;
  priceCents: number;
  currency: string;
  address: string;
  syncStatus: Appointment["syncStatus"];
};

export type DraftSummary = {
  draftId: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  durationMin: number;
  priceCents: number;
  currency: string;
  customerName: string;
  phone: string;
  address: string;
  expiresAt: string;
};

export type BookingDraft = {
  id: string;
  conversationId: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  endAt: string;
  customerName: string;
  phone: string;
  notes: string;
  status: "pending" | "confirmed" | "expired" | "cancelled";
  expiresAt: string;
  confirmedAppointmentId: string | null;
};

export type Faq = {
  id: string;
  question: string;
  answer: string;
  keywords: string;
  category: string;
  sortOrder: number;
  active: boolean;
};

export type ConversationStatus = "active" | "handed_off" | "closed";

export type Handoff = {
  id: string;
  conversationId: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  uiJson: string | null;
  createdAt: string;
};

export type ServicesUiBlock = {
  type: "services";
  services: ServiceSummary[];
};

export type SlotsUiBlock = {
  type: "slots";
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
};

export type DraftUiBlock = {
  type: "draft";
  draft: DraftSummary;
};

export type BookingUiBlock = {
  type: "booking";
  appointment: AppointmentSummary;
  icsUrl: string;
};

export type AppointmentsUiBlock = {
  type: "appointments";
  appointments: AppointmentSummary[];
};

export type HandoffUiBlock = {
  type: "handoff";
  phone: string;
  reason: string;
};

export type ErrorUiBlock = {
  type: "error";
  message: string;
};

export type UiBlock =
  | ServicesUiBlock
  | SlotsUiBlock
  | DraftUiBlock
  | BookingUiBlock
  | AppointmentsUiBlock
  | HandoffUiBlock
  | ErrorUiBlock;

export type ChatResponse = {
  sessionId: string;
  message: {
    id: string;
    role: "assistant";
    content: string;
    ui: UiBlock[];
  };
  mode: "live" | "fallback" | "degraded";
};

export type BootstrapResponse = {
  business: BusinessSettings;
  services: ServiceSummary[];
  staff: StaffSummary[];
  googleConnected: boolean;
  googleConfigured: boolean;
  aiMode: "live" | "fallback";
  aiProvider: string;
  aiModel: string;
  aiConfigured: boolean;
  aiError?: string;
  serverNow: string;
};

export type AdminSession = {
  authenticated: boolean;
  expiresAt?: string;
};
