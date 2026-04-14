import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { CallLanguage, SupportedCountry } from "@/lib/domain";

export type Contact = {
  id: number;
  name: string;
  phone_e164: string;
  phone_raw: string;
  country_iso2: SupportedCountry;
  dial_code: string;
  preferred_language: CallLanguage;
  note: string;
  deleted_at: string | null;
  created_at: string;
};

export type ContactListOptions = {
  includeDeleted?: boolean;
};

export type Call = {
  id: number;
  contact_id: number;
  contact_name: string;
  contact_phone_e164: string;
  contact_deleted_at: string | null;
  twilio_call_sid: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  call_language: CallLanguage;
  question_set_id: number | null;
  summary_status: "pending" | "done" | "failed";
};

export type CallListFilters = {
  limit?: number;
  status?: string;
  contactId?: number;
  language?: CallLanguage;
  dateFrom?: string;
  dateTo?: string;
};

export type CallMessage = {
  id: number;
  call_id: number;
  role: "assistant" | "user" | "system";
  text: string;
  created_at: string;
};

export type QuestionSetScope = "global" | "contact";

export type QuestionSet = {
  id: number;
  name: string;
  scope: QuestionSetScope;
  contact_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: number;
  question_set_id: number;
  order_index: number;
  is_required: boolean;
  is_active: boolean;
  text_ko: string;
  text_en: string;
  text_da: string;
  text_ar_eg: string;
  text_az: string;
  created_at: string;
  updated_at: string;
};

export type LocalizedQuestion = Question & {
  localized_text: string;
};

export type CallQuestionAnswer = {
  id: number;
  call_id: number;
  question_id: number;
  question_text: string;
  asked: boolean;
  answered: boolean;
  answer_text: string;
  evidence_text: string;
  confidence: number | null;
  resolution_status: "resolved" | "unresolved";
  answered_at: string | null;
};

export type CreateContactInput = {
  name: string;
  phone: string;
  phoneRaw?: string;
  countryIso2?: SupportedCountry;
  dialCode?: string;
  preferredLanguage?: CallLanguage;
  note?: string;
};

export type CreateContactOptions = {
  allowExisting?: boolean;
};

export type UpdateContactInput = {
  id: number;
  name?: string;
  phoneE164?: string;
  phoneRaw?: string;
  countryIso2?: SupportedCountry;
  dialCode?: string;
  preferredLanguage?: CallLanguage;
  note?: string;
};

export type CreateQuestionSetInput = {
  name: string;
  scope: QuestionSetScope;
  contactId?: number | null;
  isActive?: boolean;
};

export type UpsertQuestionInput = {
  questionSetId: number;
  orderIndex: number;
  isRequired?: boolean;
  isActive?: boolean;
  textKo: string;
  textEn: string;
  textDa: string;
  textArEg: string;
  textAz: string;
};

export type ReplaceCallQuestionAnswerInput = {
  questionId: number;
  asked: boolean;
  answered: boolean;
  answerText?: string;
  evidenceText?: string;
  confidence?: number | null;
  resolutionStatus?: "resolved" | "unresolved";
};

const DEFAULT_GLOBAL_QUESTION_SET_NAME = "기본 안부 체크리스트";
const DELETED_CONTACT_ANCHOR_NOTE = "__system_deleted_contact_anchor__";
const DELETED_CONTACT_ANCHOR_PHONE = "__deleted_contact_anchor__";

const DEFAULT_GLOBAL_QUESTIONS: Array<{
  orderIndex: number;
  isRequired: boolean;
  textKo: string;
  textEn: string;
  textDa: string;
  textArEg: string;
  textAz: string;
}> = [
  {
    orderIndex: 1,
    isRequired: true,
    textKo: "오늘 식사는 하셨어요?",
    textEn: "Did you have your meals today?",
    textDa: "Fik du spist dine måltider i dag?",
    textArEg: "كلت وجباتك النهارده؟",
    textAz: "Bu gün yeməklərini yedinmi?"
  },
  {
    orderIndex: 2,
    isRequired: true,
    textKo: "어젯밤 잠은 괜찮게 주무셨어요?",
    textEn: "Did you sleep well last night?",
    textDa: "Sov du godt i nat?",
    textArEg: "نمت كويس امبارح بالليل؟",
    textAz: "Dünən gecə yaxşı yata bildinmi?"
  },
  {
    orderIndex: 3,
    isRequired: true,
    textKo: "오늘 몸 상태나 통증은 어떠세요?",
    textEn: "How is your physical condition or pain today?",
    textDa: "Hvordan er din fysiske tilstand eller smerte i dag?",
    textArEg: "عامل إيه النهارده من ناحية الصحة أو الألم؟",
    textAz: "Bu gün fiziki vəziyyətin və ya ağrıların necədir?"
  },
  {
    orderIndex: 4,
    isRequired: false,
    textKo: "오늘 기분은 어떠셨어요?",
    textEn: "How was your mood today?",
    textDa: "Hvordan var dit humør i dag?",
    textArEg: "كان مزاجك عامل إزاي النهارده؟",
    textAz: "Bu gün əhvalın necə idi?"
  },
  {
    orderIndex: 5,
    isRequired: false,
    textKo: "지금 바로 도움이 필요한 일이 있으세요?",
    textEn: "Is there anything you need immediate help with right now?",
    textDa: "Er der noget, du har brug for akut hjælp til lige nu?",
    textArEg: "في حاجة محتاج مساعدة فورية فيها دلوقتي؟",
    textAz: "Hazırda təcili köməyə ehtiyacın olan bir şey varmı?"
  }
];

type D1Like = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
};

let schemaReadyPromise: Promise<void> | null = null;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const asString = String(value);
  return asString.length > 0 ? asString : null;
}

function toBoolean(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

function toSummaryStatus(value: unknown): "pending" | "done" | "failed" {
  const normalized = String(value ?? "pending").toLowerCase();
  if (normalized === "done" || normalized === "failed") {
    return normalized;
  }
  return "pending";
}

function toRole(value: unknown): "assistant" | "user" | "system" {
  const normalized = String(value ?? "system");
  if (normalized === "assistant" || normalized === "user") {
    return normalized;
  }
  return "system";
}

function toLanguage(value: unknown): CallLanguage {
  const normalized = String(value ?? "ko");
  if (normalized === "ko" || normalized === "da" || normalized === "ar-EG" || normalized === "az") {
    return normalized;
  }
  return normalized === "en" ? "en" : "ko";
}

function toCountryIso2(value: unknown): SupportedCountry {
  const normalized = String(value ?? "KR");
  if (normalized === "US" || normalized === "DK" || normalized === "AZ" || normalized === "EG") {
    return normalized;
  }
  return "KR";
}

function questionTextForLanguage(question: Question, language: CallLanguage): string {
  if (language === "ko") {
    return question.text_ko || question.text_en;
  }
  if (language === "da") {
    return question.text_da || question.text_en;
  }
  if (language === "ar-EG") {
    return question.text_ar_eg || question.text_en;
  }
  if (language === "az") {
    return question.text_az || question.text_en;
  }
  return (
    question.text_en ||
    question.text_ko ||
    question.text_da ||
    question.text_ar_eg ||
    question.text_az
  );
}

async function getD1(): Promise<D1Like> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as { AGENTCALL_DB?: unknown }).AGENTCALL_DB;
  if (!db || typeof (db as D1Like).prepare !== "function") {
    throw new Error(
      "Missing D1 binding `AGENTCALL_DB`. Check wrangler d1_databases config."
    );
  }
  return db as D1Like;
}

