import { createHash, randomBytes } from "node:crypto";
import { database } from "./store";
import { DEFAULT_FREE_DAILY_BUDGET_USD, emailClaimDecision, freeBudgetDecision, freeScanDecision } from "./free-tier-rules";

export const DEVICE_COOKIE = "rb004_device";
export const FREE_SESSION_COOKIE = "rb004_free_session";
export const PAID_RESCAN_COOKIE = "rb004_paid_rescan";
export const FREE_BUDGET_RESERVATION_USD = 0.05;
const localClaims = new Set<string>();
const localEmailUses = new Map<string, number>();
const localSessions = new Map<string, string>();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const emailHash = (value: string) => hash(value.trim().toLowerCase());
function costSetting(name: string, fallback: number) {
  const raw = process.env[name]?.trim(); const value = raw ? Number(raw) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const budgetLimit = () => {
  return costSetting("FREE_DAILY_BUDGET_USD", DEFAULT_FREE_DAILY_BUDGET_USD);
};

export function newOpaqueToken() { return randomBytes(32).toString("base64url"); }
export function hashOpaqueToken(token: string) { return hash(token); }
export function deviceHash(token: string) { return hash(`rb004-device:${token}`); }
export function emailIdentity(email: string) { return emailHash(email); }

export function cookieValue(request: Request, name: string) {
  const pair = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!pair) return "";
  try { return decodeURIComponent(pair.slice(name.length + 1)); } catch { return ""; }
}

export function sessionCookie(token: string, maxAge = 30 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FREE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function freeStatus(input: { device: string; ip: string; sessionToken?: string }) {
  const sql = database();
  if (!sql) {
    const emailHashValue = input.sessionToken ? localSessions.get(hashOpaqueToken(input.sessionToken)) : undefined;
    if (emailHashValue) {
      const decision = freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: localEmailUses.get(emailHashValue) ?? 0 });
      return { ...decision, authenticated: true };
    }
    const used = localClaims.has(`${input.device}:${input.ip}`) || localClaims.has(`${input.device}:*`) || localClaims.has(`*:${input.ip}`);
    return { ...freeScanDecision({ hasAnonymousUse: used, authenticatedEmailScans: null }), authenticated: false };
  }
  if (input.sessionToken) {
    const rows = await sql<{ scans_used: number }[]>`SELECT e.scans_used FROM free_scan_sessions s JOIN free_scan_entitlements e USING (email_hash)
      WHERE s.token_hash=${hashOpaqueToken(input.sessionToken)} AND s.expires_at>now() LIMIT 1`;
    if (rows[0]) return { ...freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: Number(rows[0].scans_used) }), authenticated: true };
  }
  const rows = await sql<{ used: boolean }[]>`SELECT EXISTS(SELECT 1 FROM free_scan_claims WHERE device_hash=${input.device} OR ip_hash=${input.ip}) AS used`;
  return { ...freeScanDecision({ hasAnonymousUse: Boolean(rows[0]?.used), authenticatedEmailScans: null }), authenticated: false };
}

export async function freeBudgetStatus() {
  const sql = database(); if (!sql) return { paused: process.env.NODE_ENV === "production", spentUsd: 0, budgetUsd: budgetLimit() };
  const rows = await sql<{ spent: number }[]>`SELECT COALESCE((SELECT sum(estimated_usd) FROM scan_costs WHERE created_at>=date_trunc('day',now()) AND NOT paid),0)
    + COALESCE((SELECT sum(reserved_usd) FROM free_scan_claims WHERE created_at>=date_trunc('day',now())),0) AS spent`;
  const spentUsd = Number(rows[0]?.spent ?? 0);
  return { paused: !freeBudgetDecision(spentUsd, FREE_BUDGET_RESERVATION_USD, budgetLimit()).allowed, spentUsd, budgetUsd: budgetLimit() };
}

