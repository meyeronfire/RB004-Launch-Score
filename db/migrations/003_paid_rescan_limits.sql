ALTER TABLE paid_url_access
  ADD COLUMN IF NOT EXISTS rescans_used integer NOT NULL DEFAULT 0
  CHECK (rescans_used >= 0);

-- NULL preserves the unlimited seven-day re-scan promise already made to earlier buyers.
-- New purchases set this to 2 when their entitlement is created.
ALTER TABLE paid_url_access
  ADD COLUMN IF NOT EXISTS rescans_limit integer DEFAULT NULL
  CHECK (rescans_limit IS NULL OR rescans_limit BETWEEN 0 AND 2);

CREATE TABLE IF NOT EXISTS paid_rescan_reports (
  scan_id text PRIMARY KEY REFERENCES scans(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL REFERENCES purchases(stripe_session_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paid_rescan_reports_session_idx ON paid_rescan_reports (stripe_session_id);
ALTER TABLE paid_rescan_reports ENABLE ROW LEVEL SECURITY;