async function directRun(db: D1Like, query: string, values: unknown[] = []): Promise<void> {
  await db.prepare(query).bind(...values).run();
}

async function directAll<T extends Record<string, unknown>>(
  db: D1Like,
  query: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await db.prepare(query).bind(...values).all<T>();
  return result.results ?? [];
}

async function directFirst<T extends Record<string, unknown>>(
  db: D1Like,
  query: string,
  values: unknown[] = []
): Promise<T | undefined> {
  const row = await db.prepare(query).bind(...values).first<T>();
  return row ?? undefined;
}

async function hasColumn(db: D1Like, tableName: string, columnName: string): Promise<boolean> {
  const rows = await directAll<{ name: string }>(db, `PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function addColumnIfMissing(
  db: D1Like,
  tableName: string,
  columnName: string,
  columnDef: string
): Promise<void> {
  const exists = await hasColumn(db, tableName, columnName);
  if (exists) {
    return;
  }
  await directRun(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
}

async function ensureSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const db = await getD1();

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );

      await addColumnIfMissing(db, "contacts", "phone_e164", "phone_e164 TEXT");
      await addColumnIfMissing(db, "contacts", "phone_raw", "phone_raw TEXT");
      await addColumnIfMissing(db, "contacts", "country_iso2", "country_iso2 TEXT");
      await addColumnIfMissing(db, "contacts", "dial_code", "dial_code TEXT");
      await addColumnIfMissing(
        db,
        "contacts",
        "preferred_language",
        "preferred_language TEXT NOT NULL DEFAULT 'ko'"
      );
      await addColumnIfMissing(db, "contacts", "deleted_at", "deleted_at TEXT");

      await directRun(
        db,
        `UPDATE contacts
         SET phone_e164 = COALESCE(NULLIF(phone_e164, ''), phone)
         WHERE phone_e164 IS NULL OR trim(phone_e164) = ''`
      );
      await directRun(
        db,
        `UPDATE contacts
         SET phone_raw = COALESCE(
           NULLIF(phone_raw, ''),
           replace(replace(replace(COALESCE(phone_e164, ''), '+', ''), '-', ''), ' ', '')
         )
         WHERE phone_raw IS NULL OR trim(phone_raw) = ''`
      );
      await directRun(
        db,
        `UPDATE contacts
         SET country_iso2 = COALESCE(
           NULLIF(country_iso2, ''),
           CASE
             WHEN COALESCE(phone_e164, '') LIKE '+1%' THEN 'US'
             WHEN COALESCE(phone_e164, '') LIKE '+45%' THEN 'DK'
             WHEN COALESCE(phone_e164, '') LIKE '+994%' THEN 'AZ'
             WHEN COALESCE(phone_e164, '') LIKE '+20%' THEN 'EG'
             ELSE 'KR'
           END
         )
         WHERE country_iso2 IS NULL OR trim(country_iso2) = ''`
      );
      await directRun(
        db,
        `UPDATE contacts
         SET dial_code = COALESCE(
           NULLIF(dial_code, ''),
           CASE country_iso2
             WHEN 'US' THEN '+1'
             WHEN 'DK' THEN '+45'
             WHEN 'AZ' THEN '+994'
             WHEN 'EG' THEN '+20'
             ELSE '+82'
           END
         )
         WHERE dial_code IS NULL OR trim(dial_code) = ''`
      );
      await directRun(
        db,
        `UPDATE contacts
         SET preferred_language = COALESCE(
           NULLIF(preferred_language, ''),
           CASE country_iso2
             WHEN 'DK' THEN 'da'
             WHEN 'AZ' THEN 'az'
             WHEN 'EG' THEN 'ar-EG'
             ELSE 'ko'
           END
         )
         WHERE preferred_language IS NULL OR trim(preferred_language) = ''`
      );

      await directRun(
        db,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_active_phone_e164_unique
         ON contacts(phone_e164)
         WHERE deleted_at IS NULL`
      );
      await directRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_contacts_active_created
         ON contacts(deleted_at, created_at DESC)`
      );

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL,
          twilio_call_sid TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'queued',
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          ended_at TEXT,
          summary TEXT,
          call_language TEXT NOT NULL DEFAULT 'en',
          question_set_id INTEGER,
          summary_status TEXT NOT NULL DEFAULT 'pending',
          contact_name_snapshot TEXT,
          contact_phone_e164_snapshot TEXT,
          FOREIGN KEY(contact_id) REFERENCES contacts(id)
        )`
      );

      await addColumnIfMissing(
        db,
        "calls",
        "call_language",
        "call_language TEXT NOT NULL DEFAULT 'en'"
      );
      await addColumnIfMissing(db, "calls", "question_set_id", "question_set_id INTEGER");
      await addColumnIfMissing(
        db,
        "calls",
        "summary_status",
        "summary_status TEXT NOT NULL DEFAULT 'pending'"
      );
      await addColumnIfMissing(db, "calls", "contact_name_snapshot", "contact_name_snapshot TEXT");
      await addColumnIfMissing(
        db,
        "calls",
        "contact_phone_e164_snapshot",
        "contact_phone_e164_snapshot TEXT"
      );

      await directRun(
        db,
        `UPDATE calls
         SET summary_status = CASE
           WHEN summary IS NOT NULL AND trim(summary) <> '' THEN 'done'
           WHEN summary_status IS NULL OR trim(summary_status) = '' THEN 'pending'
           ELSE summary_status
         END`
      );
      await directRun(
        db,
        `UPDATE calls
         SET contact_name_snapshot = COALESCE(
           NULLIF(contact_name_snapshot, ''),
           (SELECT name FROM contacts WHERE contacts.id = calls.contact_id),
           'Deleted contact'
         ),
             contact_phone_e164_snapshot = COALESCE(
               NULLIF(contact_phone_e164_snapshot, ''),
               (SELECT COALESCE(phone_e164, phone, '') FROM contacts WHERE contacts.id = calls.contact_id),
               ''
             )`
      );

      await directRun(db, `CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`);
      await directRun(db, `CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at DESC)`);
      await directRun(db, `CREATE INDEX IF NOT EXISTS idx_calls_lang ON calls(call_language)`);

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS call_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_id INTEGER NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('assistant', 'user', 'system')),
          text TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(call_id) REFERENCES calls(id)
        )`
      );
      await directRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_call_messages_call_created
         ON call_messages(call_id, created_at ASC)`
      );

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS question_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          scope TEXT NOT NULL CHECK(scope IN ('global', 'contact')),
          contact_id INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(contact_id) REFERENCES contacts(id)
        )`
      );

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_set_id INTEGER NOT NULL,
          order_index INTEGER NOT NULL DEFAULT 0,
          is_required INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          text_ko TEXT NOT NULL DEFAULT '',
          text_en TEXT NOT NULL DEFAULT '',
          text_da TEXT NOT NULL DEFAULT '',
          text_ar_eg TEXT NOT NULL DEFAULT '',
          text_az TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(question_set_id) REFERENCES question_sets(id)
        )`
      );

      await addColumnIfMissing(db, "questions", "text_ko", "text_ko TEXT NOT NULL DEFAULT ''");

      await directRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_question_sets_scope
         ON question_sets(scope, contact_id, is_active)`
      );
      await directRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_questions_set_order
         ON questions(question_set_id, is_active, order_index ASC)`
      );

      await directRun(
        db,
        `CREATE TABLE IF NOT EXISTS call_question_answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          call_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          asked INTEGER NOT NULL DEFAULT 0,
          answered INTEGER NOT NULL DEFAULT 0,
          answer_text TEXT NOT NULL DEFAULT '',
          evidence_text TEXT NOT NULL DEFAULT '',
          confidence REAL,
          resolution_status TEXT NOT NULL DEFAULT 'resolved' CHECK(resolution_status IN ('resolved', 'unresolved')),
          answered_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(call_id) REFERENCES calls(id),
          FOREIGN KEY(question_id) REFERENCES questions(id)
        )`
      );

      await directRun(
        db,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_call_question_answers_unique
         ON call_question_answers(call_id, question_id)`
      );
      await directRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_call_question_answers_call
         ON call_question_answers(call_id, answered, resolution_status)`
      );
    })();
  }

  await schemaReadyPromise;
}

