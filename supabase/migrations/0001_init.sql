-- =====================================================================
-- WhatsApp CRM — Initial Schema (Digital Tamizha Real Estate)
-- 7 tables created in FK-dependency order:
--   leads, messages, appointments, lead_events,
--   agent_config, property_files, cron_logs
--
-- RLS is enabled on all 7 tables with NO public policies.
-- With RLS on and zero policies, only the service role can read/write.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table 1: leads  (phone is the PRIMARY KEY for all lead lookups)
-- ---------------------------------------------------------------------
CREATE TABLE leads (
  phone                  TEXT PRIMARY KEY,
  full_name              TEXT,
  email                  TEXT,
  land_size              TEXT,
  land_location          TEXT,
  street_address         TEXT,
  is_decision_maker      BOOLEAN,
  owns_land_chennai      BOOLEAN,
  project_start_date     TEXT,
  budget                 TEXT,
  location_preference    TEXT,
  lead_status            TEXT DEFAULT 'new',
  ai_mode                BOOLEAN DEFAULT TRUE,
  conversation_status    TEXT DEFAULT 'open',
  assigned_to            TEXT,
  last_inbound_at        TIMESTAMPTZ,
  last_outbound_at       TIMESTAMPTZ,
  last_message_at        TIMESTAMPTZ,
  last_message_direction TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at trigger for leads
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Table 2: messages  (system of record for the chat panel)
-- wa_message_id is UNIQUE for ON CONFLICT (wa_message_id) DO NOTHING
-- ---------------------------------------------------------------------
CREATE TABLE messages (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone            TEXT NOT NULL REFERENCES leads(phone),
  wa_message_id    TEXT UNIQUE,
  direction        TEXT NOT NULL,
  content          TEXT,
  message_type     TEXT DEFAULT 'text',
  sent_by          TEXT DEFAULT 'system',
  media_url        TEXT,
  template_name    TEXT,
  status           TEXT DEFAULT 'sent',
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_phone ON messages(phone);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_phone_created_at ON messages(phone, created_at DESC);

-- ---------------------------------------------------------------------
-- Table 3: appointments
-- budget & location_preference are SNAPSHOTS at booking time
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone                TEXT NOT NULL REFERENCES leads(phone),
  full_name            TEXT,
  visit_date           DATE NOT NULL,
  visit_time           TIME NOT NULL,
  budget               TEXT,
  location_preference  TEXT,
  notes                TEXT,
  booked_by            TEXT DEFAULT 'ai',
  status               TEXT DEFAULT 'scheduled',
  reminder_1day_sent   BOOLEAN DEFAULT FALSE,
  reminder_1hr_sent    BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_visit_date ON appointments(visit_date);
CREATE INDEX idx_appointments_phone ON appointments(phone);

-- ---------------------------------------------------------------------
-- Table 4: lead_events  (append-only business event log)
-- ---------------------------------------------------------------------
CREATE TABLE lead_events (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone              TEXT NOT NULL REFERENCES leads(phone),
  event_type         TEXT NOT NULL,
  event_description  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lead_events_phone ON lead_events(phone);
CREATE INDEX idx_lead_events_type ON lead_events(event_type);
CREATE INDEX idx_lead_events_created_at ON lead_events(created_at DESC);

-- ---------------------------------------------------------------------
-- Table 5: agent_config  (always exactly one row, id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE agent_config (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  instructions TEXT NOT NULL DEFAULT '',
  model        TEXT DEFAULT 'anthropic/claude-sonnet-4-6',
  temperature  NUMERIC DEFAULT 0.7,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO agent_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Table 6: property_files
-- ---------------------------------------------------------------------
CREATE TABLE property_files (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  extracted_text  TEXT,
  summary         TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- Table 7: cron_logs
-- ---------------------------------------------------------------------
CREATE TABLE cron_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name     TEXT NOT NULL,
  status        TEXT NOT NULL,
  messages_sent INTEGER DEFAULT 0,
  error_message TEXT,
  ran_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ROW LEVEL SECURITY — enable on all 7 tables, create NO public policies.
-- Only the service role (used server-side) can read/write.
-- =====================================================================
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_logs      ENABLE ROW LEVEL SECURITY;
