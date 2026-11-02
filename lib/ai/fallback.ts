import type { Db } from "@/lib/db/client";
import type { ConversationRecord } from "@/lib/data/conversations";
import {
  createHandoff,
  updateConversationCustomer,
  updateConversationState,
} from "@/lib/data/conversations";
import { getFaqs, getServices } from "@/lib/data/catalog";
import { getSettings } from "@/lib/data/settings";
import {
  appointmentSummary,
  getAppointmentByCode,
  getAppointmentsForCustomer,
} from "@/lib/data/appointments";
import {
  cancelAppointment,
  confirmDraft,
  prepareBooking,
  rescheduleAppointment,
} from "@/lib/domain/booking";
import {
  formatDateKeyForPrompt,
  formatLocalDateTime,
  parseDateTime,
  zonedDateTimeToUtc,
} from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone, normalizePhone, requirePhone } from "@/lib/domain/phone";
import {
  checkSlotAvailability,
  findNextAvailability,
  getAvailability,
} from "@/lib/domain/slots";
import { AppError } from "@/lib/errors";
import type {
  Appointment,
  AvailabilitySlot,
  BusinessSettings,
  Faq,
  Service,
  Staff,
  UiBlock,
} from "@/lib/types";
import type { CalendarProvider } from "@/lib/calendar/types";

import { isConfirmationUtterance, looksLikePhone } from "./confirmation";

type Stage =
  | "idle"
  | "booking_service"
  | "booking_date"
  | "booking_slot"
  | "booking_name"
  | "booking_phone"
  | "booking_confirm"
  | "cancel_code"
  | "cancel_phone"
  | "cancel_confirm"
  | "reschedule_code"
  | "reschedule_phone"
  | "reschedule_time"
  | "reschedule_confirm"
  | "lookup_phone";

type FallbackState = {
  stage: Stage;
  serviceId?: string;
  serviceName?: string;
  date?: string;
  slots?: AvailabilitySlot[];
  selectedStart?: string;
  selectedStaffId?: string;
  name?: string;
  phone?: string;
  draftId?: string;
  code?: string;
  rescheduleNewStart?: string;
};

const DEFAULT_STATE: FallbackState = { stage: "idle" };

function readState(conversation: ConversationRecord): FallbackState {
  const raw = conversation.state as Partial<FallbackState>;
  if (!raw || typeof raw !== "object" || !raw.stage) return { ...DEFAULT_STATE };
  return { ...DEFAULT_STATE, ...raw };
}

function saveState(db: Db, conversationId: string, state: FallbackState): void {
  updateConversationState(db, conversationId, state as Record<string, unknown>);
}

function serviceSummary(service: Service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMin: service.durationMin,
    priceCents: service.priceCents,
    currency: service.currency,
    category: service.category,
    color: service.color,
  };
}

function servicesUi(services: Service[]): UiBlock {
  return { type: "services", services: services.map(serviceSummary) };
}

function slotsUi(date: string, timezone: string, slots: AvailabilitySlot[]): UiBlock {
  return { type: "slots", date, timezone, slots };
}

function bookingUi(appointment: Appointment, settings: BusinessSettings): UiBlock {
  return {
    type: "booking",
    appointment: appointmentSummary(appointment, settings),
    icsUrl: `/api/ics/${appointment.code}`,
  };
}

function appointmentsUi(
  appointments: Appointment[],
  settings: BusinessSettings,
): UiBlock {
  return {
    type: "appointments",
    appointments: appointments.map((appointment) => appointmentSummary(appointment, settings)),
  };
}

function handoffUi(settings: BusinessSettings, reason: string): UiBlock {
  return { type: "handoff", phone: settings.phone, reason };
}

function lookupResponse(
  db: Db,
  phone: string,
  settings: BusinessSettings,
): { content: string; ui?: UiBlock[] } {
  const appointments = getAppointmentsForCustomer(db, normalizePhone(phone)).filter(
    (appointment) => appointment.status === "confirmed",
  );
  if (!appointments.length) {
    return { content: "I couldn't find an active appointment for that phone number." };
  }
  return {
    content: `I found ${appointments.length} appointment${
      appointments.length === 1 ? "" : "s"
    } for that number.`,
    ui: [appointmentsUi(appointments, settings)],
  };
}