async function allRows<T extends Record<string, unknown>>(
  query: string,
  values: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const db = await getD1();
  return directAll<T>(db, query, values);
}

async function firstRow<T extends Record<string, unknown>>(
  query: string,
  values: unknown[] = []
): Promise<T | undefined> {
  await ensureSchema();
  const db = await getD1();
  return directFirst<T>(db, query, values);
}

async function run(query: string, values: unknown[] = []): Promise<void> {
  await ensureSchema();
  const db = await getD1();
  await directRun(db, query, values);
}

export async function listContacts(options: ContactListOptions = {}): Promise<Contact[]> {
  const includeDeleted = options.includeDeleted === true;
  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT
      id,
      name,
      COALESCE(phone_e164, phone, '') AS phone_e164,
      COALESCE(phone_raw, '') AS phone_raw,
      COALESCE(country_iso2, 'KR') AS country_iso2,
      COALESCE(dial_code, '+82') AS dial_code,
      COALESCE(preferred_language, 'ko') AS preferred_language,
      COALESCE(note, '') AS note,
      deleted_at,
      created_at
    FROM contacts
    ${includeDeleted ? "" : "WHERE deleted_at IS NULL"}
    ORDER BY created_at DESC
  `
  );

  return rows.map((row) => ({
    id: toNumber(row.id),
    name: toStringValue(row.name),
    phone_e164: toStringValue(row.phone_e164),
    phone_raw: toStringValue(row.phone_raw),
    country_iso2: toCountryIso2(row.country_iso2),
    dial_code: toStringValue(row.dial_code),
    preferred_language: toLanguage(row.preferred_language),
    note: toStringValue(row.note),
    deleted_at: toOptionalString(row.deleted_at),
    created_at: toStringValue(row.created_at)
  }));
}

export async function getContactById(
  id: number,
  options: ContactListOptions = {}
): Promise<Contact | undefined> {
  const includeDeleted = options.includeDeleted === true;
  const row = await firstRow<Record<string, unknown>>(
    `
    SELECT
      id,
      name,
      COALESCE(phone_e164, phone, '') AS phone_e164,
      COALESCE(phone_raw, '') AS phone_raw,
      COALESCE(country_iso2, 'KR') AS country_iso2,
      COALESCE(dial_code, '+82') AS dial_code,
      COALESCE(preferred_language, 'ko') AS preferred_language,
      COALESCE(note, '') AS note,
      deleted_at,
      created_at
    FROM contacts
    WHERE id = ?
      ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    LIMIT 1
  `,
    [id]
  );

  if (!row) {
    return undefined;
  }

  return {
    id: toNumber(row.id),
    name: toStringValue(row.name),
    phone_e164: toStringValue(row.phone_e164),
    phone_raw: toStringValue(row.phone_raw),
    country_iso2: toCountryIso2(row.country_iso2),
    dial_code: toStringValue(row.dial_code),
    preferred_language: toLanguage(row.preferred_language),
    note: toStringValue(row.note),
    deleted_at: toOptionalString(row.deleted_at),
    created_at: toStringValue(row.created_at)
  };
}

export async function findContactByPhoneE164(
  phoneE164: string,
  options: ContactListOptions = {}
): Promise<Contact | undefined> {
  const normalizedPhone = phoneE164.trim();
  if (!normalizedPhone) {
    return undefined;
  }

  const includeDeleted = options.includeDeleted === true;
  const row = await firstRow<Record<string, unknown>>(
    `
    SELECT
      id,
      name,
      COALESCE(phone_e164, phone, '') AS phone_e164,
      COALESCE(phone_raw, '') AS phone_raw,
      COALESCE(country_iso2, 'KR') AS country_iso2,
      COALESCE(dial_code, '+82') AS dial_code,
      COALESCE(preferred_language, 'ko') AS preferred_language,
      COALESCE(note, '') AS note,
      deleted_at,
      created_at
    FROM contacts
    WHERE (COALESCE(phone_e164, phone, '') = ? OR phone = ?)
      ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    ORDER BY id DESC
    LIMIT 1
  `,
    [normalizedPhone, normalizedPhone]
  );

  if (!row) {
    return undefined;
  }

  return {
    id: toNumber(row.id),
    name: toStringValue(row.name),
    phone_e164: toStringValue(row.phone_e164),
    phone_raw: toStringValue(row.phone_raw),
    country_iso2: toCountryIso2(row.country_iso2),
    dial_code: toStringValue(row.dial_code),
    preferred_language: toLanguage(row.preferred_language),
    note: toStringValue(row.note),
    deleted_at: toOptionalString(row.deleted_at),
    created_at: toStringValue(row.created_at)
  };
}

export async function createContact(
  input: CreateContactInput,
  options: CreateContactOptions = {}
): Promise<number> {
  const name = input.name.trim();
  const phoneE164 = input.phone.trim();
  const note = (input.note ?? "").trim();
  const phoneRaw = (input.phoneRaw ?? phoneE164).replace(/\D/g, "");
  const countryIso2 = input.countryIso2 ?? "KR";
  const dialCode = input.dialCode ?? (countryIso2 === "US" ? "+1" : countryIso2 === "DK" ? "+45" : countryIso2 === "AZ" ? "+994" : countryIso2 === "EG" ? "+20" : "+82");
  const preferredLanguage = input.preferredLanguage ?? "ko";
  const allowExisting = options.allowExisting === true;

  if (!name || !phoneE164) {
    throw new Error("Name and phone number are required.");
  }

  const existing = await firstRow<{ id: number }>(
    "SELECT id FROM contacts WHERE phone_e164 = ? AND deleted_at IS NULL LIMIT 1",
    [phoneE164]
  );
  if (existing) {
    if (allowExisting) {
      return toNumber(existing.id);
    }
    throw new Error("This phone number is already registered.");
  }

  await run(
    `INSERT INTO contacts (
      name,
      phone,
      phone_e164,
      phone_raw,
      country_iso2,
      dial_code,
      preferred_language,
      note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, phoneE164, phoneE164, phoneRaw, countryIso2, dialCode, preferredLanguage, note]
  );

  const inserted = await firstRow<{ id: number }>(
    "SELECT id FROM contacts WHERE phone_e164 = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    [phoneE164]
  );
  if (!inserted) {
    throw new Error("Failed to save contact.");
  }

  return toNumber(inserted.id);
}

