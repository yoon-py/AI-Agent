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
