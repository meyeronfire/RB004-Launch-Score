import { createHash, timingSafeEqual } from "node:crypto";

const MAX_SCAN_ADMIN_KEY_LENGTH = 512;

// Server-only. SCAN_ADMIN_KEY must never use a NEXT_PUBLIC_ name or be sent to the client.
export function requestHasScanAdminKey(request: Request) {
  const configured = (process.env.SCAN_ADMIN_KEY ?? "").trim();
  if (!configured) return false;
  const provided = request.headers.get("x-admin-key") ?? "";
  const expected = createHash("sha256").update(configured).digest();
  const actual = createHash("sha256").update(provided.slice(0, MAX_SCAN_ADMIN_KEY_LENGTH)).digest();
  const matches = timingSafeEqual(actual, expected);
  return provided.length > 0 && provided.length <= MAX_SCAN_ADMIN_KEY_LENGTH && matches;
}