export async function updateContact(input: UpdateContactInput): Promise<void> {
  const target = await getContactById(input.id, { includeDeleted: true });
  if (!target) {
    throw new Error("Contact not found.");
  }

  const name = input.name?.trim() || target.name;
  const phoneE164 = input.phoneE164?.trim() || target.phone_e164;
  const phoneRaw = (input.phoneRaw ?? target.phone_raw).replace(/\D/g, "");
  const countryIso2 = input.countryIso2 ?? target.country_iso2;
  const dialCode = input.dialCode ?? target.dial_code;
  const preferredLanguage = input.preferredLanguage ?? target.preferred_language;
  const note = input.note !== undefined ? input.note.trim() : target.note;

  const duplicate = await firstRow<{ id: number }>(
    "SELECT id FROM contacts WHERE phone_e164 = ? AND deleted_at IS NULL AND id <> ? LIMIT 1",
    [phoneE164, input.id]
  );
  if (duplicate) {
    throw new Error("This phone number is already registered.");
  }

  await run(
    `UPDATE contacts
     SET name = ?,
         phone = ?,
         phone_e164 = ?,
         phone_raw = ?,
         country_iso2 = ?,
         dial_code = ?,
         preferred_language = ?,
         note = ?
     WHERE id = ?`,
    [name, phoneE164, phoneE164, phoneRaw, countryIso2, dialCode, preferredLanguage, note, input.id]
  );
}

