ALTER TABLE contacts ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN conversation_history_summary TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS contact_call_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  call_id INTEGER NOT NULL,
  call_date TEXT NOT NULL,
  call_language TEXT NOT NULL DEFAULT 'ko',
  summary_snippet TEXT NOT NULL DEFAULT '',
  profile_delta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(contact_id) REFERENCES contacts(id),
  FOREIGN KEY(call_id) REFERENCES calls(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cch_call ON contact_call_history(call_id);
CREATE INDEX IF NOT EXISTS idx_cch_contact_date ON contact_call_history(contact_id, call_date DESC);
