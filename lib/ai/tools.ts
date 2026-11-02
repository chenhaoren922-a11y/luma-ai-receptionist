import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Db } from "@/lib/db/client";
import {
  appointmentSummary,
  getAppointmentByCode,
} from "@/lib/data/appointments";
import { getFaqs, getServices } from "@/lib/data/catalog";
import {
  getConversation,
  createHandoff,
  updateConversationCustomer,
} from "@/lib/data/conversations";
import { getSettings } from "@/lib/data/settings";
import {
  cancelAppointment,
  confirmDraft,
  prepareBooking,
  rescheduleAppointment,
  lookupAppointments,
  type CancelResult,
} from "@/lib/domain/booking";
import {
  formatLocalDateTime,
  formatLocalTime,
  formatLongDate,
  zonedDateTimeToUtc,
} from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone, normalizePhone } from "@/lib/domain/phone";
import { findNextAvailability, getAvailability, checkSlotAvailability } from "@/lib/domain/slots";
import { AppError, errorResponse } from "@/lib/errors";
import type {
  Appointment,
  AppointmentSummary,
  BusinessSettings,
  Service,
  UiBlock,
} from "@/lib/types";
import type { CalendarProvider } from "@/lib/calendar/types";

import type { ModelToolDefinition } from "./provider";

export type ToolContext = {
  db: Db;
  conversationId: string;
  userText: string;
  isConfirmation: boolean;
  provider: CalendarProvider | null;
  settings: BusinessSettings;
  context: Record<string, unknown>;
};

export type ToolExecution = {
  result: Record<string, unknown>;
  ui?: UiBlock[];
  contextPatch?: Record<string, unknown>;
};

const periodSchema = z.enum(["morning", "afternoon", "evening"]);

const schemas = {
  list_services: z.object({}),
  get_availability: z.object({
    serviceId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period: periodSchema.optional(),
    staffId: z.string().optional(),
  }),
  find_next_availability: z.object({
    serviceId: z.string().min(1),
    days: z.number().int().min(1).max(30).optional(),
    period: periodSchema.optional(),
    staffId: z.string().optional(),
  }),
  prepare_booking: z.object({
    serviceId: z.string().min(1),
    start: z.string().min(1),
    customerName: z.string().min(2).max(80),
    phone: z.string().min(7).max(30),
    staffId: z.string().optional(),
    notes: z.string().max(500).optional(),
  }),
  confirm_booking: z.object({
    draftId: z.string().optional(),
  }),
  lookup_appointment: z.object({
    phone: z.string().min(7).max(30),
    code: z.string().optional(),
  }),
  prepare_cancellation: z.object({
    code: z.string().min(3).max(40),
    phone: z.string().min(7).max(30),
  }),
  confirm_cancellation: z.object({
    code: z.string().min(3).max(40).optional(),
    phone: z.string().min(7).max(30).optional(),
  }),
  prepare_reschedule: z.object({
    code: z.string().min(3).max(40),
    phone: z.string().min(7).max(30),
    newStart: z.string().min(1),
  }),
  confirm_reschedule: z.object({
    code: z.string().min(3).max(40).optional(),
    phone: z.string().min(7).max(30).optional(),
    newStart: z.string().min(1).optional(),
  }),
  request_handoff: z.object({
    reason: z.string().min(3).max(300),
  }),
};

type ToolName = keyof typeof schemas;

const descriptions: Record<ToolName, string> = {
  list_services:
    "List the studio's services with duration, price, and description. Use when the customer asks what is offered or needs help choosing.",
  get_availability:
    "Check real open appointment times for one service on one local date. Never offer a time without calling this. date must be YYYY-MM-DD in the studio time zone.",
  find_next_availability:
    "Find the next date with open times for a service. Use when the requested day is full or the customer has no specific date.",
  prepare_booking:
    "Create a 15-minute booking draft after collecting service, exact available start time, full name, and phone. This does NOT book yet. start must be local studio time, format YYYY-MM-DDTHH:mm.",
  confirm_booking:
    "Confirm the pending booking draft after the customer explicitly confirms the restated details. Requires the draftId from prepare_booking or the active context.",
  lookup_appointment:
    "Find a customer's appointment by phone and optional booking code.",
  prepare_cancellation:
    "Look up an appointment and prepare a cancellation summary. Does not cancel yet.",
  confirm_cancellation:
    "Cancel the prepared appointment after the customer explicitly confirms. Requires the code and phone from prepare_cancellation.",
  prepare_reschedule:
    "Look up an appointment and check a new proposed local start time. Does not reschedule yet.",
  confirm_reschedule:
    "Reschedule the prepared appointment after the customer explicitly confirms.",
  request_handoff:
    "Create a human handoff request when the customer asks for a person, is upset, or needs something outside the tools.",
};