function serviceListText(services: Service[], settings: BusinessSettings): string {
  const lines = services.map(
    (service) =>
      `• ${service.name} — ${service.durationMin} min, ${formatMoney(
        service.priceCents,
        service.currency,
      )}`,
  );
  return `Here is what we offer at ${settings.businessName}:\n\n${lines.join(
    "\n",
  )}\n\nWould you like me to check availability for one of these?`;
}

function matchService(text: string, services: Service[]): Service | undefined {
  const lower = text.toLowerCase();
  return services.find((service) => {
    const name = service.name.toLowerCase();
    if (lower.includes(name)) return true;
    const words = name.split(/\s+/).filter((word) => word.length > 3);
    return words.length > 0 && words.every((word) => lower.includes(word));
  });
}

function matchFaq(text: string, faqs: Faq[]): Faq | undefined {
  const lower = text.toLowerCase();
  let best: { faq: Faq; score: number } | undefined;
  for (const faq of faqs) {
    const keywords = faq.keywords
      .split(",")
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean);
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) score += keyword.length > 4 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { faq, score };
    }
  }
  return best?.faq;
}

function matchSlot(text: string, slots: AvailabilitySlot[]): AvailabilitySlot | undefined {
  const lower = text.toLowerCase();
  const ordinal = /(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)/.exec(lower);
  if (ordinal) {
    const map: Record<string, number> = {
      first: 0,
      "1st": 0,
      second: 1,
      "2nd": 1,
      third: 2,
      "3rd": 2,
      fourth: 3,
      "4th": 3,
      fifth: 4,
      "5th": 4,
    };
    const index = map[ordinal[1]];
    if (index !== undefined && slots[index]) return slots[index];
  }

  const timeMatch = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower);
  if (!timeMatch) return undefined;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? 0);
  const meridiem = timeMatch[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const targetMinutes = hour * 60 + minute;
  return slots.find((slot) => {
    const [, hh, mm] = /T(\d{2}):(\d{2})/.exec(slot.startLocal) ?? [];
    if (!hh || !mm) return false;
    return Number(hh) * 60 + Number(mm) === targetMinutes;
  });
}

async function showAvailability(
  db: Db,
  conversationId: string,
  settings: BusinessSettings,
  state: FallbackState,
  service: Service,
  date: string,
  period?: "morning" | "afternoon" | "evening",
  provider?: CalendarProvider | null,
): Promise<{ content: string; ui?: UiBlock[]; state: FallbackState }> {
  const result = await getAvailability(db, {
    serviceId: service.id,
    date,
    period,
    provider,
    limit: 8,
  });
  if (result.slots.length) {
    return {
      content: `Here are the open times for ${service.name} on ${formatDateKeyForPrompt(
        date,
        settings.timezone,
      )}. Pick one and I'll hold it while we finish the details.`,
      ui: [slotsUi(date, settings.timezone, result.slots)],
      state: { ...state, stage: "booking_slot", date, slots: result.slots },
    };
  }

  const next = await findNextAvailability(db, {
    serviceId: service.id,
    fromDate: date,
    days: 10,
    period,
    provider,
  });
  if (next) {
    return {
      content: `That day is full. The next opening for ${service.name} is ${formatDateKeyForPrompt(
        next.date,
        settings.timezone,
      )}. These times work:`,
      ui: [slotsUi(next.date, settings.timezone, next.slots)],
      state: {
        ...state,
        stage: "booking_slot",
        date: next.date,
        slots: next.slots,
      },
    };
  }

  const reason = "No availability found in the next two weeks.";
  createHandoff(db, conversationId, reason);
  return {
    content:
      "I could not find an open time in the next two weeks. I've flagged this for the team, and you can also call us.",
    ui: [handoffUi(settings, reason)],
    state: { ...DEFAULT_STATE },
  };
}

