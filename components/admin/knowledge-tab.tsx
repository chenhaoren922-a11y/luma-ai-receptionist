"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { AdminOverview } from "@/lib/data/admin";
import type { Faq } from "@/lib/types";

import {
  Button,
  Card,
  Field,
  Modal,
  SectionTitle,
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

type FaqFormState = {
  question: string;
  answer: string;
  keywords: string;
  category: string;
  sortOrder: number;
  active: boolean;
};

function faqForm(faq?: Faq): FaqFormState {
  return {
    question: faq?.question ?? "",
    answer: faq?.answer ?? "",
    keywords: faq?.keywords ?? "",
    category: faq?.category ?? "",
    sortOrder: faq?.sortOrder ?? 0,
    active: faq?.active ?? true,
  };
}

export function KnowledgeTab({
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
  const [editing, setEditing] = useState<Faq | null | undefined>(undefined);
  const [form, setForm] = useState<FaqFormState>(faqForm());
  const [busy, setBusy] = useState(false);

  function open(faq?: Faq) {
    setEditing(faq ?? null);
    setForm(faqForm(faq));
  }

  async function save() {
    if (!form.question.trim() || !form.answer.trim()) {
      onError("Question and answer are required.");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await onMutate(
          "/api/admin/faqs",
          "PATCH",
          { ...form, id: editing.id },
          "FAQ updated.",
        );
        onSuccess("FAQ updated.");
      } else {
        await onMutate("/api/admin/faqs", "POST", form, "FAQ added.");
        onSuccess("FAQ added.");
      }
      setEditing(undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save the FAQ.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(faq: Faq) {
    if (!window.confirm(`Delete "${faq.question}"?`)) return;
    try {
      await onMutate("/api/admin/faqs", "DELETE", { id: faq.id }, "FAQ deleted.");
      onSuccess("FAQ deleted.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not delete the FAQ.");
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Knowledge base"
        description="The facts Luma is allowed to answer with. Keep answers short and specific."
        action={
          <Button onClick={() => open()}>
            <Plus size={12} /> Add FAQ
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {overview.faqs.map((faq) => (
          <Card key={faq.id} className="flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold leading-snug text-ink">{faq.question}</p>
                <StatusPill tone={faq.active ? "success" : "neutral"}>
                  {faq.active ? "live" : "hidden"}
                </StatusPill>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-soft">
                {faq.answer}
              </p>
              <p className="mt-2 text-[10px] text-muted">
                {faq.category || "General"} · keywords: {faq.keywords || "none"}
              </p>
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button variant="secondary" onClick={() => open(faq)}>
                <Pencil size={11} /> Edit
              </Button>
              <Button variant="danger" onClick={() => void remove(faq)}>
                <Trash2 size={11} /> Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? "Edit FAQ" : "Add FAQ"}
        wide
      >
        <div className="grid gap-3">
          <Field label="Question">
            <TextInput
              value={form.question}
              onChange={(event) => setForm({ ...form, question: event.target.value })}
              placeholder="Where are you located?"
            />
          </Field>
          <Field label="Answer">
            <TextArea
              value={form.answer}
              onChange={(event) => setForm({ ...form, answer: event.target.value })}
              placeholder="A clear, customer-facing answer…"
              className="min-h-[120px]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Keywords" hint="Comma-separated words used by the fallback bot.">
              <TextInput
                value={form.keywords}
                onChange={(event) => setForm({ ...form, keywords: event.target.value })}
                placeholder="address, parking, where"
              />
            </Field>
            <Field label="Category">
              <TextInput
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="Visit, Policy, Safety"
              />
            </Field>
            <Field label="Sort order">
              <TextInput
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
              />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle
                checked={form.active}
                onChange={(active) => setForm({ ...form, active })}
                label="Visible to Luma"
              />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(undefined)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save FAQ"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