export async function deleteContact(contactId: number): Promise<void> {
  const row = await firstRow<Record<string, unknown>>(
    `
    SELECT
      name,
      note,
      COALESCE(phone_e164, phone, '') AS phone_e164
    FROM contacts
    WHERE id = ?
    LIMIT 1
  `,
    [contactId]
  );

  if (!row) {
    return;
  }

  if (toStringValue(row.note) === DELETED_CONTACT_ANCHOR_NOTE) {
    return;
  }

  const contactName = toStringValue(row.name) || "Deleted contact";
  const contactPhoneE164 = toStringValue(row.phone_e164);

  await run(
    `UPDATE calls
     SET contact_name_snapshot = COALESCE(NULLIF(contact_name_snapshot, ''), ?),
         contact_phone_e164_snapshot = COALESCE(NULLIF(contact_phone_e164_snapshot, ''), ?)
     WHERE contact_id = ?`,
    [contactName, contactPhoneE164, contactId]
  );

  const callsCountRow = await firstRow<{ count: number }>(
    "SELECT COUNT(*) AS count FROM calls WHERE contact_id = ?",
    [contactId]
  );
  const hasCalls = toNumber(callsCountRow?.count) > 0;
  if (hasCalls) {
    const anchorRow = await firstRow<{ id: number }>(
      `SELECT id
       FROM contacts
       WHERE note = ? OR phone = ? OR phone_e164 = ?
       ORDER BY id ASC
       LIMIT 1`,
      [DELETED_CONTACT_ANCHOR_NOTE, DELETED_CONTACT_ANCHOR_PHONE, DELETED_CONTACT_ANCHOR_PHONE]
    );

    let anchorId = toNumber(anchorRow?.id);
    if (!anchorId) {
      await run(
        `INSERT INTO contacts (
          name,
          phone,
          phone_e164,
          phone_raw,
          country_iso2,
          dial_code,
          preferred_language,
          note,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          "Deleted contact (system)",
          DELETED_CONTACT_ANCHOR_PHONE,
          DELETED_CONTACT_ANCHOR_PHONE,
          "",
          "KR",
          "+82",
          "ko",
          DELETED_CONTACT_ANCHOR_NOTE
        ]
      );

      const insertedRow = await firstRow<{ id: number }>(
        `SELECT id
         FROM contacts
         WHERE note = ? OR phone = ? OR phone_e164 = ?
         ORDER BY id DESC
         LIMIT 1`,
        [DELETED_CONTACT_ANCHOR_NOTE, DELETED_CONTACT_ANCHOR_PHONE, DELETED_CONTACT_ANCHOR_PHONE]
      );
      anchorId = toNumber(insertedRow?.id);
    }

    if (!anchorId) {
      throw new Error("Failed to create deleted-contact anchor.");
    }

    await run("UPDATE calls SET contact_id = ? WHERE contact_id = ?", [anchorId, contactId]);
  }

  await run(
    `UPDATE calls
     SET question_set_id = NULL
     WHERE question_set_id IN (
       SELECT id
       FROM question_sets
       WHERE scope = 'contact' AND contact_id = ?
     )`,
    [contactId]
  );
  await run(
    `DELETE FROM call_question_answers
     WHERE question_id IN (
       SELECT q.id
       FROM questions q
       JOIN question_sets qs ON qs.id = q.question_set_id
       WHERE qs.scope = 'contact' AND qs.contact_id = ?
     )`,
    [contactId]
  );
  await run(
    `DELETE FROM questions
     WHERE question_set_id IN (
       SELECT id
       FROM question_sets
       WHERE scope = 'contact' AND contact_id = ?
     )`,
    [contactId]
  );
  await run("DELETE FROM question_sets WHERE scope = 'contact' AND contact_id = ?", [contactId]);
  await run("DELETE FROM contacts WHERE id = ?", [contactId]);
}

function mapCallRow(row: Record<string, unknown>): Call {
  return {
    id: toNumber(row.id),
    contact_id: toNumber(row.contact_id),
    contact_name: toStringValue(row.contact_name || "Deleted contact"),
    contact_phone_e164: toStringValue(row.contact_phone_e164),
    contact_deleted_at: toOptionalString(row.contact_deleted_at),
    twilio_call_sid: toStringValue(row.twilio_call_sid),
    status: toStringValue(row.status),
    started_at: toStringValue(row.started_at),
    ended_at: toOptionalString(row.ended_at),
    summary: toOptionalString(row.summary),
    call_language: toLanguage(row.call_language),
    question_set_id: row.question_set_id === null ? null : toNumber(row.question_set_id),
    summary_status: toSummaryStatus(row.summary_status)
  };
}

export async function listCalls(filters: CallListFilters = {}): Promise<Call[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    clauses.push("c.status = ?");
    values.push(filters.status.trim().toLowerCase());
  }

  if (filters.contactId && Number.isFinite(filters.contactId)) {
    clauses.push("c.contact_id = ?");
    values.push(filters.contactId);
  }

  if (filters.language) {
    clauses.push("c.call_language = ?");
    values.push(filters.language);
  }

  if (filters.dateFrom) {
    clauses.push("date(c.started_at) >= date(?)");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    clauses.push("date(c.started_at) <= date(?)");
    values.push(filters.dateTo);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(200, filters.limit ?? 80));

  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT
      c.id,
      c.contact_id,
      COALESCE(c.contact_name_snapshot, ct.name, 'Deleted contact') AS contact_name,
      COALESCE(c.contact_phone_e164_snapshot, ct.phone_e164, ct.phone, '') AS contact_phone_e164,
      ct.deleted_at AS contact_deleted_at,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary,
      c.call_language,
      c.question_set_id,
      c.summary_status
    FROM calls c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    ${where}
    ORDER BY c.started_at DESC
    LIMIT ?
  `,
    [...values, limit]
  );

  return rows.map(mapCallRow);
}

export async function listStaleActiveCalls(
  limit = 12,
  staleSeconds = 45
): Promise<Call[]> {
  const cutoff = `-${Math.max(10, staleSeconds)} seconds`;
  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT
      c.id,
      c.contact_id,
      COALESCE(c.contact_name_snapshot, ct.name, 'Deleted contact') AS contact_name,
      COALESCE(c.contact_phone_e164_snapshot, ct.phone_e164, ct.phone, '') AS contact_phone_e164,
      ct.deleted_at AS contact_deleted_at,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary,
      c.call_language,
      c.question_set_id,
      c.summary_status
    FROM calls c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.status IN ('queued', 'initiated', 'ringing', 'in-progress')
      AND c.started_at <= datetime('now', ?)
    ORDER BY c.started_at DESC
    LIMIT ?
  `,
    [cutoff, limit]
  );
  return rows.map(mapCallRow);
}

export async function findCallBySid(callSid: string): Promise<Call | undefined> {
  const row = await firstRow<Record<string, unknown>>(
    `
    SELECT
      c.id,
      c.contact_id,
      COALESCE(c.contact_name_snapshot, ct.name, 'Deleted contact') AS contact_name,
      COALESCE(c.contact_phone_e164_snapshot, ct.phone_e164, ct.phone, '') AS contact_phone_e164,
      ct.deleted_at AS contact_deleted_at,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary,
      c.call_language,
      c.question_set_id,
      c.summary_status
    FROM calls c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.twilio_call_sid = ?
    LIMIT 1
  `,
    [callSid]
  );

  return row ? mapCallRow(row) : undefined;
}

export async function getCallById(callId: number): Promise<Call | undefined> {
  const row = await firstRow<Record<string, unknown>>(
    `
    SELECT
      c.id,
      c.contact_id,
      COALESCE(c.contact_name_snapshot, ct.name, 'Deleted contact') AS contact_name,
      COALESCE(c.contact_phone_e164_snapshot, ct.phone_e164, ct.phone, '') AS contact_phone_e164,
      ct.deleted_at AS contact_deleted_at,
      c.twilio_call_sid,
      c.status,
      c.started_at,
      c.ended_at,
      c.summary,
      c.call_language,
      c.question_set_id,
      c.summary_status
    FROM calls c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.id = ?
    LIMIT 1
  `,
    [callId]
  );

  return row ? mapCallRow(row) : undefined;
}

export async function createCall(
  contactId: number,
  callSid: string,
  status = "queued",
  options: { callLanguage?: CallLanguage; questionSetId?: number | null } = {}
): Promise<number> {
  const callLanguage = options.callLanguage ?? "ko";
  const questionSetId = options.questionSetId ?? null;

  await run(
    `INSERT OR IGNORE INTO calls (
      contact_id,
      twilio_call_sid,
      status,
      call_language,
      question_set_id,
      summary_status,
      contact_name_snapshot,
      contact_phone_e164_snapshot
    ) VALUES (?, ?, ?, ?, ?, 'pending',
      (SELECT name FROM contacts WHERE id = ?),
      (SELECT COALESCE(phone_e164, phone, '') FROM contacts WHERE id = ?)
    )`,
    [contactId, callSid, status, callLanguage, questionSetId, contactId, contactId]
  );

  await run(
    `UPDATE calls
     SET call_language = COALESCE(call_language, ?),
         question_set_id = COALESCE(question_set_id, ?),
         contact_name_snapshot = COALESCE(
           NULLIF(contact_name_snapshot, ''),
           (SELECT name FROM contacts WHERE id = calls.contact_id)
         ),
         contact_phone_e164_snapshot = COALESCE(
           NULLIF(contact_phone_e164_snapshot, ''),
           (SELECT COALESCE(phone_e164, phone, '') FROM contacts WHERE id = calls.contact_id)
         )
     WHERE twilio_call_sid = ?`,
    [callLanguage, questionSetId, callSid]
  );

  const row = await firstRow<{ id: number }>(
    "SELECT id FROM calls WHERE twilio_call_sid = ? LIMIT 1",
    [callSid]
  );
  if (!row) {
    throw new Error("Failed to create call row.");
  }

  return toNumber(row.id);
}

export async function setCallLanguageAndQuestionSet(
  callSid: string,
  callLanguage: CallLanguage,
  questionSetId: number | null
): Promise<void> {
  await run(
    "UPDATE calls SET call_language = ?, question_set_id = ? WHERE twilio_call_sid = ?",
    [callLanguage, questionSetId, callSid]
  );
}

export async function assignCallContact(callSid: string, contactId: number): Promise<void> {
  await run(
    `UPDATE calls
     SET contact_id = ?,
         contact_name_snapshot = (SELECT name FROM contacts WHERE id = ?),
         contact_phone_e164_snapshot = (SELECT COALESCE(phone_e164, phone, '') FROM contacts WHERE id = ?)
     WHERE twilio_call_sid = ?`,
    [contactId, contactId, contactId, callSid]
  );
}

export async function updateCallStatus(callSid: string, status: string): Promise<void> {
  await run("UPDATE calls SET status = ? WHERE twilio_call_sid = ?", [status, callSid]);
}

export async function finalizeCallStatus(callSid: string, status: string): Promise<void> {
  await run(
    `UPDATE calls
     SET status = ?,
         ended_at = COALESCE(ended_at, datetime('now'))
     WHERE twilio_call_sid = ?`,
    [status, callSid]
  );
}

export async function endCall(callSid: string): Promise<void> {
  await run(
    "UPDATE calls SET status = 'completed', ended_at = datetime('now') WHERE twilio_call_sid = ?",
    [callSid]
  );
}

export async function setCallSummaryStatus(
  callId: number,
  status: "pending" | "done" | "failed"
): Promise<void> {
  await run("UPDATE calls SET summary_status = ? WHERE id = ?", [status, callId]);
}

export async function setCallSummary(callId: number, summary: string): Promise<void> {
  await run("UPDATE calls SET summary = ?, summary_status = 'done' WHERE id = ?", [summary.trim(), callId]);
}

export async function setCallSummaryFailure(callId: number, message?: string): Promise<void> {
  await run(
    "UPDATE calls SET summary = COALESCE(?, summary), summary_status = 'failed' WHERE id = ?",
    [message?.trim() || null, callId]
  );
}

export async function addCallMessage(
  callId: number,
  role: "assistant" | "user" | "system",
  text: string
): Promise<number> {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  await run("INSERT INTO call_messages (call_id, role, text) VALUES (?, ?, ?)", [
    callId,
    role,
    normalized
  ]);

  const row = await firstRow<{ id: number }>(
    "SELECT id FROM call_messages WHERE call_id = ? ORDER BY id DESC LIMIT 1",
    [callId]
  );
  return row ? toNumber(row.id) : 0;
}

export async function getRecentCallMessages(
  callId: number,
  limit = 12
): Promise<CallMessage[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT id, call_id, role, text, created_at
     FROM call_messages
     WHERE call_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [callId, limit]
  );

  return rows
    .map((row) => ({
      id: toNumber(row.id),
      call_id: toNumber(row.call_id),
      role: toRole(row.role),
      text: toStringValue(row.text),
      created_at: toStringValue(row.created_at)
    }))
    .reverse();
}

export async function getTranscriptForCall(callId: number): Promise<CallMessage[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT id, call_id, role, text, created_at
     FROM call_messages
     WHERE call_id = ?
     ORDER BY created_at ASC`,
    [callId]
  );

  return rows.map((row) => ({
    id: toNumber(row.id),
    call_id: toNumber(row.call_id),
    role: toRole(row.role),
    text: toStringValue(row.text),
    created_at: toStringValue(row.created_at)
  }));
}

export async function createQuestionSet(input: CreateQuestionSetInput): Promise<number> {
  const name = input.name.trim();
  const scope = input.scope;
  const contactId = scope === "contact" ? input.contactId ?? null : null;
  const isActive = input.isActive !== false;

  if (!name) {
    throw new Error("Question set name is required.");
  }
  if (scope === "contact" && !contactId) {
    throw new Error("Contact-specific set requires contactId.");
  }

  if (isActive) {
    if (scope === "global") {
      await run("UPDATE question_sets SET is_active = 0 WHERE scope = 'global'");
    } else {
      await run(
        "UPDATE question_sets SET is_active = 0 WHERE scope = 'contact' AND contact_id = ?",
        [contactId]
      );
    }
  }

  await run(
    `INSERT INTO question_sets (name, scope, contact_id, is_active, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [name, scope, contactId, isActive ? 1 : 0]
  );

  const row = await firstRow<{ id: number }>(
    `SELECT id FROM question_sets
     WHERE name = ? AND scope = ? AND COALESCE(contact_id, 0) = COALESCE(?, 0)
     ORDER BY id DESC
     LIMIT 1`,
    [name, scope, contactId]
  );

  if (!row) {
    throw new Error("Failed to create question set.");
  }

  return toNumber(row.id);
}

export async function listQuestionSets(options: {
  contactId?: number;
  includeInactive?: boolean;
} = {}): Promise<QuestionSet[]> {
  const includeInactive = options.includeInactive === true;
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (!includeInactive) {
    clauses.push("is_active = 1");
  }

  if (options.contactId && Number.isFinite(options.contactId)) {
    clauses.push("(scope = 'global' OR (scope = 'contact' AND contact_id = ?))");
    values.push(options.contactId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT id, name, scope, contact_id, is_active, created_at, updated_at
    FROM question_sets
    ${where}
    ORDER BY scope DESC, updated_at DESC
  `,
    values
  );

  return rows.map((row) => ({
    id: toNumber(row.id),
    name: toStringValue(row.name),
    scope: toStringValue(row.scope) === "contact" ? "contact" : "global",
    contact_id: row.contact_id === null ? null : toNumber(row.contact_id),
    is_active: toBoolean(row.is_active),
    created_at: toStringValue(row.created_at),
    updated_at: toStringValue(row.updated_at)
  }));
}

export async function ensureDefaultQuestionSet(): Promise<number> {
  const activeGlobal = await firstRow<{ id: number }>(
    `SELECT id
     FROM question_sets
     WHERE scope = 'global' AND is_active = 1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`
  );

  let createdSet = false;
  let questionSetId = activeGlobal ? toNumber(activeGlobal.id) : 0;
  if (!questionSetId) {
    questionSetId = await createQuestionSet({
      name: DEFAULT_GLOBAL_QUESTION_SET_NAME,
      scope: "global",
      isActive: true
    });
    createdSet = true;
  }

  await run(
    `UPDATE questions
     SET is_active = 0, updated_at = datetime('now')
     WHERE id IN (
       SELECT newer.id
       FROM questions newer
       JOIN questions older
         ON newer.question_set_id = older.question_set_id
        AND newer.order_index = older.order_index
        AND newer.text_ko = older.text_ko
        AND newer.id > older.id
       WHERE newer.question_set_id = ?
         AND newer.is_active = 1
         AND older.is_active = 1
     )`,
    [questionSetId]
  );

  if (createdSet) {
    for (const question of DEFAULT_GLOBAL_QUESTIONS) {
      await addQuestion({
        questionSetId,
        orderIndex: question.orderIndex,
        isRequired: question.isRequired,
        isActive: true,
        textKo: question.textKo,
        textEn: question.textEn,
        textDa: question.textDa,
        textArEg: question.textArEg,
        textAz: question.textAz
      });
    }
  }

  return questionSetId;
}

export async function setQuestionSetActive(questionSetId: number, isActive: boolean): Promise<void> {
  const row = await firstRow<Record<string, unknown>>(
    `SELECT id, scope, contact_id FROM question_sets WHERE id = ? LIMIT 1`,
    [questionSetId]
  );
  if (!row) {
    throw new Error("Question set not found.");
  }

  const scope = toStringValue(row.scope) === "contact" ? "contact" : "global";
  const contactId = row.contact_id === null ? null : toNumber(row.contact_id);

  if (isActive) {
    if (scope === "global") {
      await run("UPDATE question_sets SET is_active = 0 WHERE scope = 'global'");
    } else {
      await run(
        "UPDATE question_sets SET is_active = 0 WHERE scope = 'contact' AND contact_id = ?",
        [contactId]
      );
    }
  }

  await run(
    "UPDATE question_sets SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    [isActive ? 1 : 0, questionSetId]
  );
}

export async function addQuestion(input: UpsertQuestionInput): Promise<number> {
  const requestedOrderIndex = Number.isFinite(input.orderIndex) ? Math.floor(input.orderIndex) : 0;
  let resolvedOrderIndex = requestedOrderIndex;
  if (resolvedOrderIndex <= 0) {
    const row = await firstRow<{ max_order: number }>(
      "SELECT COALESCE(MAX(order_index), 0) AS max_order FROM questions WHERE question_set_id = ?",
      [input.questionSetId]
    );
    resolvedOrderIndex = toNumber(row?.max_order) + 1;
  }

  await run(
    `INSERT INTO questions (
      question_set_id,
      order_index,
      is_required,
      is_active,
      text_ko,
      text_en,
      text_da,
      text_ar_eg,
      text_az,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      input.questionSetId,
      resolvedOrderIndex,
      input.isRequired ? 1 : 0,
      input.isActive === false ? 0 : 1,
      input.textKo.trim(),
      input.textEn.trim(),
      input.textDa.trim(),
      input.textArEg.trim(),
      input.textAz.trim()
    ]
  );

  const row = await firstRow<{ id: number }>(
    "SELECT id FROM questions WHERE question_set_id = ? ORDER BY id DESC LIMIT 1",
    [input.questionSetId]
  );
  if (!row) {
    throw new Error("Failed to add question.");
  }
  return toNumber(row.id);
}

export async function updateQuestion(
  questionId: number,
  patch: Partial<UpsertQuestionInput>
): Promise<void> {
  const existing = await firstRow<Record<string, unknown>>(
    `SELECT * FROM questions WHERE id = ? LIMIT 1`,
    [questionId]
  );
  if (!existing) {
    throw new Error("Question not found.");
  }

  const questionSetId =
    patch.questionSetId !== undefined ? patch.questionSetId : toNumber(existing.question_set_id);
  const orderIndex = patch.orderIndex !== undefined ? patch.orderIndex : toNumber(existing.order_index);
  const isRequired = patch.isRequired !== undefined ? patch.isRequired : toBoolean(existing.is_required);
  const isActive = patch.isActive !== undefined ? patch.isActive : toBoolean(existing.is_active);
  const textKo = patch.textKo !== undefined ? patch.textKo.trim() : toStringValue(existing.text_ko);
  const textEn = patch.textEn !== undefined ? patch.textEn.trim() : toStringValue(existing.text_en);
  const textDa = patch.textDa !== undefined ? patch.textDa.trim() : toStringValue(existing.text_da);
  const textArEg =
    patch.textArEg !== undefined ? patch.textArEg.trim() : toStringValue(existing.text_ar_eg);
  const textAz = patch.textAz !== undefined ? patch.textAz.trim() : toStringValue(existing.text_az);

  await run(
    `UPDATE questions
     SET question_set_id = ?,
         order_index = ?,
         is_required = ?,
         is_active = ?,
         text_ko = ?,
         text_en = ?,
         text_da = ?,
         text_ar_eg = ?,
         text_az = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      questionSetId,
      orderIndex,
      isRequired ? 1 : 0,
      isActive ? 1 : 0,
      textKo,
      textEn,
      textDa,
      textArEg,
      textAz,
      questionId
    ]
  );
}

