import type { BusinessHours, BusinessSettings, Faq, Service, Staff } from "@/lib/types";

const OPEN_DAY = {
  closed: false,
  open: "10:00",
  close: "19:00",
  breakStart: "13:00",
  breakEnd: "14:00",
};

export const DEFAULT_HOURS: BusinessHours = {
  "0": { ...OPEN_DAY },
  "1": { ...OPEN_DAY, closed: true },
  "2": { ...OPEN_DAY },
  "3": { ...OPEN_DAY },
  "4": { ...OPEN_DAY },
  "5": { ...OPEN_DAY },
  "6": { ...OPEN_DAY },
};

export function defaultSettings(): BusinessSettings {
  return {
    businessName: "Luma Studio",
    tagline: "A quieter kind of appointment.",
    address: "88 Harbour Lane, Suite 2",
    phone: "(555) 018-8200",
    email: "hello@lumastudio.example",
    timezone: process.env.BUSINESS_TIMEZONE || "Etc/GMT+4",
    currency: "USD",
    hours: DEFAULT_HOURS,
    slotIntervalMin: 30,
    leadTimeMin: 120,
    maxAdvanceDays: 60,
    cancellationCutoffHours: 24,
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    aiName: "Luma",
  };
}

export const DEMO_SERVICES: Service[] = [
  {
    id: "svc_facial",
    name: "Signature Facial",
    description:
      "A calming, skin-first facial tailored to your skin on the day. Cleanse, exfoliation, massage, mask, and SPF.",
    durationMin: 60,
    bufferMin: 10,
    priceCents: 12000,
    currency: "USD",
    category: "Skin",
    color: "#c96f4a",
    active: true,
    sortOrder: 1,
  },
  {
    id: "svc_massage",
    name: "Deep Tissue Massage",
    description:
      "Focused therapeutic bodywork for tight shoulders, back, and hips. Pressure adjusted to your comfort.",
    durationMin: 60,
    bufferMin: 10,
    priceCents: 14000,
    currency: "USD",
    category: "Body",
    color: "#7c8f7b",
    active: true,
    sortOrder: 2,
  },
  {
    id: "svc_scalp",
    name: "Scalp & Hair Therapy",
    description:
      "A restorative scalp treatment with a gentle exfoliating cleanse, nourishing mask, and relaxing head massage.",
    durationMin: 45,
    bufferMin: 10,
    priceCents: 9500,
    currency: "USD",
    category: "Hair",
    color: "#b58b5d",
    active: true,
    sortOrder: 3,
  },
  {
    id: "svc_styling",
    name: "Personal Styling Session",
    description:
      "A focused one-to-one session for outfit planning, wardrobe edits, or finding your everyday uniform.",
    durationMin: 30,
    bufferMin: 5,
    priceCents: 6000,
    currency: "USD",
    category: "Style",
    color: "#8a7fa8",
    active: true,
    sortOrder: 4,
  },
];

export const DEMO_STAFF: Staff[] = [
  {
    id: "staff_ava",
    name: "Ava Bennett",
    title: "Lead Esthetician",
    bio: "Skin specialist with 12 years of experience. Calm, precise, and obsessed with a healthy barrier.",
    active: true,
    color: "#c96f4a",
    serviceIds: ["svc_facial", "svc_styling"],
  },
  {
    id: "staff_noah",
    name: "Noah Carter",
    title: "Massage Therapist",
    bio: "Deep tissue and sports-focused bodywork. Firm pressure, thoughtful pacing, no chatter unless you want it.",
    active: true,
    color: "#7c8f7b",
    serviceIds: ["svc_massage", "svc_scalp"],
  },
  {
    id: "staff_mia",
    name: "Mia Chen",
    title: "Style Consultant",
    bio: "Wardrobe editor and personal stylist. Practical, warm advice for real life, not just the mirror.",
    active: true,
    color: "#8a7fa8",
    serviceIds: ["svc_styling", "svc_scalp"],
  },
];

export const DEMO_FAQS: Faq[] = [
  {
    id: "faq_location",
    question: "Where are you located, and is there parking?",
    answer:
      "We are at 88 Harbour Lane, Suite 2. There is a paid public garage on the same block, and street parking is usually available after 6 PM.",
    keywords: "address,location,parking,where,garage,directions,find",
    category: "Visit",
    sortOrder: 1,
    active: true,
  },
  {
    id: "faq_hours",
    question: "What are your opening hours?",
    answer:
      "We are open Tuesday through Sunday, 10:00 AM to 7:00 PM, with a quiet break from 1:00 to 2:00 PM. We are closed on Mondays.",
    keywords: "hours,open,opening,close,closing,time,sunday,monday",
    category: "Visit",
    sortOrder: 2,
    active: true,
  },
  {
    id: "faq_late",
    question: "What happens if I arrive late?",
    answer:
      "Please call us if you are running more than 10 minutes late. We will do our best to keep your full appointment, but a late arrival may mean a shortened service so the next guest is not delayed.",
    keywords: "late,running late,delay,traffic,arrive",
    category: "Policy",
    sortOrder: 3,
    active: true,
  },
  {
    id: "faq_cancel",
    question: "What is your cancellation policy?",
    answer:
      "Please cancel or reschedule at least 24 hours before your appointment. Inside 24 hours, we may ask you to call the studio so a person can help.",
    keywords: "cancel,cancellation,reschedule,change,24 hours,policy",
    category: "Policy",
    sortOrder: 4,
    active: true,
  },
  {
    id: "faq_payment",
    question: "Which payment methods do you accept?",
    answer: "We accept major credit and debit cards, Apple Pay, and Google Pay. We do not accept cash.",
    keywords: "pay,payment,card,cash,apple pay,google pay",
    category: "Visit",
    sortOrder: 5,
    active: true,
  },
  {
    id: "faq_pregnancy",
    question: "I am pregnant. Which services are suitable?",
    answer:
      "Congratulations. Some treatments and products are not suitable during pregnancy. Please tell us when you book, and a practitioner will confirm what is safe for you before your visit. We do not provide medical advice.",
    keywords: "pregnant,pregnancy,baby,expecting,safe",
    category: "Safety",
    sortOrder: 6,
    active: true,
  },
  {
    id: "faq_first",
    question: "What should I expect on my first visit?",
    answer:
      "Please arrive 10 minutes early so we can settle you in and complete a short consultation. Wear comfortable clothing, and bring any skincare products you are currently using if you are coming for a facial.",
    keywords: "first visit,first time,expect,arrive early,consultation,new client",
    category: "Visit",
    sortOrder: 7,
    active: true,
  },
];
