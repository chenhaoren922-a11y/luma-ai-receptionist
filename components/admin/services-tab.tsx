"use client";

import { Pencil, Plus, Scissors, UserRound, Users } from "lucide-react";
import { useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";
import type { Service, Staff } from "@/lib/types";

import { formatMoney } from "@/components/chat/format";
import {
  Button,
  Card,
  Field,
  Modal,
  SectionTitle,
  Select,
  StatusPill,
  TextArea,
  TextInput,
  Toggle,
} from "./ui";

type Mutate = (
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  successMessage?: string,
) => Promise<unknown>;

type ServiceFormState = {
  name: string;
  description: string;
  durationMin: number;
  bufferMin: number;
  priceDollars: number;
  currency: string;
  category: string;
  color: string;
  active: boolean;
  sortOrder: number;
  staffIds: string[];
};

type StaffFormState = {
  name: string;
  title: string;
  bio: string;
  color: string;
  active: boolean;
  serviceIds: string[];
};

function serviceForm(service?: Service, staff: Staff[] = []): ServiceFormState {
  return {
    name: service?.name ?? "",
    description: service?.description ?? "",
    durationMin: service?.durationMin ?? 60,
    bufferMin: service?.bufferMin ?? 10,
    priceDollars: service ? service.priceCents / 100 : 100,
    currency: service?.currency ?? "USD",
    category: service?.category ?? "",
    color: service?.color ?? "#c96f4a",
    active: service?.active ?? true,
    sortOrder: service?.sortOrder ?? 0,
    staffIds: service
      ? staff.filter((member) => member.serviceIds.includes(service.id)).map((member) => member.id)
      : staff.map((member) => member.id),
  };
}

function staffForm(member?: Staff): StaffFormState {
  return {
    name: member?.name ?? "",
    title: member?.title ?? "",
    bio: member?.bio ?? "",
    color: member?.color ?? "#7c8f7b",
    active: member?.active ?? true,
    serviceIds: member?.serviceIds ?? [],
  };
}

export function ServicesTab({
  overview,
  onMutate,
  onError,
  onSuccess,
}: {
  overview: AdminOverview;
  onMutate: Mutate;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [serviceEditing, setServiceEditing] = useState<Service | null | undefined>(undefined);
  const [staffEditing, setStaffEditing] = useState<Staff | null | undefined>(undefined);
  const [serviceState, setServiceState] = useState<ServiceFormState>(serviceForm());
  const [staffState, setStaffState] = useState<StaffFormState>(staffForm());
  const [busy, setBusy] = useState(false);

  function openService(service?: Service) {
    setServiceEditing(service ?? null);
    setServiceState(serviceForm(service, overview.staff));
  }

  function openStaff(member?: Staff) {
    setStaffEditing(member ?? null);
    setStaffState(staffForm(member));
  }

  async function saveService() {
    if (!serviceState.name.trim()) {
      onError("Service name is required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...serviceState,
        priceCents: Math.round(serviceState.priceDollars * 100),
      };
      if (serviceEditing) {
        await onMutate(
          "/api/admin/services",
          "PATCH",
          { ...payload, id: serviceEditing.id },
          "Service updated.",
        );
        onSuccess("Service updated.");
      } else {
        await onMutate("/api/admin/services", "POST", payload, "Service added.");
        onSuccess("Service added.");
      }
      setServiceEditing(undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save the service.");
    } finally {
      setBusy(false);
    }
  }

  async function saveStaff() {
    if (!staffState.name.trim()) {
      onError("Team member name is required.");
      return;
    }
    setBusy(true);
    try {
      if (staffEditing) {
        await onMutate(
          "/api/admin/staff",
          "PATCH",
          { ...staffState, id: staffEditing.id },
          "Team member updated.",
        );
        onSuccess("Team member updated.");
      } else {
        await onMutate("/api/admin/staff", "POST", staffState, "Team member added.");
        onSuccess("Team member added.");
      }
      setStaffEditing(undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save the team member.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateService(service: Service) {
    if (!window.confirm(`Deactivate ${service.name}? Existing appointments are kept.`)) return;
    try {
      await onMutate("/api/admin/services", "DELETE", { id: service.id }, "Service deactivated.");
      onSuccess("Service deactivated.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not deactivate the service.");
    }
  }

  async function deactivateStaff(member: Staff) {
    if (!window.confirm(`Deactivate ${member.name}? Existing appointments are kept.`)) return;
    try {
      await onMutate("/api/admin/staff", "DELETE", { id: member.id }, "Team member deactivated.");
      onSuccess("Team member deactivated.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not deactivate the team member.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle
          title="Services"
          description="Durations, buffers, prices, and who can deliver each service."
          action={
            <Button onClick={() => openService()}>
              <Plus size={12} /> Add service
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.services.map((service) => {
            const people = overview.staff.filter((member) =>
              member.serviceIds.includes(service.id),
            );
            return (
              <Card key={service.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: service.color }}
                      />
                      <div>
                        <p className="text-[13px] font-semibold text-ink">{service.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {service.durationMin} min · {formatMoney(service.priceCents, service.currency)}
                        </p>
                      </div>
                    </div>
                    <StatusPill tone={service.active ? "success" : "neutral"}>
                      {service.active ? "active" : "hidden"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted">
                    {service.description || "No description yet."}
                  </p>
                  <p className="mt-2 text-[10px] text-muted">
                    {people.length ? people.map((person) => person.name).join(", ") : "No team assigned"}
                  </p>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button variant="secondary" onClick={() => openService(service)}>
                    <Pencil size={11} /> Edit
                  </Button>
                  {service.active && (
                    <Button variant="danger" onClick={() => void deactivateService(service)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle
          title="Team"
          description="The people customers can be booked with."
          action={
            <Button onClick={() => openStaff()}>
              <Plus size={12} /> Add team member
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.staff.map((member) => (
            <Card key={member.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-[12px] font-semibold text-white"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{member.name}</p>
                    <p className="text-[11px] text-muted">{member.title || "Team member"}</p>
                  </div>
                </div>
                <StatusPill tone={member.active ? "success" : "neutral"}>
                  {member.active ? "active" : "hidden"}
                </StatusPill>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted">
                {member.bio || "No bio yet."}
              </p>
              <p className="mt-2 text-[10px] text-muted">
                {member.serviceIds.length
                  ? member.serviceIds
                      .map((id) => overview.services.find((service) => service.id === id)?.name)
                      .filter(Boolean)
                      .join(" · ")
                  : "No services assigned"}
              </p>
              <div className="mt-3 flex gap-1.5">
                <Button variant="secondary" onClick={() => openStaff(member)}>
                  <Pencil size={11} /> Edit
                </Button>
                {member.active && (
                  <Button variant="danger" onClick={() => void deactivateStaff(member)}>
                    Deactivate
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal
        open={serviceEditing !== undefined}
        onClose={() => setServiceEditing(undefined)}
        title={serviceEditing ? "Edit service" : "Add service"}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <TextInput
              value={serviceState.name}
              onChange={(event) => setServiceState({ ...serviceState, name: event.target.value })}
              placeholder="Signature Facial"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <TextArea
              value={serviceState.description}
              onChange={(event) =>
                setServiceState({ ...serviceState, description: event.target.value })
              }
              placeholder="What the guest can expect…"
            />
          </Field>
          <Field label="Duration (minutes)">
            <TextInput
              type="number"
              min={5}
              max={480}
              value={serviceState.durationMin}
              onChange={(event) =>
                setServiceState({ ...serviceState, durationMin: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Buffer (minutes)" hint="Reset time after the service.">
            <TextInput
              type="number"
              min={0}
              max={120}
              value={serviceState.bufferMin}
              onChange={(event) =>
                setServiceState({ ...serviceState, bufferMin: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Price (USD)">
            <TextInput
              type="number"
              min={0}
              step="1"
              value={serviceState.priceDollars}
              onChange={(event) =>
                setServiceState({ ...serviceState, priceDollars: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Category">
            <TextInput
              value={serviceState.category}
              onChange={(event) =>
                setServiceState({ ...serviceState, category: event.target.value })
              }
              placeholder="Skin, Body, Hair…"
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={serviceState.color}
              onChange={(event) => setServiceState({ ...serviceState, color: event.target.value })}
              className="h-10 w-full rounded-xl border border-line bg-paper/50 p-1"
            />
          </Field>
          <Field label="Sort order">
            <TextInput
              type="number"
              min={0}
              value={serviceState.sortOrder}
              onChange={(event) =>
                setServiceState({ ...serviceState, sortOrder: Number(event.target.value) })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Who can deliver this service
            </p>
            <div className="flex flex-wrap gap-2">
              {overview.staff.map((member) => {
                const checked = serviceState.staffIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() =>
                      setServiceState({
                        ...serviceState,
                        staffIds: checked
                          ? serviceState.staffIds.filter((id) => id !== member.id)
                          : [...serviceState.staffIds, member.id],
                      })
                    }
                    className={`focus-ring rounded-full border px-3 py-1.5 text-[11px] transition ${
                      checked
                        ? "border-sage/40 bg-sage-soft/50 text-ink"
                        : "border-line bg-paper/60 text-muted"
                    }`}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Toggle
              checked={serviceState.active}
              onChange={(active) => setServiceState({ ...serviceState, active })}
              label="Visible to customers"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setServiceEditing(undefined)}>
            Cancel
          </Button>
          <Button onClick={() => void saveService()} disabled={busy}>
            {busy ? "Saving…" : "Save service"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={staffEditing !== undefined}
        onClose={() => setStaffEditing(undefined)}
        title={staffEditing ? "Edit team member" : "Add team member"}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={staffState.name}
              onChange={(event) => setStaffState({ ...staffState, name: event.target.value })}
              placeholder="Ava Bennett"
            />
          </Field>
          <Field label="Title">
            <TextInput
              value={staffState.title}
              onChange={(event) => setStaffState({ ...staffState, title: event.target.value })}
              placeholder="Lead Esthetician"
            />
          </Field>
          <Field label="Bio" className="sm:col-span-2">
            <TextArea
              value={staffState.bio}
              onChange={(event) => setStaffState({ ...staffState, bio: event.target.value })}
              placeholder="A short introduction for the team panel."
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={staffState.color}
              onChange={(event) => setStaffState({ ...staffState, color: event.target.value })}
              className="h-10 w-full rounded-xl border border-line bg-paper/50 p-1"
            />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle
              checked={staffState.active}
              onChange={(active) => setStaffState({ ...staffState, active })}
              label="Bookable"
            />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Services they can deliver
            </p>
            <div className="flex flex-wrap gap-2">
              {overview.services.map((service) => {
                const checked = staffState.serviceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      setStaffState({
                        ...staffState,
                        serviceIds: checked
                          ? staffState.serviceIds.filter((id) => id !== service.id)
                          : [...staffState.serviceIds, service.id],
                      })
                    }
                    className={`focus-ring rounded-full border px-3 py-1.5 text-[11px] transition ${
                      checked
                        ? "border-sage/40 bg-sage-soft/50 text-ink"
                        : "border-line bg-paper/60 text-muted"
                    }`}
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStaffEditing(undefined)}>
            Cancel
          </Button>
          <Button onClick={() => void saveStaff()} disabled={busy}>
            {busy ? "Saving…" : "Save team member"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
