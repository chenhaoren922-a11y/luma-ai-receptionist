import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Connect Google Calendar — Luma Studio",
};

const steps = [
  {
    title: "Create a Google Cloud project",
    body: "Open console.cloud.google.com, create a project, then go to APIs & Services → Library and enable the Google Calendar API.",
  },
  {
    title: "Configure the OAuth consent screen",
    body: "Choose External (or Internal for Google Workspace). Add the scope https://www.googleapis.com/auth/calendar.events and add the studio Google account as a test user while the app is in testing.",
  },
  {
    title: "Create an OAuth web client",
    body: "Go to APIs & Services → Credentials → Create credentials → OAuth client ID. Choose Web application and add http://localhost:3000/api/google/callback as an authorized redirect URI.",
  },
  {
    title: "Add credentials to .env.local",
    body: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and optionally GOOGLE_CALENDAR_ID. Restart the app after saving.",
  },
  {
    title: "Connect from the dashboard",
    body: "Sign in at /admin, open Settings → Google Calendar, click Connect, and approve the calendar events permission. Use Test to verify access, and Backfill to push existing local-only bookings.",
  },
];

export default function GoogleCalendarSetupPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <Link
        href="/admin"
        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted transition hover:text-accent"
      >
        ← Back to studio dashboard
      </Link>
      <h1 className="mt-4 font-display text-[38px] leading-tight text-ink">
        Connect Google Calendar
      </h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
        Google credentials are optional. Without them, the studio runs on local SQLite
        scheduling. With them, confirmed appointments are written to one unified Google
        Calendar and external busy events are respected when checking availability.
      </p>

      <div className="mt-8 space-y-3">
        {steps.map((step, index) => (
          <div key={step.title} className="paper-card rounded-2xl p-4">
            <div className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper">
                {index + 1}
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">{step.title}</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-accent/25 bg-accent-soft/25 p-4">
        <h2 className="text-[13px] font-semibold text-accent-dark">Environment variables</h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-3 text-[11px] leading-relaxed text-paper">
{`APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_CALENDAR_ID=primary`}
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
          The OAuth token is stored at <code>data/google-token.json</code> and is gitignored.
          Protect it like a password. Apps in Google Testing mode may need reconnecting about
          every seven days.
        </p>
      </div>

      <div className="mt-8 space-y-2 text-[12px] leading-relaxed text-ink-soft">
        <h2 className="font-display text-[24px] text-ink">What gets synced</h2>
        <p>
          The event title is <code>Appointment · Service · Customer</code>. The description
          contains the booking code, service, team member, and phone number. Private extended
          properties identify the booking so retries do not create duplicates.
        </p>
        <p>
          Cancelling deletes the event. Rescheduling updates it. External events on the
          calendar block availability; events created by this app are skipped because local
          SQLite already knows which team member is booked.
        </p>
        <p>
          The full setup guide is also in the repository at{" "}
          <code>docs/google-calendar-setup.md</code>.
        </p>
      </div>
    </div>
  );
}