function draftText(
  summary: Awaited<ReturnType<typeof prepareBooking>>["summary"],
  settings: BusinessSettings,
): string {
  return `Please check these details:\n\n• ${summary.serviceName} with ${summary.staffName}\n• ${summary.startLocal}\n• ${summary.durationMin} minutes, ${formatMoney(
    summary.priceCents,
    summary.currency,
  )}\n• ${summary.customerName}, ${summary.phone}\n• ${settings.address}\n\nReply "confirm" to book it, or tell me what to change.`;
}

export async function handleFallback(
  db: Db,
  conversation: ConversationRecord,
  text: string,
  provider?: CalendarProvider | null,
): Promise<{ content: string; ui?: UiBlock[] }> {
  const settings = getSettings(db);
  const services = getServices(db);
  const faqs = getFaqs(db);
  const state = readState(conversation);
  const lower = text.toLowerCase().trim();

  const setState = (next: FallbackState) => {
    saveState(db, conversation.id, next);
    return next;
  };

  if (state.stage === "booking_service") {
    const service = matchService(text, services);
    if (!service) {
      return {
        content: "Which service would you like? You can tap one below or type its name.",
        ui: [servicesUi(services)],
      };
    }
    const parsed = parseDateTime(text, {
      timezone: settings.timezone,
      hours: settings.hours,
    });
    if (parsed.ok && parsed.hasExplicitTime && parsed.time) {
      const availability = await showAvailability(
        db,
        conversation.id,
        settings,
        { ...state, serviceId: service.id, serviceName: service.name },
        service,
        parsed.date,
        parsed.period,
        provider,
      );
      setState(availability.state);
      return { content: availability.content, ui: availability.ui };
    }
    setState({
      ...state,
      stage: "booking_date",
      serviceId: service.id,
      serviceName: service.name,
    });
    return {
      content: `Great — ${service.name}. What day and time would you like? You can say "tomorrow at 3 PM" or "next Friday afternoon".`,
    };
  }

  if (state.stage === "booking_date") {
    const service = services.find((item) => item.id === state.serviceId);
    if (!service) {
      setState({ ...DEFAULT_STATE });
      return {
        content: "Let's start again. Which service would you like?",
        ui: [servicesUi(services)],
      };
    }
    const parsed = parseDateTime(text, {
      timezone: settings.timezone,
      hours: settings.hours,
    });
    if (!parsed.ok) {
      return {
        content:
          "I didn't catch a date. Try something like \"tomorrow at 3 PM\", \"next Tuesday morning\", or \"November 5 at 10 AM\".",
      };
    }
    const availability = await showAvailability(
      db,
      conversation.id,
      settings,
      state,
      service,
      parsed.date,
      parsed.period,
      provider,
    );
    setState(availability.state);
    return { content: availability.content, ui: availability.ui };
  }

  if (state.stage === "booking_slot") {
    const service = services.find((item) => item.id === state.serviceId);
    if (!service) {
      setState({ ...DEFAULT_STATE });
      return { content: "Let's start again. Which service would you like?", ui: [servicesUi(services)] };
    }
    const slot = matchSlot(text, state.slots ?? []);
    if (!slot) {
      return {
        content: "Which of these times works for you?",
        ui: state.slots
          ? [slotsUi(state.date ?? "", settings.timezone, state.slots)]
          : undefined,
      };
    }
    setState({
      ...state,
      stage: "booking_name",
      selectedStart: slot.startAt,
      selectedStaffId: slot.staffIds[0],
    });
    return {
      content: `Perfect — ${slot.label}. What name should I put on the appointment?`,
    };
  }

  if (state.stage === "booking_name") {
    const name = text.trim();
    if (name.length < 2 || name.length > 80) {
      return { content: "Please share the full name for the appointment." };
    }
    setState({ ...state, stage: "booking_phone", name });
    return {
      content: `Thanks, ${name}. What phone number should we use for the confirmation?`,
    };
  }

  if (state.stage === "booking_phone") {
    const phone = text.trim();
    if (!looksLikePhone(phone)) {
      return { content: "Please share a phone number with 10 to 15 digits." };
    }
    const service = services.find((item) => item.id === state.serviceId);
    if (!service || !state.selectedStart || !state.name) {
      setState({ ...DEFAULT_STATE });
      return { content: "Something went missing. Let's start again — which service would you like?", ui: [servicesUi(services)] };
    }
    try {
      const result = await prepareBooking(db, {
        conversationId: conversation.id,
        serviceId: service.id,
        startAt: state.selectedStart,
        customerName: state.name,
        phone,
        staffId: state.selectedStaffId,
        provider,
      });
      setState({
        ...state,
        stage: "booking_confirm",
        phone: result.draft.phone,
        draftId: result.draft.id,
      });
      return {
        content: draftText(result.summary, settings),
        ui: [{ type: "draft", draft: result.summary }],
      };
    } catch (error) {
      if (error instanceof AppError) {
        setState({
          ...state,
          stage: "booking_date",
          selectedStart: undefined,
          selectedStaffId: undefined,
        });
        return {
          content: `${error.message} Let's look at the times again — what day works for you?`,
        };
      }
      throw error;
    }
  }

  if (state.stage === "booking_confirm") {
    if (!isConfirmationUtterance(text)) {
      if (/\b(change|different|another|edit)\b/i.test(text)) {
        setState({
          ...state,
          stage: "booking_date",
          selectedStart: undefined,
          selectedStaffId: undefined,
          draftId: undefined,
        });
        return { content: "No problem. What day and time would you like instead?" };
      }
      return {
        content:
          "Just reply \"confirm\" if the details look right, or tell me what you'd like to change.",
      };
    }
    if (!state.draftId) {
      setState({ ...DEFAULT_STATE });
      return { content: "That draft expired. Let's start again — which service would you like?", ui: [servicesUi(services)] };
    }
    try {
      const result = await confirmDraft(db, { draftId: state.draftId, provider });
      updateConversationCustomer(
        db,
        conversation.id,
        result.appointment.customerName,
        result.appointment.phone,
      );
      setState({ ...DEFAULT_STATE });
      return {
        content: `You're booked! Your booking code is ${result.appointment.code}. I've included the details below. ${
          result.googleSynced
            ? "The appointment has also been added to our studio calendar."
            : "A team member will see it on our studio schedule."
        }`,
        ui: [bookingUi(result.appointment, settings)],
      };
    } catch (error) {
      if (error instanceof AppError) {
        return { content: `${error.message} Would you like to choose another time?` };
      }
      throw error;
    }
  }

  if (state.stage === "cancel_code") {
    const code = text.trim().toUpperCase();
    if (code.length < 4) return { content: "Please share the booking code from your confirmation." };
    setState({ ...state, stage: "cancel_phone", code });
    return { content: "Thanks. What phone number was used for the booking?" };
  }

  if (state.stage === "cancel_phone") {
    if (!state.code) {
      setState({ ...DEFAULT_STATE });
      return { content: "Let's start again. What is your booking code?" };
    }
    try {
      const phone = requirePhone(text);
      const appointment = getAppointmentByCode(db, state.code);
      if (!appointment || normalizePhone(appointment.phone) !== normalizePhone(phone)) {
        setState({ ...DEFAULT_STATE });
        return { content: "I couldn't find an active appointment with that code and phone number." };
      }
      if (appointment.status !== "confirmed") {
        setState({ ...DEFAULT_STATE });
        return { content: "That appointment is not active." };
      }
      setState({ ...state, stage: "cancel_confirm", phone: formatPhone(phone) });
      return {
        content: `I found ${appointment.serviceName} on ${formatLocalDateTime(
          appointment.startAt,
          settings.timezone,
        )}. Reply "cancel" to confirm, or anything else to keep it.`,
        ui: [appointmentsUi([appointment], settings)],
      };
    } catch (error) {
      if (error instanceof AppError) {
        return { content: error.message };
      }
      throw error;
    }
  }

  if (state.stage === "cancel_confirm") {
    if (!/\b(cancel|yes|confirm|do it)\b/i.test(text)) {
      setState({ ...DEFAULT_STATE });
      return { content: "No problem — I've kept the appointment as it is." };
    }
    if (!state.code || !state.phone) {
      setState({ ...DEFAULT_STATE });
      return { content: "That cancellation expired. Please start again." };
    }
    try {
      const result = await cancelAppointment(db, {
        code: state.code,
        phone: state.phone,
        provider,
        enforceCutoff: true,
      });
      if (!result.ok) {
        createHandoff(db, conversation.id, result.reason);
        setState({ ...DEFAULT_STATE });
        return {
          content: result.reason,
          ui: [handoffUi(settings, result.reason)],
        };
      }
      setState({ ...DEFAULT_STATE });
      return {
        content: "Your appointment has been cancelled. If you'd like to rebook, I can help.",
        ui: [appointmentsUi([result.appointment], settings)],
      };
    } catch (error) {
      if (error instanceof AppError) return { content: error.message };
      throw error;
    }
  }

  if (state.stage === "reschedule_code") {
    const code = text.trim().toUpperCase();
    if (code.length < 4) return { content: "Please share the booking code from your confirmation." };
    setState({ ...state, stage: "reschedule_phone", code });
    return { content: "Thanks. What phone number was used for the booking?" };
  }

  if (state.stage === "reschedule_phone") {
    if (!state.code) {
      setState({ ...DEFAULT_STATE });
      return { content: "Let's start again. What is your booking code?" };
    }
    try {
      const phone = requirePhone(text);
      const appointment = getAppointmentByCode(db, state.code);
      if (!appointment || normalizePhone(appointment.phone) !== normalizePhone(phone)) {
        setState({ ...DEFAULT_STATE });
        return { content: "I couldn't find an active appointment with that code and phone number." };
      }
      setState({ ...state, stage: "reschedule_time", phone: formatPhone(phone) });
      return {
        content: `I found ${appointment.serviceName} on ${formatLocalDateTime(
          appointment.startAt,
          settings.timezone,
        )}. What new day and time would you like?`,
      };
    } catch (error) {
      if (error instanceof AppError) return { content: error.message };
      throw error;
    }
  }

  if (state.stage === "reschedule_time") {
    if (!state.code || !state.phone) {
      setState({ ...DEFAULT_STATE });
      return { content: "Let's start again. What is your booking code?" };
    }
    const appointment = getAppointmentByCode(db, state.code);
    if (!appointment) {
      setState({ ...DEFAULT_STATE });
      return { content: "I couldn't find that appointment anymore." };
    }
    const parsed = parseDateTime(text, {
      timezone: settings.timezone,
      hours: settings.hours,
    });
    if (!parsed.ok || !parsed.hasExplicitTime || !parsed.time) {
      return {
        content:
          "Please give me one exact new time, for example \"next Tuesday at 2 PM\" or \"November 12 at 10:30 AM\".",
      };
    }
    const startAt = zonedDateTimeToUtc(parsed.date, parsed.time, settings.timezone).toISOString();
    const check = await checkSlotAvailability(db, {
      serviceId: appointment.serviceId,
      startAt,
      staffId: appointment.staffId,
      provider,
    });
    if (!check.ok) {
      return {
        content: `${check.reason} What other time works for you?`,
      };
    }
    setState({ ...state, stage: "reschedule_confirm", rescheduleNewStart: startAt });
    return {
      content: `I can move you to ${formatLocalDateTime(startAt, settings.timezone)}. Reply "confirm" to make the change, or give me another time.`,
      ui: [appointmentsUi([appointment], settings)],
    };
  }

  if (state.stage === "reschedule_confirm") {
    if (!isConfirmationUtterance(text)) {
      return { content: "Reply \"confirm\" to make the change, or give me another time." };
    }
    if (!state.code || !state.phone || !state.rescheduleNewStart) {
      setState({ ...DEFAULT_STATE });
      return { content: "That change expired. Please start again." };
    }
    try {
      const result = await rescheduleAppointment(db, {
        code: state.code,
        phone: state.phone,
        newStartAt: state.rescheduleNewStart,
        provider,
      });
      setState({ ...DEFAULT_STATE });
      return {
        content: `Done — your appointment is now ${formatLocalDateTime(
          result.appointment.startAt,
          settings.timezone,
        )}.`,
        ui: [bookingUi(result.appointment, settings)],
      };
    } catch (error) {
      if (error instanceof AppError) return { content: error.message };
      throw error;
    }
  }

  if (state.stage === "lookup_phone") {
    try {
      const phone = requirePhone(text);
      setState({ ...DEFAULT_STATE });
      return lookupResponse(db, phone, settings);
    } catch (error) {
      if (error instanceof AppError) return { content: error.message };
      throw error;
    }
  }

  // Idle intent routing.
  if (/\b(human|person|someone|call me|speak to|manager)\b/i.test(text)) {
    createHandoff(db, conversation.id, text.slice(0, 200));
    return {
      content: `Of course. I've flagged this for the team. You can also call us at ${settings.phone}.`,
      ui: [handoffUi(settings, text.slice(0, 200))],
    };
  }

  if (/\b(cancel|can't make it|cannot make it)\b/i.test(lower)) {
    setState({ ...state, stage: "cancel_code" });
    return {
      content:
        "I can help with that. What is the booking code from your confirmation? It starts with LUMA-.",
    };
  }

  if (/\b(reschedule|change my appointment|move my appointment|different time)\b/i.test(lower)) {
    setState({ ...state, stage: "reschedule_code" });
    return {
      content:
        "I can help you move it. What is the booking code from your confirmation?",
    };
  }

  if (/\b(my appointment|find my|look up|lookup|booking code)\b/i.test(lower)) {
    if (looksLikePhone(text)) {
      setState({ ...DEFAULT_STATE });
      return lookupResponse(db, text, settings);
    }
    setState({ ...state, stage: "lookup_phone" });
    return { content: "What phone number was used for the booking?" };
  }

  if (/\b(price|prices|cost|how much|services|what do you offer|menu)\b/i.test(lower)) {
    return {
      content: serviceListText(services, settings),
      ui: [servicesUi(services)],
    };
  }

  const faq = matchFaq(text, faqs);
  if (faq) {
    return { content: faq.answer };
  }

  if (
    /\b(book|booking|appointment|available|availability|slot|schedule|tomorrow|today|next week|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      lower,
    )
  ) {
    const service = matchService(text, services);
    if (service) {
      const parsed = parseDateTime(text, {
        timezone: settings.timezone,
        hours: settings.hours,
      });
      if (parsed.ok && parsed.hasExplicitTime && parsed.time) {
        const availability = await showAvailability(
          db,
          conversation.id,
          settings,
          { ...state, serviceId: service.id, serviceName: service.name },
          service,
          parsed.date,
          parsed.period,
          provider,
        );
        setState(availability.state);
        return { content: availability.content, ui: availability.ui };
      }
      setState({
        ...state,
        stage: "booking_date",
        serviceId: service.id,
        serviceName: service.name,
      });
      return {
        content: `Great — ${service.name}. What day and time would you like?`,
      };
    }
    setState({ ...state, stage: "booking_service" });
    return {
      content: "I'd be happy to check availability. Which service would you like?",
      ui: [servicesUi(services)],
    };
  }

  if (/\b(hi|hello|hey|good morning|good afternoon)\b/i.test(lower)) {
    return {
      content: `Hello — I'm ${settings.aiName}, the AI receptionist at ${settings.businessName}. I can help with services, availability, and bookings. What can I do for you?`,
      ui: [servicesUi(services)],
    };
  }

  if (/\b(thank|thanks)\b/i.test(lower)) {
    return { content: "You're very welcome. Is there anything else I can help with?" };
  }

  if (isConfirmationUtterance(text)) {
    return {
      content: "There isn't anything pending to confirm right now. Would you like to book an appointment?",
      ui: [servicesUi(services)],
    };
  }

  return {
    content: `I can help with services, availability, bookings, changes, and cancellations. You can also call us at ${settings.phone}. What would you like to do?`,
    ui: [servicesUi(services)],
  };
}
