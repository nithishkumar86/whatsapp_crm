-- =====================================================================
-- 0007 — WhatsApp Embedded Signup (Coexistence) support
--
-- Adds:
--   1. whatsapp_config      — single row (id = 1) holding the live Cloud API
--                             credentials obtained from Embedded Signup.
--                             The access token is stored ENCRYPTED
--                             (AES-256-GCM via lib/crypto.ts) — never plaintext.
--   2. whatsapp_sync_events — raw `history` / `smb_app_state_sync` webhook
--                             payloads captured during the one-time 24-hour
--                             coexistence sync window.
--   3. messages.source      — origin of a message row. Phone-app replies that
--                             arrive via `smb_message_echoes` are stored with
--                             sent_by='agent', source='whatsapp_business_app'.
--
-- RLS is enabled on the new tables with NO policies (service role only),
-- matching the convention established in 0001_init.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table: whatsapp_config  (always exactly one row, id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id                       INTEGER PRIMARY KEY DEFAULT 1,

  -- Meta asset identifiers
  waba_id                  TEXT,
  phone_number_id          TEXT,
  business_id              TEXT,           -- coexistence payload may omit this
  display_phone_number     TEXT,
  verified_name            TEXT,

  -- Business Integration System User token, encrypted at rest.
  -- RLS protects live reads; encryption protects dumps, backups and logs.
  access_token_ciphertext  TEXT,
  token_iv                 TEXT,           -- GCM nonce (hex)
  token_auth_tag           TEXT,           -- GCM auth tag (hex)
  token_type               TEXT,
  token_expires_at         TIMESTAMPTZ,

  -- Coexistence verification (GET /{phone_number_id}?fields=is_on_biz_app,platform_type)
  is_on_biz_app            BOOLEAN,
  platform_type            TEXT,

  -- Lifecycle
  status                   TEXT DEFAULT 'disconnected',   -- connected | disconnected | error
  history_sync_status      TEXT DEFAULT 'not_started',    -- not_started | requested | receiving | done
  contact_sync_status      TEXT DEFAULT 'not_started',    -- not_started | requested | receiving | done
  last_error               TEXT,
  connected_at             TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Keep the single-row invariant seeded so the config route can always upsert.
INSERT INTO whatsapp_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Reuse the set_updated_at() function defined in 0001_init.sql.
DROP TRIGGER IF EXISTS trg_whatsapp_config_updated_at ON whatsapp_config;
CREATE TRIGGER trg_whatsapp_config_updated_at
BEFORE UPDATE ON whatsapp_config
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Table: whatsapp_sync_events
-- Raw coexistence sync payloads. Meta gives a ONE-TIME 24-hour window after
-- onboarding to request history + contact sync, so the payloads are captured
-- now even though the browsing UI is a later phase.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_sync_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kind         TEXT NOT NULL,              -- history | smb_app_state_sync
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sync_events_kind ON whatsapp_sync_events(kind);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sync_events_received_at ON whatsapp_sync_events(received_at DESC);

-- ---------------------------------------------------------------------
-- messages.source — additive, nullable. Existing rows keep NULL.
-- ---------------------------------------------------------------------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY — enabled, NO policies (service role only).
-- ---------------------------------------------------------------------
ALTER TABLE whatsapp_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sync_events ENABLE ROW LEVEL SECURITY;