export async function deleteQuestion(questionId: number): Promise<void> {
  await run("DELETE FROM call_question_answers WHERE question_id = ?", [questionId]);
  await run("DELETE FROM questions WHERE id = ?", [questionId]);
}

export async function reorderQuestions(
  questionSetId: number,
  orderedQuestionIds: number[]
): Promise<void> {
  const normalizedIds = orderedQuestionIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (normalizedIds.length === 0) {
    throw new Error("orderedQuestionIds must not be empty.");
  }

  const uniqueOrderedIds = Array.from(new Set(normalizedIds));
  if (uniqueOrderedIds.length !== normalizedIds.length) {
    throw new Error("orderedQuestionIds must be unique.");
  }

  const rows = await allRows<{ id: number }>(
    `SELECT id
     FROM questions
     WHERE question_set_id = ? AND is_active = 1
     ORDER BY order_index ASC, id ASC`,
    [questionSetId]
  );
  const existingIds = rows.map((row) => toNumber(row.id));

  if (existingIds.length !== uniqueOrderedIds.length) {
    throw new Error("Question count mismatch.");
  }

  const isSameSet =
    existingIds.every((id) => uniqueOrderedIds.includes(id)) &&
    uniqueOrderedIds.every((id) => existingIds.includes(id));
  if (!isSameSet) {
    throw new Error("orderedQuestionIds contains invalid question IDs.");
  }

  for (let index = 0; index < uniqueOrderedIds.length; index += 1) {
    await run(
      `UPDATE questions
       SET order_index = ?, updated_at = datetime('now')
       WHERE id = ? AND question_set_id = ?`,
      [index + 1, uniqueOrderedIds[index], questionSetId]
    );
  }
}