export async function reserveFreeScan(input: { scanId: string; device: string; ip: string; sessionToken?: string; skipIdentityLimits?: boolean }) {
  const sql = database();
  if (!sql) {
    if (input.skipIdentityLimits) return { allowed: false, remaining: 0, requiresEmail: false, authenticated: false, budgetPaused: true };
    const status = await freeStatus({ ...input });
    if (!status.allowed) return { ...status, budgetPaused: false };
    const identity = input.sessionToken ? localSessions.get(hashOpaqueToken(input.sessionToken)) : undefined;
    if (identity) localEmailUses.set(identity, (localEmailUses.get(identity) ?? 0) + 1);
    else { localClaims.add(`${input.device}:${input.ip}`); localClaims.add(`${input.device}:*`); localClaims.add(`*:${input.ip}`); }
    return { ...status, budgetPaused: false, remaining: Math.max(0, status.remaining - Number(status.authenticated)) };
  }
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('rb004-free-daily-budget'))`;
    const totals = await tx<{ spent: number }[]>`SELECT COALESCE((SELECT sum(estimated_usd) FROM scan_costs WHERE created_at>=date_trunc('day',now()) AND NOT paid),0)
      + COALESCE((SELECT sum(reserved_usd) FROM free_scan_claims WHERE created_at>=date_trunc('day',now())),0) AS spent`;
    const budget = freeBudgetDecision(Number(totals[0]?.spent ?? 0), FREE_BUDGET_RESERVATION_USD, budgetLimit());
    if (!budget.allowed) return { allowed: false, remaining: 0, requiresEmail: false, authenticated: false, budgetPaused: true, spentUsd: budget.spentUsd, budgetUsd: budget.budgetUsd };
    if (input.skipIdentityLimits) {
      const identity = hash(`rb004-public-free-scan:${input.scanId}`);
      await tx`INSERT INTO free_scan_claims (scan_id,device_hash,ip_hash,reserved_usd) VALUES (${input.scanId},${identity},${identity},${FREE_BUDGET_RESERVATION_USD})`;
      return { allowed: true, remaining: 0, requiresEmail: false, authenticated: false, budgetPaused: false };
    }
    let email: { email_hash: string; scans_used: number } | undefined;
    if (input.sessionToken) {
      const rows = await tx<{ email_hash: string; scans_used: number }[]>`SELECT e.email_hash,e.scans_used FROM free_scan_sessions s JOIN free_scan_entitlements e USING (email_hash)
        WHERE s.token_hash=${hashOpaqueToken(input.sessionToken)} AND s.expires_at>now() FOR UPDATE OF e`;
      email = rows[0];
    }
    if (email) {
      const decision = freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: Number(email.scans_used) });
      if (!decision.allowed) return { ...decision, authenticated: true, budgetPaused: false };
      const updated = await tx<{ scans_used: number }[]>`UPDATE free_scan_entitlements SET scans_used=scans_used+1 WHERE email_hash=${email.email_hash} AND scans_used<3 RETURNING scans_used`;
      if (!updated.length) return { allowed: false, remaining: 0, requiresEmail: false, authenticated: true, budgetPaused: false };
      await tx`INSERT INTO free_scan_claims (scan_id,device_hash,ip_hash,email_hash,reserved_usd) VALUES (${input.scanId},${input.device},${input.ip},${email.email_hash},${FREE_BUDGET_RESERVATION_USD})`;
      return { allowed: true, remaining: Math.max(0, 3 - Number(updated[0].scans_used)), requiresEmail: false, authenticated: true, budgetPaused: false };
    }
    const prior = await tx<{ scan_id: string }[]>`SELECT scan_id FROM free_scan_claims WHERE device_hash=${input.device} OR ip_hash=${input.ip} LIMIT 1`;
    if (prior.length) return { allowed: false, remaining: 0, requiresEmail: true, authenticated: false, budgetPaused: false };
    await tx`INSERT INTO free_scan_claims (scan_id,device_hash,ip_hash,reserved_usd) VALUES (${input.scanId},${input.device},${input.ip},${FREE_BUDGET_RESERVATION_USD})`;
    return { allowed: true, remaining: 0, requiresEmail: false, authenticated: false, budgetPaused: false };
  });
}

export async function releaseFreeScanReservation(scanId: string) {
  const sql = database(); if (!sql) return;
  await sql.begin(async (tx) => {
    const rows = await tx<{ email_hash: string | null }[]>`DELETE FROM free_scan_claims WHERE scan_id=${scanId} RETURNING email_hash`;
    if (rows[0]?.email_hash) await tx`UPDATE free_scan_entitlements SET scans_used=GREATEST(1,scans_used-1) WHERE email_hash=${rows[0].email_hash}`;
  });
}

export async function settleScanCost(input: { scanId: string; paid: boolean; browserMs: number; inputTokens: number; outputTokens: number; model: string }) {
  const inputRate = costSetting("LLM_INPUT_USD_PER_MILLION", 0.4);
  const outputRate = costSetting("LLM_OUTPUT_USD_PER_MILLION", 1.6);
  const browserRatePerSecond = costSetting("BROWSER_USD_PER_SECOND", 0.00002);
  const estimatedUsd = input.inputTokens * inputRate / 1_000_000 + input.outputTokens * outputRate / 1_000_000 + input.browserMs / 1000 * browserRatePerSecond;
  const sql = database();
  if (sql) await sql.begin(async (tx) => {
    await tx`INSERT INTO scan_costs (scan_id,paid,browser_ms,input_tokens,output_tokens,model,estimated_usd)
      VALUES (${input.scanId},${input.paid},${Math.max(0, Math.round(input.browserMs))},${Math.max(0, Math.round(input.inputTokens))},${Math.max(0, Math.round(input.outputTokens))},${input.model.slice(0,100)},${estimatedUsd})
      ON CONFLICT (scan_id) DO UPDATE SET paid=EXCLUDED.paid,browser_ms=EXCLUDED.browser_ms,input_tokens=EXCLUDED.input_tokens,output_tokens=EXCLUDED.output_tokens,model=EXCLUDED.model,estimated_usd=EXCLUDED.estimated_usd`;
    await tx`UPDATE free_scan_claims SET reserved_usd=0 WHERE scan_id=${input.scanId}`;
  });
  return estimatedUsd;
}

export async function addPaidModelCost(input: { scanId: string; inputTokens: number; outputTokens: number; model: string }) {
  const inputRate = costSetting("LLM_INPUT_USD_PER_MILLION", 0.4);
  const outputRate = costSetting("LLM_OUTPUT_USD_PER_MILLION", 1.6);
  const amount = input.inputTokens * inputRate / 1_000_000 + input.outputTokens * outputRate / 1_000_000;
  const sql = database(); if (!sql) return;
  await sql.begin(async (tx) => {
    const inserted = await tx<{ scan_id: string }[]>`INSERT INTO paid_prompt_costs (scan_id,input_tokens,output_tokens,model,estimated_usd)
      VALUES (${input.scanId},${Math.max(0,Math.round(input.inputTokens))},${Math.max(0,Math.round(input.outputTokens))},${input.model.slice(0,100)},${amount}) ON CONFLICT (scan_id) DO NOTHING RETURNING scan_id`;
    if (inserted.length) await tx`UPDATE scan_costs SET input_tokens=input_tokens+${Math.max(0,Math.round(input.inputTokens))},output_tokens=output_tokens+${Math.max(0,Math.round(input.outputTokens))},model=${input.model.slice(0,100)} WHERE scan_id=${input.scanId}`;
  });
}

export async function requestFreeMagicLink(input: { email: string; device: string; ip: string; origin: string }) {
  const email = input.email.trim().toLowerCase(); const normalizedHash = emailHash(email);
  const sql = database();
  if (!sql || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { ok: false as const, error: "Email sign-in is temporarily unavailable. Please try again later." };
  const eligible = await sql<{ scan_id: string; scans_used: number | null }[]>`SELECT c.scan_id,e.scans_used FROM free_scan_claims c
    LEFT JOIN free_scan_entitlements e ON e.email_hash=${normalizedHash}
    WHERE (c.email_hash IS NULL AND (c.device_hash=${input.device} OR c.ip_hash=${input.ip})) OR c.email_hash=${normalizedHash}
    ORDER BY CASE WHEN c.email_hash IS NULL THEN 0 ELSE 1 END,c.created_at LIMIT 1`;
  if (!eligible.length) return { ok: false as const, error: "Complete your first free scan before requesting a sign-in link." };
  if (Number(eligible[0].scans_used ?? 1) >= 3) return { ok: false as const, error: "That email has used its three free scans." };
  const token = newOpaqueToken(); const tokenHash = hashOpaqueToken(token);
  await sql`INSERT INTO free_scan_magic_links (token_hash,email_hash,email,device_hash,ip_hash,first_scan_id,expires_at)
    VALUES (${tokenHash},${normalizedHash},${email},${input.device},${input.ip},${eligible[0].scan_id},now()+interval '1 hour')`;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NODE_ENV === "production" && !configuredOrigin) { await sql`DELETE FROM free_scan_magic_links WHERE token_hash=${tokenHash}`; return { ok: false as const, error: "Email sign-in is temporarily unavailable. Please try again later." }; }
  let base: string;
  try { const parsed = new URL(configuredOrigin || input.origin); if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("HTTPS origin required"); base = parsed.origin; }
  catch { await sql`DELETE FROM free_scan_magic_links WHERE token_hash=${tokenHash}`; return { ok: false as const, error: "Email sign-in is temporarily unavailable. Please try again later." }; }
  const link = `${base}/api/free-access/verify?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, signal: AbortSignal.timeout(7000), body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [email], subject: "Your Ready for Real sign-in link", text: `Use this link within one hour to unlock two more free scans: ${link}\n\nIf you did not request it, ignore this email.` }) });
  if (!response.ok) { await sql`DELETE FROM free_scan_magic_links WHERE token_hash=${tokenHash}`; return { ok: false as const, error: "The sign-in email could not be sent. Please try again." }; }
  return { ok: true as const };
}

