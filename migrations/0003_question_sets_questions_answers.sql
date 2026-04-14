CREATE TABLE IF NOT EXISTS question_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('global', 'contact')),
  contact_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_set_id INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  text_en TEXT NOT NULL DEFAULT '',
  text_da TEXT NOT NULL DEFAULT '',
  text_ar_eg TEXT NOT NULL DEFAULT '',
  text_az TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(question_set_id) REFERENCES question_sets(id)
);

CREATE TABLE IF NOT EXISTS call_question_answers (
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
);

CREATE INDEX IF NOT EXISTS idx_question_sets_scope
ON question_sets(scope, contact_id, is_active);

CREATE INDEX IF NOT EXISTS idx_questions_set_order
ON questions(question_set_id, is_active, order_index ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_question_answers_unique
ON call_question_answers(call_id, question_id);

CREATE INDEX IF NOT EXISTS idx_call_question_answers_call
ON call_question_answers(call_id, answered, resolution_status);