export async function listQuestionsForSet(
  questionSetId: number,
  includeInactive = false
): Promise<Question[]> {
  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT
      id,
      question_set_id,
      order_index,
      is_required,
      is_active,
      text_ko,
      text_en,
      text_da,
      text_ar_eg,
      text_az,
      created_at,
      updated_at
    FROM questions
    WHERE question_set_id = ?
      ${includeInactive ? "" : "AND is_active = 1"}
    ORDER BY order_index ASC, id ASC
  `,
    [questionSetId]
  );

  return rows.map((row) => ({
    id: toNumber(row.id),
    question_set_id: toNumber(row.question_set_id),
    order_index: toNumber(row.order_index),
    is_required: toBoolean(row.is_required),
    is_active: toBoolean(row.is_active),
    text_ko: toStringValue(row.text_ko),
    text_en: toStringValue(row.text_en),
    text_da: toStringValue(row.text_da),
    text_ar_eg: toStringValue(row.text_ar_eg),
    text_az: toStringValue(row.text_az),
    created_at: toStringValue(row.created_at),
    updated_at: toStringValue(row.updated_at)
  }));
}

export async function resolveQuestionSetForContact(contactId: number): Promise<{
  questionSet: QuestionSet | null;
  questions: Question[];
}> {
  const contactSet = await firstRow<Record<string, unknown>>(
    `
    SELECT id, name, scope, contact_id, is_active, created_at, updated_at
    FROM question_sets
    WHERE scope = 'contact' AND contact_id = ? AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `,
    [contactId]
  );

  const resolvedRow =
    contactSet ||
    (await firstRow<Record<string, unknown>>(
      `
      SELECT id, name, scope, contact_id, is_active, created_at, updated_at
      FROM question_sets
      WHERE scope = 'global' AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `
    ));

  if (!resolvedRow) {
    await ensureDefaultQuestionSet();
    return resolveQuestionSetForContact(contactId);
  }

  const questionSet: QuestionSet = {
    id: toNumber(resolvedRow.id),
    name: toStringValue(resolvedRow.name),
    scope: toStringValue(resolvedRow.scope) === "contact" ? "contact" : "global",
    contact_id: resolvedRow.contact_id === null ? null : toNumber(resolvedRow.contact_id),
    is_active: toBoolean(resolvedRow.is_active),
    created_at: toStringValue(resolvedRow.created_at),
    updated_at: toStringValue(resolvedRow.updated_at)
  };

  const questions = await listQuestionsForSet(questionSet.id, false);
  return { questionSet, questions };
}

export async function resolveLocalizedQuestionsForCall(params: {
  callLanguage: CallLanguage;
  questionSetId: number | null;
}): Promise<LocalizedQuestion[]> {
  if (!params.questionSetId) {
    return [];
  }

  const questions = await listQuestionsForSet(params.questionSetId, false);
  return questions.map((question) => ({
    ...question,
    localized_text: questionTextForLanguage(question, params.callLanguage)
  }));
}

export async function replaceCallQuestionAnswers(
  callId: number,
  answers: ReplaceCallQuestionAnswerInput[]
): Promise<void> {
  await run("DELETE FROM call_question_answers WHERE call_id = ?", [callId]);

  for (const answer of answers) {
    const asked = answer.asked ? 1 : 0;
    const answered = answer.answered ? 1 : 0;
    const answerText = (answer.answerText ?? "").trim();
    const evidenceText = (answer.evidenceText ?? "").trim();
    const resolutionStatus = answer.resolutionStatus ?? "resolved";

    await run(
      `INSERT INTO call_question_answers (
        call_id,
        question_id,
        asked,
        answered,
        answer_text,
        evidence_text,
        confidence,
        resolution_status,
        answered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        callId,
        answer.questionId,
        asked,
        answered,
        answerText,
        evidenceText,
        answer.confidence ?? null,
        resolutionStatus,
        null
      ]
    );
  }

  // Fix answered_at timestamps because SQL bind cannot evaluate datetime('now').
  await run(
    `UPDATE call_question_answers
     SET answered_at = datetime('now')
     WHERE call_id = ? AND answered = 1 AND answered_at IS NULL`,
    [callId]
  );
}

