ALTER TABLE contacts ADD COLUMN phone_e164 TEXT;
ALTER TABLE contacts ADD COLUMN phone_raw TEXT;
ALTER TABLE contacts ADD COLUMN country_iso2 TEXT;
ALTER TABLE contacts ADD COLUMN dial_code TEXT;
ALTER TABLE contacts ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'ko';
ALTER TABLE contacts ADD COLUMN deleted_at TEXT;

ALTER TABLE calls ADD COLUMN call_language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE calls ADD COLUMN question_set_id INTEGER;
ALTER TABLE calls ADD COLUMN summary_status TEXT NOT NULL DEFAULT 'pending';

UPDATE contacts
SET phone_e164 = COALESCE(NULLIF(phone_e164, ''), phone)
WHERE phone_e164 IS NULL OR trim(phone_e164) = '';

UPDATE contacts
SET phone_raw = COALESCE(
  NULLIF(phone_raw, ''),
  replace(replace(replace(COALESCE(phone_e164, ''), '+', ''), '-', ''), ' ', '')
)
WHERE phone_raw IS NULL OR trim(phone_raw) = '';

UPDATE contacts
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
WHERE country_iso2 IS NULL OR trim(country_iso2) = '';

UPDATE contacts
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
WHERE dial_code IS NULL OR trim(dial_code) = '';

UPDATE contacts
SET preferred_language = COALESCE(
  NULLIF(preferred_language, ''),
  CASE country_iso2
    WHEN 'DK' THEN 'da'
    WHEN 'AZ' THEN 'az'
    WHEN 'EG' THEN 'ar-EG'
    ELSE 'ko'
  END
)
WHERE preferred_language IS NULL OR trim(preferred_language) = '';

UPDATE calls
SET summary_status = CASE
  WHEN summary IS NOT NULL AND trim(summary) <> '' THEN 'done'
  WHEN summary_status IS NULL OR trim(summary_status) = '' THEN 'pending'
  ELSE summary_status
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_active_phone_e164_unique
ON contacts(phone_e164)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_active_created
ON contacts(deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lang ON calls(call_language);