export const TOOL_DEFINITIONS: ModelToolDefinition[] = (
  Object.keys(schemas) as ToolName[]
).map((name) => {
  // Groq validates tool arguments strictly. Use the standard JSON Schema
  // output so optional properties are not marked as required.
  const generated = zodToJsonSchema(schemas[name]) as Record<string, unknown>;
  delete generated.$schema;
  return {
    type: "function",
    function: {
      name,
      description: descriptions[name],
      parameters: generated,
    },
  };
});

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

function bookingBlock(appointment: Appointment, settings: BusinessSettings): UiBlock {
  return {
    type: "booking",
    appointment: appointmentSummary(appointment, settings),
    icsUrl: `/api/ics/${appointment.code}`,
  };
}

function appointmentsBlock(
  appointments: Appointment[],
  settings: BusinessSettings,
): UiBlock {
  return {
    type: "appointments",
    appointments: appointments.map((appointment) => appointmentSummary(appointment, settings)),
  };
}

function errorResult(error: unknown): ToolExecution {
  const response = errorResponse(error);
  return {
    result: {
      ok: false,
      code: response.body.error.code,
      message: response.body.error.message,
    },
  };
}

function parseStart(start: string, settings: BusinessSettings): string {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(start)) {
    const date = new Date(start);
    if (Number.isNaN(date.getTime())) {
      throw new AppError("INVALID_START", "That start time is not a valid date and time.");
    }
    return date.toISOString();
  }
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(start);
  if (!match) {
    throw new AppError(
      "INVALID_START",
      "Use local studio time in the format YYYY-MM-DDTHH:mm.",
    );
  }
  return zonedDateTimeToUtc(match[1], match[2], settings.timezone).toISOString();
}

function appointmentLine(appointment: Appointment, settings: BusinessSettings): string {
  return `${appointment.code} — ${appointment.serviceName} with ${appointment.staffName}, ${formatLocalDateTime(
    appointment.startAt,
    settings.timezone,
  )}`;
}