export async function listCallQuestionAnswers(callId: number): Promise<CallQuestionAnswer[]> {
  const rows = await allRows<Record<string, unknown>>(
    `
    SELECT
      a.id,
      a.call_id,
      a.question_id,
      a.asked,
      a.answered,
      a.answer_text,
      a.evidence_text,
      a.confidence,
      a.resolution_status,
      a.answered_at,
      COALESCE(q.text_ko, q.text_en, q.text_da, q.text_ar_eg, q.text_az, '') AS question_text
    FROM call_question_answers a
    LEFT JOIN questions q ON q.id = a.question_id
    WHERE a.call_id = ?
    ORDER BY q.order_index ASC, a.id ASC
  `,
    [callId]
  );

  return rows.map((row) => ({
    id: toNumber(row.id),
    call_id: toNumber(row.call_id),
    question_id: toNumber(row.question_id),
    question_text: toStringValue(row.question_text),
    asked: toBoolean(row.asked),
    answered: toBoolean(row.answered),
    answer_text: toStringValue(row.answer_text),
    evidence_text: toStringValue(row.evidence_text),
    confidence: row.confidence === null ? null : Number(row.confidence),
    resolution_status:
      toStringValue(row.resolution_status) === "unresolved" ? "unresolved" : "resolved",
    answered_at: toOptionalString(row.answered_at)
  }));
}

// --- Contact Profile & History ---

export type ContactProfile = {
  name?: string;
  age?: number;
  occupation?: string;
  health_conditions?: string[];
  medications?: string[];
  family?: string[];
  interests?: string[];
  living_situation?: string;
  mood_tendency?: string;
  important_dates?: string[];
  other?: Record<string, unknown>;
};

export type ContactCallHistoryEntry = {
  call_date: string;
  call_language: string;
  summary_snippet: string;
};

export async function getContactProfile(contactId: number): Promise<ContactProfile> {
  const row = await firstRow<Record<string, unknown>>(
    "SELECT profile_json FROM contacts WHERE id = ? LIMIT 1",
    [contactId]
  );
  if (!row) {
    return {};
  }
  try {
    return JSON.parse(toStringValue(row.profile_json) || "{}") as ContactProfile;
  } catch {
    return {};
  }
}

export async function setContactProfile(contactId: number, profile: ContactProfile): Promise<void> {
  await run(
    "UPDATE contacts SET profile_json = ? WHERE id = ?",
    [JSON.stringify(profile), contactId]
  );
}

export async function getContactConversationHistory(contactId: number): Promise<string> {
  const row = await firstRow<Record<string, unknown>>(
    "SELECT conversation_history_summary FROM contacts WHERE id = ? LIMIT 1",
    [contactId]
  );
  return toStringValue(row?.conversation_history_summary);
}

export async function setContactConversationHistory(contactId: number, summary: string): Promise<void> {
  await run(
    "UPDATE contacts SET conversation_history_summary = ? WHERE id = ?",
    [summary.trim(), contactId]
  );
}

export async function insertContactCallHistory(params: {
  contactId: number;
  callId: number;
  callDate: string;
  callLanguage: string;
  summarySnippet: string;
  profileDeltaJson: string;
}): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO contact_call_history (
      contact_id, call_id, call_date, call_language, summary_snippet, profile_delta_json
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.contactId,
      params.callId,
      params.callDate,
      params.callLanguage,
      params.summarySnippet,
      params.profileDeltaJson
    ]
  );
}

export async function getRecentCallHistoryForContact(
  contactId: number,
  limit = 3
): Promise<ContactCallHistoryEntry[]> {
  const rows = await allRows<Record<string, unknown>>(
    `SELECT call_date, call_language, summary_snippet
     FROM contact_call_history
     WHERE contact_id = ?
     ORDER BY call_date DESC
     LIMIT ?`,
    [contactId, limit]
  );
  return rows.map((row) => ({
    call_date: toStringValue(row.call_date),
    call_language: toStringValue(row.call_language),
    summary_snippet: toStringValue(row.summary_snippet)
  }));
}

export async function listCallFilterValues(): Promise<{
  statuses: string[];
  languages: CallLanguage[];
}> {
  const statusRows = await allRows<Record<string, unknown>>(
    "SELECT DISTINCT status FROM calls ORDER BY status ASC"
  );
  const languageRows = await allRows<Record<string, unknown>>(
    "SELECT DISTINCT call_language FROM calls ORDER BY call_language ASC"
  );

  return {
    statuses: statusRows
      .map((row) => toStringValue(row.status).trim())
      .filter((item) => item.length > 0),
    languages: languageRows
      .map((row) => toLanguage(row.call_language))
      .filter((item, index, array) => array.indexOf(item) === index)
  };
}
