import { newId, nowIso, withTransaction, type Db } from "@/lib/db/client";
import type { ChatMessageRecord, ChatRole, ConversationStatus, Handoff, UiBlock } from "@/lib/types";

export type ConversationRecord = {
  id: string;
  status: ConversationStatus;
  customerName: string;
  phone: string;
  state: Record<string, unknown>;
  context: Record<string, unknown>;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationRow = Omit<ConversationRecord, "state" | "context"> & {
  stateJson: string;
  contextJson: string;
};

const conversationFields = `c.id, c.status, c.customer_name AS customerName, c.phone,
  c.state_json AS stateJson, c.context_json AS contextJson, c.last_message AS lastMessage,
  c.created_at AS createdAt, c.updated_at AS updatedAt`;

export function getConversation(db: Db, id: string): ConversationRecord | undefined {
  const row = db.prepare(`SELECT ${conversationFields} FROM conversations c WHERE c.id = ?`)
    .get(id) as ConversationRow | undefined;
  if (!row) return undefined;
  const { stateJson, contextJson, ...conversation } = row;
  return { ...conversation, state: JSON.parse(stateJson), context: JSON.parse(contextJson) };
}

export function ensureConversation(db: Db, id = newId("chat_")): ConversationRecord {
  const now = nowIso();
  db.prepare(`INSERT OR IGNORE INTO conversations(id, created_at, updated_at)
    VALUES (?, ?, ?)`).run(id, now, now);
  return getConversation(db, id)!;
}

export function updateConversationState(db: Db, id: string, state: Record<string, unknown>): void {
  db.prepare("UPDATE conversations SET state_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(state), nowIso(), id);
}

export function updateConversationContext(db: Db, id: string, patch: Record<string, unknown>): void {
  const context = { ...getConversation(db, id)?.context, ...patch };
  db.prepare("UPDATE conversations SET context_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(context), nowIso(), id);
}

export function updateConversationCustomer(db: Db, id: string, name: string, phone: string): void {
  db.prepare("UPDATE conversations SET customer_name = ?, phone = ?, updated_at = ? WHERE id = ?")
    .run(name, phone, nowIso(), id);
}

export function appendMessage(db: Db, input: {
  conversationId: string;
  role: ChatRole;
  content: string;
  ui?: UiBlock[];
}): ChatMessageRecord {
  const { conversationId, role, content, ui } = input;
  const message = { id: newId("msg_"), conversationId, role, content,
    uiJson: ui ? JSON.stringify(ui) : null, createdAt: nowIso() };
  withTransaction(db, () => {
    db.prepare(`INSERT INTO messages(id, conversation_id, role, content, ui_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(message.id, conversationId, role, content, message.uiJson, message.createdAt);
    db.prepare("UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?")
      .run(content, message.createdAt, conversationId);
  });
  return message;
}

export function getMessages(db: Db, id: string, limit = 100): ChatMessageRecord[] {
  const rows = db.prepare(`SELECT id, conversation_id AS conversationId, role, content,
    ui_json AS uiJson, created_at AS createdAt FROM messages WHERE conversation_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(id, limit);
  return (rows as ChatMessageRecord[]).reverse();
}

export function listConversations(db: Db, limit = 50) {
  const rows = db.prepare(`SELECT c.id, c.status, c.customer_name AS customerName, c.phone,
    c.last_message AS lastMessage, c.created_at AS createdAt, c.updated_at AS updatedAt,
    EXISTS(SELECT 1 FROM handoffs h WHERE h.conversation_id = c.id AND h.status = 'open') AS handoffOpen
    FROM conversations c ORDER BY c.updated_at DESC LIMIT ?`).all(limit);
  type Summary = Omit<ConversationRecord, "state" | "context"> & { handoffOpen: number };
  return (rows as Summary[]).map((row) => ({ ...row, handoffOpen: Boolean(row.handoffOpen) }));
}

export function createHandoff(db: Db, conversationId: string, reason: string): Handoff {
  const handoff: Handoff = { id: newId("handoff_"), conversationId, reason, status: "open", createdAt: nowIso() };
  withTransaction(db, () => {
    db.prepare("INSERT INTO handoffs(id, conversation_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(handoff.id, conversationId, reason, handoff.status, handoff.createdAt);
    db.prepare("UPDATE conversations SET status = 'handed_off', updated_at = ? WHERE id = ?")
      .run(handoff.createdAt, conversationId);
  });
  return handoff;
}

export const getRecentMessages = getMessages;