async function execute(
  name: ToolName,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolExecution> {
  const parsed = schemas[name].safeParse(rawArgs);
  if (!parsed.success) {
    return {
      result: {
        ok: false,
        code: "INVALID_ARGUMENTS",
        message: "The assistant sent an invalid tool request. Ask the customer to clarify.",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }
  // The discriminated union of Zod schemas is validated above; the switch below
  // narrows by tool name, so a permissive local type keeps the executor readable.
  const args = parsed.data as any;

  switch (name) {
    case "list_services": {
      const services = getServices(ctx.db).map(serviceSummary);
      return {
        result: {
          ok: true,
          count: services.length,
          services: services.map((service) => ({
            id: service.id,
            name: service.name,
            durationMin: service.durationMin,
            price: formatMoney(service.priceCents, service.currency),
            description: service.description,
          })),
        },
        ui: [{ type: "services", services }],
      };
    }

    case "get_availability": {
      const result = await getAvailability(ctx.db, {
        serviceId: args.serviceId,
        date: args.date,
        period: args.period,
        staffId: args.staffId,
        provider: ctx.provider,
      });
      if (!result.slots.length) {
        return {
          result: {
            ok: true,
            date: result.date,
            dateLabel: formatLongDate(result.date, result.timezone),
            slots: [],
            closed: result.closed,
            message: result.reason ?? "No open times on that day.",
          },
        };
      }
      return {
        result: {
          ok: true,
          date: result.date,
          dateLabel: formatLongDate(result.date, result.timezone),
          timezone: result.timezone,
          slots: result.slots.map((slot) => ({
            startLocal: slot.startLocal,
            label: slot.label,
            staff: slot.staffNames,
          })),
        },
        ui: [
          {
            type: "slots",
            date: result.date,
            timezone: result.timezone,
            slots: result.slots,
          },
        ],
      };
    }

    case "find_next_availability": {
      const result = await findNextAvailability(ctx.db, {
        serviceId: args.serviceId,
        days: args.days ?? 14,
        period: args.period,
        staffId: args.staffId,
        provider: ctx.provider,
      });
      if (!result) {
        return {
          result: {
            ok: false,
            code: "NO_AVAILABILITY",
            message: "No open times were found in the next two weeks.",
          },
        };
      }
      return {
        result: {
          ok: true,
          date: result.date,
          dateLabel: formatLongDate(result.date, result.timezone),
          timezone: result.timezone,
          slots: result.slots.map((slot) => ({
            startLocal: slot.startLocal,
            label: slot.label,
            staff: slot.staffNames,
          })),
        },
        ui: [
          {
            type: "slots",
            date: result.date,
            timezone: result.timezone,
            slots: result.slots,
          },
        ],
      };
    }

    case "prepare_booking": {
      const startAt = parseStart(args.start, ctx.settings);
      try {
        const result = await prepareBooking(ctx.db, {
          conversationId: ctx.conversationId,
          serviceId: args.serviceId,
          startAt,
          customerName: args.customerName,
          phone: args.phone,
          staffId: args.staffId,
          notes: args.notes,
          provider: ctx.provider,
        });
        const summary = result.summary;
        return {
          result: {
            ok: true,
            draftId: summary.draftId,
            requiresConfirmation: true,
            service: summary.serviceName,
            staff: summary.staffName,
            start: summary.startLocal,
            durationMin: summary.durationMin,
            price: formatMoney(summary.priceCents, summary.currency),
            customerName: summary.customerName,
            phone: summary.phone,
            address: summary.address,
            message:
              "Draft created. Restate the details and ask the customer to confirm explicitly before calling confirm_booking.",
          },
          ui: [{ type: "draft", draft: summary }],
          contextPatch: { lastDraftId: summary.draftId, lastDraftStatus: "pending" },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "confirm_booking": {
      if (!ctx.isConfirmation) {
        return {
          result: {
            ok: false,
            code: "CONFIRMATION_REQUIRED",
            message:
              "The customer has not explicitly confirmed yet. Restate the booking details and ask for confirmation. Do not book.",
          },
        };
      }
      const draftId =
        args.draftId ||
        (typeof ctx.context.lastDraftId === "string" ? ctx.context.lastDraftId : "");
      if (!draftId) {
        return {
          result: {
            ok: false,
            code: "NO_DRAFT",
            message: "There is no pending draft. Call prepare_booking first.",
          },
        };
      }
      try {
        const result = await confirmDraft(ctx.db, {
          draftId,
          provider: ctx.provider,
        });
        updateConversationCustomer(
          ctx.db,
          ctx.conversationId,
          result.appointment.customerName,
          result.appointment.phone,
        );
        return {
          result: {
            ok: true,
            appointment: appointmentSummary(result.appointment, ctx.settings),
            googleSynced: result.googleSynced,
            message: `Appointment confirmed. Booking code ${result.appointment.code}.`,
          },
          ui: [bookingBlock(result.appointment, ctx.settings)],
          contextPatch: {
            lastDraftId: null,
            lastDraftStatus: "confirmed",
            lastAppointmentCode: result.appointment.code,
            pendingAction: null,
          },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "lookup_appointment": {
      try {
        const appointments = lookupAppointments(ctx.db, {
          phone: args.phone,
          code: args.code,
        });
        if (!appointments.length) {
          return {
            result: {
              ok: false,
              code: "APPOINTMENT_NOT_FOUND",
              message:
                "No active appointment matched that phone number and booking code.",
            },
          };
        }
        return {
          result: {
            ok: true,
            count: appointments.length,
            appointments: appointments.map((appointment) => ({
              code: appointment.code,
              service: appointment.serviceName,
              staff: appointment.staffName,
              start: formatLocalDateTime(appointment.startAt, ctx.settings.timezone),
              status: appointment.status,
            })),
          },
          ui: [appointmentsBlock(appointments, ctx.settings)],
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "prepare_cancellation": {
      try {
        const phone = normalizePhone(args.phone);
        const appointment = getAppointmentByCode(ctx.db, args.code.trim().toUpperCase());
        if (
          !appointment ||
          normalizePhone(appointment.phone) !== phone ||
          appointment.status !== "confirmed"
        ) {
          return {
            result: {
              ok: false,
              code: "APPOINTMENT_NOT_FOUND",
              message:
                "No active appointment matched that booking code and phone number.",
            },
          };
        }
        const cutoff =
          new Date(appointment.startAt).getTime() -
          ctx.settings.cancellationCutoffHours * 60 * 60_000;
        if (Date.now() > cutoff) {
          return {
            result: {
              ok: false,
              code: "CANCELLATION_CUTOFF",
              message: `This appointment is inside the ${ctx.settings.cancellationCutoffHours}-hour cancellation window. Offer a human handoff.`,
            },
          };
        }
        return {
          result: {
            ok: true,
            requiresConfirmation: true,
            code: appointment.code,
            service: appointment.serviceName,
            start: formatLocalDateTime(appointment.startAt, ctx.settings.timezone),
            message:
              "Cancellation prepared. Ask the customer to reply CANCEL to confirm.",
          },
          ui: [appointmentsBlock([appointment], ctx.settings)],
          contextPatch: {
            pendingAction: {
              kind: "cancel",
              code: appointment.code,
              phone: formatPhone(appointment.phone),
            },
          },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "confirm_cancellation": {
      if (!ctx.isConfirmation) {
        return {
          result: {
            ok: false,
            code: "CONFIRMATION_REQUIRED",
            message: "Ask the customer to explicitly confirm the cancellation first.",
          },
        };
      }
      const pending = (ctx.context.pendingAction ?? {}) as Record<string, unknown>;
      const code =
        args.code ||
        (pending.kind === "cancel" && typeof pending.code === "string" ? pending.code : "");
      const phone =
        args.phone ||
        (pending.kind === "cancel" && typeof pending.phone === "string"
          ? pending.phone
          : "");
      if (!code || !phone) {
        return {
          result: {
            ok: false,
            code: "NO_PENDING_ACTION",
            message: "Call prepare_cancellation first.",
          },
        };
      }
      try {
        const result: CancelResult = await cancelAppointment(ctx.db, {
          code,
          phone,
          provider: ctx.provider,
          enforceCutoff: true,
        });
        if (!result.ok) {
          const handoff = createHandoff(ctx.db, ctx.conversationId, result.reason);
          return {
            result: {
              ok: false,
              code: "HANDOFF_REQUIRED",
              message: result.reason,
              handoffId: handoff.id,
            },
            ui: [
              {
                type: "handoff",
                phone: ctx.settings.phone,
                reason: result.reason,
              },
            ],
            contextPatch: { pendingAction: null },
          };
        }
        return {
          result: {
            ok: true,
            code: result.appointment.code,
            status: "cancelled",
            message: "Appointment cancelled.",
          },
          ui: [appointmentsBlock([result.appointment], ctx.settings)],
          contextPatch: { pendingAction: null, lastAppointmentCode: null },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "prepare_reschedule": {
      try {
        const phone = normalizePhone(args.phone);
        const appointment = getAppointmentByCode(ctx.db, args.code.trim().toUpperCase());
        if (
          !appointment ||
          normalizePhone(appointment.phone) !== phone ||
          appointment.status !== "confirmed"
        ) {
          return {
            result: {
              ok: false,
              code: "APPOINTMENT_NOT_FOUND",
              message:
                "No active appointment matched that booking code and phone number.",
            },
          };
        }
        const cutoff =
          new Date(appointment.startAt).getTime() -
          ctx.settings.cancellationCutoffHours * 60 * 60_000;
        if (Date.now() > cutoff) {
          return {
            result: {
              ok: false,
              code: "CANCELLATION_CUTOFF",
              message: `This appointment is inside the ${ctx.settings.cancellationCutoffHours}-hour change window. Offer a human handoff.`,
            },
          };
        }
        const newStart = parseStart(args.newStart, ctx.settings);
        const check = await checkSlotAvailability(ctx.db, {
          serviceId: appointment.serviceId,
          startAt: newStart,
          staffId: appointment.staffId,
          provider: ctx.provider,
        });
        if (!check.ok) {
          return {
            result: {
              ok: false,
              code: "SLOT_UNAVAILABLE",
              message: check.reason,
            },
          };
        }
        return {
          result: {
            ok: true,
            requiresConfirmation: true,
            code: appointment.code,
            from: formatLocalDateTime(appointment.startAt, ctx.settings.timezone),
            to: formatLocalDateTime(newStart, ctx.settings.timezone),
            staff: check.staff.name,
            message:
              "Reschedule prepared. Ask the customer to confirm the new time explicitly.",
          },
          ui: [
            {
              type: "appointments",
              appointments: [
                appointmentSummary(appointment, ctx.settings),
              ],
            },
          ],
          contextPatch: {
            pendingAction: {
              kind: "reschedule",
              code: appointment.code,
              phone: formatPhone(appointment.phone),
              newStart,
            },
          },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "confirm_reschedule": {
      if (!ctx.isConfirmation) {
        return {
          result: {
            ok: false,
            code: "CONFIRMATION_REQUIRED",
            message: "Ask the customer to explicitly confirm the new time first.",
          },
        };
      }
      const pending = (ctx.context.pendingAction ?? {}) as Record<string, unknown>;
      const code =
        args.code ||
        (pending.kind === "reschedule" && typeof pending.code === "string"
          ? pending.code
          : "");
      const phone =
        args.phone ||
        (pending.kind === "reschedule" && typeof pending.phone === "string"
          ? pending.phone
          : "");
      const newStart =
        (args.newStart && parseStart(args.newStart, ctx.settings)) ||
        (pending.kind === "reschedule" && typeof pending.newStart === "string"
          ? pending.newStart
          : "");
      if (!code || !phone || !newStart) {
        return {
          result: {
            ok: false,
            code: "NO_PENDING_ACTION",
            message: "Call prepare_reschedule first.",
          },
        };
      }
      try {
        const result = await rescheduleAppointment(ctx.db, {
          code,
          phone,
          newStartAt: newStart,
          provider: ctx.provider,
        });
        return {
          result: {
            ok: true,
            code: result.appointment.code,
            start: formatLocalDateTime(result.appointment.startAt, ctx.settings.timezone),
            message: "Appointment rescheduled.",
          },
          ui: [bookingBlock(result.appointment, ctx.settings)],
          contextPatch: { pendingAction: null, lastAppointmentCode: result.appointment.code },
        };
      } catch (error) {
        return errorResult(error);
      }
    }

    case "request_handoff": {
      const handoff = createHandoff(ctx.db, ctx.conversationId, args.reason);
      return {
        result: {
          ok: true,
          handoffId: handoff.id,
          message: "A person will follow up. Share the studio phone number.",
        },
        ui: [{ type: "handoff", phone: ctx.settings.phone, reason: args.reason }],
      };
    }

    default:
      return {
        result: {
          ok: false,
          code: "UNKNOWN_TOOL",
          message: "That tool is not available.",
        },
      };
  }
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolExecution> {
  if (!(name in schemas)) {
    return {
      result: { ok: false, code: "UNKNOWN_TOOL", message: "That tool is not available." },
    };
  }
  try {
    return await execute(name as ToolName, rawArgs, ctx);
  } catch (error) {
    return errorResult(error);
  }
}

export function toolUiForAppointment(
  appointment: Appointment,
  settings: BusinessSettings,
): UiBlock {
  return bookingBlock(appointment, settings);
}

export function getToolDemoServices(db: Db): Service[] {
  return getServices(db);
}

export function getToolDemoFaqs(db: Db) {
  return getFaqs(db);
}

export function toolConversation(db: Db, id: string) {
  return getConversation(db, id);
}

export function toolSettings(db: Db) {
  return getSettings(db);
}

export { formatLocalTime };