export async function verifyFreeMagicLink(token: string) {
  const sql = database(); if (!sql) return undefined;
  const tokenHash = hashOpaqueToken(token); const session = newOpaqueToken();
  return sql.begin(async (tx) => {
    const links = await tx<{ email_hash: string; email: string; first_scan_id: string }[]>`SELECT email_hash,email,first_scan_id FROM free_scan_magic_links WHERE token_hash=${tokenHash} AND expires_at>now() AND used_at IS NULL FOR UPDATE`;
    const link = links[0]; if (!link) return undefined;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`free-email:${link.email_hash}`}))`;
    const claims = await tx<{ email_hash: string | null }[]>`SELECT email_hash FROM free_scan_claims WHERE scan_id=${link.first_scan_id} FOR UPDATE`;
    const claim = claims[0]; if (!claim) return undefined;
    const current = await tx<{ scans_used: number }[]>`SELECT scans_used FROM free_scan_entitlements WHERE email_hash=${link.email_hash} FOR UPDATE`;
    const decision = emailClaimDecision(current[0] ? Number(current[0].scans_used) : null, claim.email_hash, link.email_hash);
    if (!decision.allowed) return { exhausted: true as const };
    if (current[0]) {
      if (decision.attach) await tx`UPDATE free_scan_entitlements SET email=${link.email},scans_used=${decision.scansUsed} WHERE email_hash=${link.email_hash}`;
    } else {
      await tx`INSERT INTO free_scan_entitlements (email_hash,email,scans_used) VALUES (${link.email_hash},${link.email},${decision.scansUsed})`;
    }
    if (decision.attach) await tx`UPDATE free_scan_claims SET email_hash=${link.email_hash} WHERE scan_id=${link.first_scan_id} AND email_hash IS NULL`;
    await tx`UPDATE free_scan_magic_links SET used_at=now() WHERE token_hash=${tokenHash}`;
    await tx`INSERT INTO free_scan_sessions (token_hash,email_hash,expires_at) VALUES (${hashOpaqueToken(session)},${link.email_hash},now()+interval '30 days')`;
    return { exhausted: false as const, session };
  });
}

export async function addFreeWaitlist(email: string) {
  const sql = database(); if (!sql) return false;
  await sql`INSERT INTO free_waitlist (email,reason) VALUES (${email.trim().toLowerCase()},'daily_budget') ON CONFLICT (email) DO UPDATE SET reason=EXCLUDED.reason`;
  return true;
}

export async function adminMetrics() {
  const sql = database(); if (!sql) throw new Error("The reporting database is not configured.");
  const rows = await sql<Record<string, string | number>[]>`SELECT
    (SELECT count(*) FROM scans WHERE created_at>=date_trunc('day',now())) AS scans_today,
    (SELECT COALESCE(sum(estimated_usd),0) FROM scan_costs WHERE created_at>=date_trunc('day',now()))
      + (SELECT COALESCE(sum(estimated_usd),0) FROM paid_prompt_costs WHERE incurred_at>=date_trunc('day',now())) AS spend_today,
    (SELECT COALESCE(sum(estimated_usd),0) FROM scan_costs WHERE created_at>=date_trunc('month',now()))
      + (SELECT COALESCE(sum(estimated_usd),0) FROM paid_prompt_costs WHERE incurred_at>=date_trunc('month',now())) AS spend_month,
    (SELECT count(DISTINCT email) FROM (SELECT email FROM leads UNION SELECT email FROM free_scan_entitlements UNION SELECT email FROM free_waitlist) unique_emails) AS emails_collected,
    (SELECT count(*) FROM purchases WHERE revoked_at IS NULL AND created_at>=date_trunc('day',now())) AS paid_conversions_today,
    (SELECT count(*) FROM purchases WHERE revoked_at IS NULL AND created_at>=date_trunc('month',now())) AS paid_conversions_month`;
  return rows[0];
}
