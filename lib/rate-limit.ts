import { createHash } from "node:crypto";
import { database } from "./store";

const localWindows = new Map<string, { start: number; hits: number }>();
const localCooldowns = new Map<string, number>();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function isObviousBot(userAgent: string | null) {
  if (!userAgent?.trim()) return true;
  return /\b(?:bot|crawler|spider|scrapy|curl|wget|python-requests|httpie|headlesschrome|phantomjs)\b/i.test(userAgent);
}

export function scanRequestAllowance(hits: number, max = 5) {
  return { allowed: hits <= max, remaining: Math.max(0, max - hits) };
}

export function clientIpHash(request: Request) {
  const salt = process.env.RATE_LIMIT_SALT || (process.env.NODE_ENV === "production" ? "" : "rb004-local");
  if (!salt) return undefined;
  const trustedHeader = process.env.TRUSTED_PROXY_IP_HEADER?.toLowerCase();
  const rawIp = process.env.NODE_ENV !== "production"
    ? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
    : process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.split(",").at(-1)?.trim() ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
      : trustedHeader ? request.headers.get(trustedHeader)?.split(",")[0]?.trim() : undefined;
  if (!rawIp) return undefined;
  return createHash("sha256").update(`${salt}:identity:${rawIp}`).digest("hex");
}

export async function claimScopedCooldown(scope: string, cooldownMs: number) {
  const key = createHash("sha256").update(`rb004-cooldown:${scope}`).digest("hex");
  const sql = database();
  if (sql) {
    const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
    const rows = await sql<{ hits: number }[]>`INSERT INTO rate_limits (ip_hash,window_start,hits) VALUES (${key},now(),1)
      ON CONFLICT (ip_hash) DO UPDATE SET
        hits=CASE WHEN rate_limits.window_start < now()-(${seconds}::text || ' seconds')::interval THEN 1 ELSE rate_limits.hits+1 END,
        window_start=CASE WHEN rate_limits.window_start < now()-(${seconds}::text || ' seconds')::interval THEN now() ELSE rate_limits.window_start END
      RETURNING hits`;
    return Number(rows[0]?.hits ?? 2) === 1;
  }
  const now = Date.now(); const nextAt = localCooldowns.get(key) ?? 0;
  if (nextAt > now) return false;
  localCooldowns.set(key, now + cooldownMs);
  if (localCooldowns.size > 10_000) for (const [storedKey, expiry] of localCooldowns) if (expiry <= now) localCooldowns.delete(storedKey);
  return true;
}

export async function rateLimit(request: Request, namespace = "scan", windowMs = namespace === "scan" ? HOUR : DAY) {
  const identityHash = clientIpHash(request);
  if (!identityHash) return { allowed: false, remaining: 0, misconfigured: true };
  const key = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "rb004-local"}:${namespace}:${identityHash}`).digest("hex");
  const sql = database();
  if (sql) {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const rows = await sql<{ hits: number }[]>`INSERT INTO rate_limits (ip_hash,window_start,hits)
      VALUES (${key},now(),1)
      ON CONFLICT (ip_hash) DO UPDATE SET
        hits=CASE WHEN rate_limits.window_start < now()-(${windowSeconds}::text || ' seconds')::interval THEN 1 ELSE rate_limits.hits+1 END,
        window_start=CASE WHEN rate_limits.window_start < now()-(${windowSeconds}::text || ' seconds')::interval THEN now() ELSE rate_limits.window_start END
      RETURNING hits`;
    return { ...scanRequestAllowance(Number(rows[0]?.hits ?? 99)), misconfigured: false };
  }
  const now = Date.now(); const current = localWindows.get(key);
  const state = !current || now - current.start > windowMs ? { start: now, hits: 1 } : { ...current, hits: current.hits + 1 };
  localWindows.set(key, state);
  if (localWindows.size > 10_000) for (const [storedKey, value] of localWindows) if (now - value.start > windowMs) localWindows.delete(storedKey);
  return { ...scanRequestAllowance(state.hits), misconfigured: false };
}
