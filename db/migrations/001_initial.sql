CREATE TABLE IF NOT EXISTS scans (
  id text PRIMARY KEY,
  url text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','scanning','complete','failed')),
  phase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  payload jsonb NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  lease_token text,
  lease_expires_at timestamptz
);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS scans_queue_idx ON scans (created_at) WHERE status = 'queued';
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS leads (
  id bigserial PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url text NOT NULL,
  email text NOT NULL,
  score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scan_id,email)
);
CREATE TABLE IF NOT EXISTS purchases (
  id text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  amount integer NOT NULL,
  currency text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
-- Distinct verified charges must each retain their own receipt and access.
DROP INDEX IF EXISTS purchases_one_active_scan_idx;
CREATE TABLE IF NOT EXISTS checkout_access_tokens (
  token_hash text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  expires_at timestamptz,
  pending_token_hash text,
  pending_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE checkout_access_tokens ADD COLUMN IF NOT EXISTS pending_token_hash text;
ALTER TABLE checkout_access_tokens ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;
CREATE TABLE IF NOT EXISTS checkout_reservations (
  scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS checkout_sessions (
  stripe_session_id text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO checkout_sessions (stripe_session_id,scan_id,expires_at)
  SELECT stripe_session_id,scan_id,expires_at FROM checkout_reservations ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS refunded_payment_intents (
  stripe_payment_intent_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS report_email_outbox (
  stripe_session_id text PRIMARY KEY REFERENCES purchases(stripe_session_id) ON DELETE CASCADE,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  token_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_email_outbox_queue_idx ON report_email_outbox (next_attempt_at) WHERE status IN ('pending','sending');
