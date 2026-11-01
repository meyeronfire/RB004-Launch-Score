import { createHash } from "node:crypto";
import { database } from "./store";

const localWindows = new Map<string, { start: number; hits: number }>();
const DAY = 24 * 60 * 60 * 1000;

export async function rateLimit(request: Request, namespace = "scan") {
  const trustedHeader = process.env.TRUSTED_PROXY_IP_HEADER?.toLowerCase();
  const rawIp = process.env.NODE_ENV !== "production"
    ? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
    : process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : trustedHeader ? request.headers.get(trustedHeader)?.split(",")[0]?.trim() : undefined;
  if (!rawIp) return { allowed: false, remaining: 0, misconfigured: true };
  const key = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "rb004-local"}:${namespace}:${rawIp}`).digest("hex");
  const sql = database();
  if (sql) {
    const rows = await sql<{ hits: number }[]>`INSERT INTO rate_limits (ip_hash,window_start,hits)
      VALUES (${key},now(),1)
      ON CONFLICT (ip_hash) DO UPDATE SET
        hits=CASE WHEN rate_limits.window_start < now()-interval '24 hours' THEN 1 ELSE rate_limits.hits+1 END,
        window_start=CASE WHEN rate_limits.window_start < now()-interval '24 hours' THEN now() ELSE rate_limits.window_start END
      RETURNING hits`;
    return { allowed: Number(rows[0]?.hits ?? 99) <= 5, remaining: Math.max(0, 5 - Number(rows[0]?.hits ?? 99)), misconfigured: false };
  }
  const now = Date.now(); const current = localWindows.get(key);
  const state = !current || now - current.start > DAY ? { start: now, hits: 1 } : { ...current, hits: current.hits + 1 };
  localWindows.set(key, state);
  if (localWindows.size > 10_000) for (const [storedKey, value] of localWindows) if (now - value.start > DAY) localWindows.delete(storedKey);
  return { allowed: state.hits <= 5, remaining: Math.max(0, 5 - state.hits), misconfigured: false };
}
