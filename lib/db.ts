import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";

export type Contact = {
  id: number;
  name: string;
  phone: string;
  note: string;
  created_at: string;
};

export type Call = {
  id: number;
  contact_id: number;
  contact_name: string;
  contact_phone: string;
  twilio_call_sid: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
};

export type CallMessage = {
  id: number;
  call_id: number;
  role: "assistant" | "user" | "system";
  text: string;
  created_at: string;
};

const dataDir = path.join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "nestcall.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    twilio_call_sid TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    summary TEXT,
    FOREIGN KEY(contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS call_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('assistant', 'user', 'system')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(call_id) REFERENCES calls(id)
  );
`);

export function listContacts(): Contact[] {
  const stmt = db.prepare("SELECT * FROM contacts ORDER BY created_at DESC");
  return stmt.all() as Contact[];
}

export function getContactById(id: number): Contact | undefined {
  const stmt = db.prepare("SELECT * FROM contacts WHERE id = ?");
  return stmt.get(id) as Contact | undefined;
}

export function createContact(input: { name: string; phone: string; note?: string }): number {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const note = (input.note ?? "").trim();

  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO contacts (name, phone, note) VALUES (?, ?, ?)"
  );
  const result = insertStmt.run(name, phone, note);

  if (result.changes > 0) {
    return Number(result.lastInsertRowid);
  }

  const existingStmt = db.prepare("SELECT id FROM contacts WHERE phone = ? LIMIT 1");
  const existing = existingStmt.get(phone) as { id: number } | undefined;
  if (!existing) {
    throw new Error("연락처 저장에 실패했습니다.");
  }

  return existing.id;
}

export function listCalls(limit = 50): Call[] {
  const stmt = db.prepare(`
    SELECT
      c.id,
      c.contact_id,
      ct.name AS contact_name,
      ct.phone AS contact_phone,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary
    FROM calls c
    JOIN contacts ct ON ct.id = c.contact_id
    ORDER BY c.started_at DESC
    LIMIT ?
  `);

  return stmt.all(limit) as Call[];
}

export function listStaleActiveCalls(limit = 12, staleSeconds = 45): Call[] {
  const cutoff = `-${Math.max(10, staleSeconds)} seconds`;
  const stmt = db.prepare(`
    SELECT
      c.id,
      c.contact_id,
      ct.name AS contact_name,
      ct.phone AS contact_phone,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary
    FROM calls c
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.status IN ('queued', 'initiated', 'ringing', 'in-progress')
      AND c.started_at <= datetime('now', ?)
    ORDER BY c.started_at DESC
    LIMIT ?
  `);

  return stmt.all(cutoff, limit) as Call[];
}

export function findCallBySid(callSid: string): Call | undefined {
  const stmt = db.prepare(`
    SELECT
      c.id,
      c.contact_id,
      ct.name AS contact_name,
      ct.phone AS contact_phone,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary
    FROM calls c
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.twilio_call_sid = ?
    LIMIT 1
  `);

  return stmt.get(callSid) as Call | undefined;
}

export function createCall(contactId: number, callSid: string, status = "queued"): number {
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO calls (contact_id, twilio_call_sid, status) VALUES (?, ?, ?)"
  );
  insertStmt.run(contactId, callSid, status);

  const idStmt = db.prepare("SELECT id FROM calls WHERE twilio_call_sid = ?");
  const row = idStmt.get(callSid) as { id: number } | undefined;
  if (!row) {
    throw new Error("Failed to create or find call row.");
  }

  return row.id;
}

export function updateCallStatus(callSid: string, status: string): void {
  const stmt = db.prepare("UPDATE calls SET status = ? WHERE twilio_call_sid = ?");
  stmt.run(status, callSid);
}

export function finalizeCallStatus(callSid: string, status: string): void {
  const stmt = db.prepare(
    "UPDATE calls SET status = ?, ended_at = COALESCE(ended_at, datetime('now')) WHERE twilio_call_sid = ?"
  );
  stmt.run(status, callSid);
}

export function endCall(callSid: string): void {
  const stmt = db.prepare(
    "UPDATE calls SET status = 'completed', ended_at = datetime('now') WHERE twilio_call_sid = ?"
  );
  stmt.run(callSid);
}

export function setCallSummary(callId: number, summary: string): void {
  const stmt = db.prepare("UPDATE calls SET summary = ? WHERE id = ?");
  stmt.run(summary.trim(), callId);
}

export function addCallMessage(
  callId: number,
  role: "assistant" | "user" | "system",
  text: string
): number {
  const stmt = db.prepare(
    "INSERT INTO call_messages (call_id, role, text) VALUES (?, ?, ?)"
  );
  const result = stmt.run(callId, role, text.trim());
  return Number(result.lastInsertRowid);
}

export function getRecentCallMessages(callId: number, limit = 12): CallMessage[] {
  const stmt = db.prepare(
    `SELECT * FROM call_messages WHERE call_id = ? ORDER BY created_at DESC LIMIT ?`
  );

  return (stmt.all(callId, limit) as CallMessage[]).reverse();
}

export function getTranscriptForCall(callId: number): CallMessage[] {
  const stmt = db.prepare(
    "SELECT * FROM call_messages WHERE call_id = ? ORDER BY created_at ASC"
  );

  return stmt.all(callId) as CallMessage[];
}
