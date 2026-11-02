import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import {
  createFaq,
  deleteFaq,
  updateFaq,
  type FaqInput,
} from "@/lib/data/admin";
import { getFaqs } from "@/lib/data/catalog";
import { AppError } from "@/lib/errors";
import {
  booleanField,
  json,
  numberField,
  readJson,
  routeError,
  stringField,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readFaqInput(body: unknown): FaqInput {
  const question = stringField(body, "question", { required: true, max: 300 });
  const answer = stringField(body, "answer", { required: true, max: 2000 });
  if (!question || !answer) {
    throw new AppError("MISSING_FAQ_FIELDS", "Question and answer are required.");
  }
  return {
    question,
    answer,
    keywords: stringField(body, "keywords", { max: 500 }) ?? "",
    category: stringField(body, "category", { max: 50 }) ?? "",
    sortOrder: numberField(body, "sortOrder", { min: 0, max: 9999, fallback: 0 }) ?? 0,
    active: booleanField(body, "active", true),
  };
}

export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return json({ faqs: getFaqs(getDb(), false) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const body = await readJson(request);
    return json({ faq: createFaq(db, readFaqInput(body)) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireAdmin(request);
    const db = getDb();
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    if (!id) throw new AppError("MISSING_ID", "FAQ id is required.");
    return json({ faq: updateFaq(db, id, readFaqInput(body)) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireAdmin(request);
    const body = await readJson(request);
    const id = stringField(body, "id", { required: true, max: 100 });
    if (!id) throw new AppError("MISSING_ID", "FAQ id is required.");
    deleteFaq(getDb(), id);
    return json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
