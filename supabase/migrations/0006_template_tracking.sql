-- 0006_template_tracking.sql
--
-- Per-lead WhatsApp TEMPLATE-message tracking.
--
-- New table `template_messages` records, for each lead (phone = PK), whether a
-- template has ever been sent successfully, the LAST template name sent, and the
-- running total of successful template sends. It is populated from exactly two
-- send paths in the app:
--   1. Welcome template  (welcome_lead)  — 3Sigma intake webhook on lead create.
--   2. Daily Re-engagement (reengagement) — Cron 1 (9:00 AM IST).
--
-- RLS is enabled with NO public policies (service-role only), matching the
-- other CRM tables. Writes happen through record_template_sent() so the
-- increment is atomic.

CREATE TABLE IF NOT EXISTS template_messages (
  phone               TEXT PRIMARY KEY REFERENCES leads(phone),
  template_sent       BOOLEAN DEFAULT FALSE,
  template_name       TEXT,
  total_template_sent INTEGER DEFAULT 0,
  last_sent_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_messages_last_sent_at
  ON template_messages(last_sent_at DESC);

-- updated_at trigger (reuses set_updated_at() defined in 0001_init.sql).
DROP TRIGGER IF EXISTS trg_template_messages_updated_at ON template_messages;
CREATE TRIGGER trg_template_messages_updated_at
  BEFORE UPDATE ON template_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic upsert + increment. Called once per SUCCESSFUL template send:
-- sets template_sent = TRUE, stores the LAST template name only, increments the
-- running total, and bumps last_sent_at. The service role bypasses RLS, so no
-- SECURITY DEFINER is needed.
CREATE OR REPLACE FUNCTION record_template_sent(p_phone text, p_template text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO template_messages (phone, template_sent, template_name, total_template_sent, last_sent_at)
  VALUES (p_phone, TRUE, p_template, 1, NOW())
  ON CONFLICT (phone) DO UPDATE
    SET template_sent       = TRUE,
        template_name       = EXCLUDED.template_name,
        total_template_sent = template_messages.total_template_sent + 1,
        last_sent_at        = NOW();
$$;

-- Enable RLS with NO policies — only the service role can read/write.
ALTER TABLE template_messages ENABLE ROW LEVEL SECURITY;

-- Backfill from any already-successful template sends so existing customers
-- show up immediately (uses the LAST sent template name + total count).
INSERT INTO template_messages (phone, template_sent, template_name, total_template_sent, last_sent_at)
SELECT
  m.phone,
  TRUE,
  (array_agg(m.template_name ORDER BY m.created_at DESC))[1],
  COUNT(*),
  MAX(m.created_at)
FROM messages m
WHERE m.message_type = 'template' AND m.status = 'sent'
GROUP BY m.phone
ON CONFLICT (phone) DO NOTHING;
