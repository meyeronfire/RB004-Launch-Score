CREATE TABLE IF NOT EXISTS free_scan_entitlements (
  email_hash text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  scans_used integer NOT NULL DEFAULT 1 CHECK (scans_used BETWEEN 0 AND 3),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS free_scan_magic_links (
  token_hash text PRIMARY KEY,
  email_hash text NOT NULL,
  email text NOT NULL,
  device_hash text NOT NULL,
  ip_hash text NOT NULL,
  first_scan_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS free_scan_magic_links_expiry_idx ON free_scan_magic_links (expires_at);
CREATE TABLE IF NOT EXISTS free_scan_sessions (
  token_hash text PRIMARY KEY,
  email_hash text NOT NULL REFERENCES free_scan_entitlements(email_hash) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS free_scan_claims (
  scan_id text PRIMARY KEY,
  device_hash text NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS free_scan_claims_device_idx ON free_scan_claims (device_hash,created_at);
CREATE INDEX IF NOT EXISTS free_scan_claims_ip_idx ON free_scan_claims (ip_hash,created_at);
CREATE INDEX IF NOT EXISTS free_scan_claims_email_idx ON free_scan_claims (email_hash,created_at);
CREATE TABLE IF NOT EXISTS free_waitlist (
  email text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'daily_budget',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scan_costs (
  scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid boolean NOT NULL DEFAULT false,
  browser_ms integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT '',
  estimated_usd numeric(12,6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS scan_costs_created_at_idx ON scan_costs (created_at);
CREATE TABLE IF NOT EXISTS paid_prompt_costs (
  scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
  incurred_at timestamptz NOT NULL DEFAULT now(),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT '',
  estimated_usd numeric(12,6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS paid_prompt_costs_incurred_at_idx ON paid_prompt_costs (incurred_at);
CREATE TABLE IF NOT EXISTS paid_url_access (
  token_hash text PRIMARY KEY,
  token_ciphertext text NOT NULL,
  scan_id text NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL REFERENCES purchases(stripe_session_id) ON DELETE CASCADE,
  normalized_url text NOT NULL,
  recipient text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paid_url_access_expiry_idx ON paid_url_access (expires_at);
CREATE INDEX IF NOT EXISTS paid_url_access_session_idx ON paid_url_access (stripe_session_id);
CREATE TABLE IF NOT EXISTS paid_prompt_jobs (
  scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paid_prompt_jobs_queue_idx ON paid_prompt_jobs (next_attempt_at) WHERE status IN ('pending','running');

ALTER TABLE free_scan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_scan_magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_scan_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_url_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_prompt_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_prompt_costs ENABLE ROW LEVEL SECURITY;

-- These tables are server-only. No anon/auth policies are created; public access remains denied.
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunded_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_email_outbox ENABLE ROW LEVEL SECURITY;
