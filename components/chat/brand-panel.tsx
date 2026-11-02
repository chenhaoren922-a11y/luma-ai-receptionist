import { ArrowUpRight, Clock3, Mail, MapPin, Phone } from "lucide-react";

import type { BusinessSettings, StaffSummary } from "@/lib/types";

import { Logo } from "@/components/ui/logo";
import { storeStatus, summarizeHours } from "./format";

export function BrandPanel({
  business,
  staff,
  serviceCount,
}: {
  business: BusinessSettings;
  staff: StaffSummary[];
  serviceCount: number;
}) {
  const status = storeStatus(business);
  const hours = summarizeHours(business.hours);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col justify-between py-2 lg:flex xl:w-[330px]">
      <div>
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="font-display text-[26px] leading-none tracking-[-0.02em]">
              {business.businessName}
            </p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
              AI Receptionist
            </p>
          </div>
        </div>

        <p className="mt-7 max-w-[250px] font-display text-[24px] leading-[1.25] text-ink-soft">
          {business.tagline}
        </p>

        <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-3 py-1.5 text-[12px] text-ink-soft">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status.open ? "bg-sage" : "bg-accent"
            }`}
          />
          {status.label}
        </div>

        <div className="mt-8 space-y-4 text-[13px] text-ink-soft">
          <div className="flex items-start gap-3">
            <Clock3 size={15} className="mt-0.5 shrink-0 text-muted" />
            <div className="space-y-0.5">
              {hours.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin size={15} className="mt-0.5 shrink-0 text-muted" />
            <p>{business.address}</p>
          </div>
          <a
            className="focus-ring flex items-center gap-3 rounded-lg transition hover:text-accent"
            href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}
          >
            <Phone size={15} className="shrink-0 text-muted" />
            <span>{business.phone}</span>
          </a>
          <a
            className="focus-ring flex items-center gap-3 rounded-lg transition hover:text-accent"
            href={`mailto:${business.email}`}
          >
            <Mail size={15} className="shrink-0 text-muted" />
            <span>{business.email}</span>
          </a>
        </div>

        <div className="mt-9">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            The team
          </p>
          <div className="mt-3 space-y-2.5">
            {staff.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: member.color }}
                >
                  {member.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <p className="text-[12px] font-medium text-ink">{member.name}</p>
                  <p className="text-[11px] text-muted">{member.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
        <p>
          {serviceCount} services · booked in real time
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span>Powered by Luma AI</span>
          <a
            href="/admin"
            className="focus-ring inline-flex items-center gap-1 rounded transition hover:text-accent"
          >
            Studio login <ArrowUpRight size={11} />
          </a>
        </div>
      </div>
    </aside>
  );
}
