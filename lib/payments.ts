import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import StripeSdk from "stripe";
import { PRICE_FIX_PROMPT_USD, PRODUCT_NAME, RELEASE_CODE, SITE_URL } from "../config/release";
import { database, readScan } from "./store";
import { PAID_RESCAN_COOKIE } from "./free-tier";

export const stripeClient = () => process.env.STRIPE_SECRET_KEY ? new StripeSdk(process.env.STRIPE_SECRET_KEY) : undefined;
export const ACCESS_COOKIE = "rb004_access_";
export const PAID_RESCAN_LIMIT = 2;
export const PURCHASE_ACCESS_COOKIE = "rb004_purchase_access";
export function hashAccessToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function tokenEncryptionKey() {
  const raw = process.env.REPORT_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Paid reports need REPORT_TOKEN_ENCRYPTION_KEY to deliver secure access links.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("REPORT_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}
export function encryptClaimToken(token: string, key: Buffer) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function decryptClaimToken(value: string, key: Buffer) {
  const buffer = Buffer.from(value, "base64url"); if (buffer.length < 29) throw new Error("Invalid encrypted report token.");
  const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
}
export function readAccessCookies(cookieHeader: string | null, scanId: string) {
  const name = `${ACCESS_COOKIE}${scanId}`;
  const pairs = cookieHeader?.split(";").map((item) => item.trim()) ?? [];
  return [`${name}=`, `${PAID_RESCAN_COOKIE}=`, `${PURCHASE_ACCESS_COOKIE}=`].flatMap((prefix) => {
    const pair = pairs.find((item) => item.startsWith(prefix));
    if (!pair) return [];
    try { return [decodeURIComponent(pair.slice(pair.indexOf("=") + 1))]; } catch { return []; }
  }).filter((token, index, tokens) => Boolean(token) && tokens.indexOf(token) === index);
}
export function readAccessCookie(cookieHeader: string | null, scanId: string) {
  return readAccessCookies(cookieHeader, scanId)[0];
}
export function validatePaidSession(session: Stripe.Checkout.Session, scanId: string) {
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  return Boolean(priceId && scanId && session.metadata?.scanId === scanId && session.metadata?.priceId === priceId && session.client_reference_id === scanId && session.metadata?.releaseCode === RELEASE_CODE && session.metadata?.oneTime === "true" && session.mode === "payment" && session.payment_method_types?.length === 1 && session.payment_method_types[0] === "card" && session.currency === "usd" && session.amount_total === PRICE_FIX_PROMPT_USD * 100 && session.payment_status === "paid");
}
export function verifyStripeEvent(stripe: Stripe, raw: string, signature: string, secret: string) {
  return stripe.webhooks.constructEvent(raw, signature, secret);
}

export async function makeCheckout(scanId: string) {
  const scan = await readScan(scanId);
  if (!scan || scan.status !== "complete") throw new Error("The scan must be complete before checkout.");
  if (!scan.paidPayload?.available) throw new Error("A complete Launch Plan is not available for this scan yet.");
  const sql = database(); if (!sql) throw new Error("The purchase database is not configured.");
  const stripe = stripeClient(); if (!stripe) throw new Error("Stripe checkout is not configured.");
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  if (!priceId) throw new Error("Stripe product price is not configured. Add STRIPE_PRICE_ID before offering checkout.");
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook is not configured. Add STRIPE_WEBHOOK_SECRET before offering checkout.");
  if (!process.env.RESEND_API_KEY) throw new Error("Paid report email delivery is not configured. Add RESEND_API_KEY before offering checkout.");
  if (!process.env.RESEND_FROM_EMAIL) throw new Error("Paid report email delivery is not configured. Add RESEND_FROM_EMAIL before offering checkout.");
  tokenEncryptionKey();
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) throw new Error("Set NEXT_PUBLIC_SITE_URL to your verified public app URL.");
  const site = SITE_URL.replace(/\/$/, "");
  const price = await stripe.prices.retrieve(priceId);
  if (!price.active || price.type !== "one_time" || price.currency !== "usd" || price.unit_amount !== PRICE_FIX_PROMPT_USD * 100) {
    throw new Error(`Stripe price must be active, one-time, and exactly ${PRICE_FIX_PROMPT_USD} USD.`);
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const attemptId = `pending-${randomBytes(16).toString("hex")}`;
  // Commit an issuance attempt before Stripe: a lost API response can still be reconciled by webhook metadata.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${scanId}))`;
    const reservation = await tx<{ stripe_session_id: string }[]>`SELECT stripe_session_id FROM checkout_reservations WHERE scan_id=${scanId} AND expires_at>now() FOR UPDATE`;
    if (reservation.length) throw new Error("Checkout is already open for this report. Finish that session or try again in an hour.");
    await tx`INSERT INTO checkout_sessions (stripe_session_id,scan_id,expires_at) VALUES (${attemptId},${scanId},to_timestamp(${expiresAt}))`;
    await tx`INSERT INTO checkout_reservations (scan_id,stripe_session_id,expires_at) VALUES (${scanId},${attemptId},to_timestamp(${expiresAt}))
      ON CONFLICT (scan_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id,expires_at=EXCLUDED.expires_at`;
  });
  const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], client_reference_id: scanId, customer_creation: "always", expires_at: expiresAt,
      line_items: [{ quantity: 1, price: priceId }],
      metadata: { scanId, priceId, releaseCode: RELEASE_CODE, oneTime: "true", checkoutAttemptId: attemptId },
      success_url: `${site}/r/${encodeURIComponent(scanId)}?checkout=complete`, cancel_url: `${site}/r/${encodeURIComponent(scanId)}?checkout=cancelled`,
  }, { idempotencyKey: attemptId });
  await sql.begin(async (tx) => {
    await tx`UPDATE checkout_sessions SET stripe_session_id=${session.id} WHERE stripe_session_id=${attemptId}`;
    await tx`UPDATE checkout_reservations SET stripe_session_id=${session.id} WHERE scan_id=${scanId} AND stripe_session_id=${attemptId}`;
  });
  return { session };
}

export async function activatePurchase(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const sql = database(); if (!sql) throw new Error("Purchase database is unavailable.");
  const scanId = session.metadata?.scanId;
  if (!scanId || !validatePaidSession(session, scanId)) throw new Error("Stripe checkout session did not match the fixed one-time product price.");
  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) throw new Error("The verified checkout did not include a purchaser email for report delivery.");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntent) throw new Error("The verified checkout did not include a payment intent.");
  const encryptionKey = tokenEncryptionKey();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`payment:${paymentIntent}`}))`;
    const inserted = await tx<{ event_id: string }[]>`INSERT INTO stripe_events (event_id) VALUES (${event.id}) ON CONFLICT DO NOTHING RETURNING event_id`;
    if (!inserted.length) return false;
    const rows = await tx<{ payload: { paidPayload?: { available?: boolean } } }[]>`SELECT payload FROM scans WHERE id=${scanId} FOR UPDATE`;
    if (!rows[0]?.payload.paidPayload?.available) throw new Error("The paid report is not available for this scan.");
    const issued = await tx<{ stripe_session_id: string }[]>`SELECT stripe_session_id FROM checkout_sessions WHERE scan_id=${scanId}
      AND (stripe_session_id=${session.id} OR stripe_session_id=${session.metadata?.checkoutAttemptId ?? ""}) FOR UPDATE`;
    if (!issued.length) throw new Error("Checkout session was not issued for this report.");
    if (issued[0].stripe_session_id !== session.id) await tx`UPDATE checkout_sessions SET stripe_session_id=${session.id} WHERE stripe_session_id=${issued[0].stripe_session_id}`;
    const refunded = await tx`SELECT stripe_payment_intent_id FROM refunded_payment_intents WHERE stripe_payment_intent_id=${paymentIntent}`;
    const purchase = await tx<{ id: string }[]>`INSERT INTO purchases (id,scan_id,stripe_session_id,stripe_payment_intent_id,amount,currency)
      VALUES (${`purchase-${session.id}`},${scanId},${session.id},${paymentIntent ?? null},${PRICE_FIX_PROMPT_USD * 100},'usd') ON CONFLICT DO NOTHING RETURNING id`;
    if (!purchase.length) return false;
    await tx`DELETE FROM checkout_reservations WHERE scan_id=${scanId} AND stripe_session_id=${session.id}`;
    if (refunded.length) {
      await tx`UPDATE purchases SET revoked_at=now() WHERE stripe_session_id=${session.id}`;
      return false;
    }
    const claimToken = randomBytes(32).toString("base64url");
    await tx`INSERT INTO checkout_access_tokens (token_hash,scan_id,stripe_session_id,expires_at)
      VALUES (${hashAccessToken(claimToken)},${scanId},${session.id},NULL) ON CONFLICT (stripe_session_id) DO NOTHING`;
    const rescanToken = randomBytes(32).toString("base64url");
    const paidScan = await tx<{ url: string }[]>`SELECT url FROM scans WHERE id=${scanId} LIMIT 1`;
    const rescanAccess = paidScan[0] ? await tx<{ expires_at: Date }[]>`INSERT INTO paid_url_access (token_hash,token_ciphertext,scan_id,stripe_session_id,normalized_url,recipient,expires_at,rescans_limit)
      VALUES (${hashAccessToken(rescanToken)},${encryptClaimToken(rescanToken,encryptionKey)},${scanId},${session.id},${paidScan[0].url},${email.toLowerCase()},now()+interval '7 days',${PAID_RESCAN_LIMIT}) ON CONFLICT (token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash RETURNING expires_at` : [];
    if (rescanAccess[0]) {
      const paidRescanExpiresAt = rescanAccess[0].expires_at.toISOString();
      await tx`UPDATE scans SET is_paid=true,payload=jsonb_set(payload,'{paidRescanExpiresAt}',to_jsonb(${paidRescanExpiresAt}::text),true) WHERE id=${scanId}`;
    }
    const ciphertext = encryptClaimToken(claimToken, encryptionKey);
    await tx`INSERT INTO report_email_outbox (stripe_session_id,scan_id,recipient,token_ciphertext)
      VALUES (${session.id},${scanId},${email.toLowerCase()},${ciphertext}) ON CONFLICT (stripe_session_id) DO NOTHING`;
    await tx`UPDATE scans SET is_paid=true,payload=jsonb_set(payload,'{paid}','true'::jsonb),updated_at=now() WHERE id=${scanId}`;
    if (email) await tx`INSERT INTO leads (scan_id,url,email,score) SELECT id,url,${email.toLowerCase()},(payload->>'score')::integer FROM scans WHERE id=${scanId} ON CONFLICT (scan_id,email) DO NOTHING`;
    return true;
  });
}

export async function activateRefund(event: Stripe.Event, charge: Stripe.Charge) {
  if (charge.amount_refunded <= 0) return;
  const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return;
  const sql = database(); if (!sql) throw new Error("Purchase database is unavailable.");
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`payment:${paymentIntent}`}))`;
    const inserted = await tx<{ event_id: string }[]>`INSERT INTO stripe_events (event_id) VALUES (${event.id}) ON CONFLICT DO NOTHING RETURNING event_id`;
    if (!inserted.length) return;
    await tx`INSERT INTO refunded_payment_intents (stripe_payment_intent_id) VALUES (${paymentIntent}) ON CONFLICT DO NOTHING`;
    const purchases = await tx<{ scan_id: string; stripe_session_id: string }[]>`UPDATE purchases SET revoked_at=now() WHERE stripe_payment_intent_id=${paymentIntent} AND revoked_at IS NULL RETURNING scan_id,stripe_session_id`;
    for (const { scan_id, stripe_session_id } of purchases) {
      await tx`SELECT id FROM scans WHERE id=${scan_id} FOR UPDATE`;
      const otherPaid = await tx<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM purchases WHERE scan_id=${scan_id} AND revoked_at IS NULL) AS exists`;
      if (!otherPaid[0]?.exists) {
        await tx`UPDATE scans SET is_paid=false,payload=jsonb_set(payload,'{paid}','false'::jsonb) WHERE id=${scan_id}`;
      }
      await tx`UPDATE paid_url_access SET expires_at=now() WHERE stripe_session_id=${stripe_session_id}`;
      await tx`UPDATE report_email_outbox SET status='cancelled',token_ciphertext='',locked_at=NULL WHERE stripe_session_id=${stripe_session_id}`;
    }
  });
}

export async function claimReportEmail() {
  const sql = database(); if (!sql) return undefined;
  return sql.begin(async (tx) => {
    const rows = await tx<{ stripe_session_id: string; scan_id: string; recipient: string; token_ciphertext: string }[]>`WITH candidate AS (
      SELECT stripe_session_id FROM report_email_outbox WHERE (status='pending' AND next_attempt_at<=now()) OR (status='sending' AND locked_at<now()-interval '2 minutes')
      ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE report_email_outbox SET status='sending',locked_at=now(),attempts=attempts+1 FROM candidate
      WHERE report_email_outbox.stripe_session_id=candidate.stripe_session_id RETURNING report_email_outbox.stripe_session_id,report_email_outbox.scan_id,report_email_outbox.recipient,report_email_outbox.token_ciphertext`;
    return rows[0];
  });
}

export async function deliverClaimEmail() {
  const job = await claimReportEmail(); if (!job) return false;
  const sql = database(); if (!sql) return false;
  try {
    await sql.begin(async (tx) => {
      // Serialize send with refund, and reject stale jobs after recovery or another worker has finished.
      const purchase = await tx`SELECT id FROM purchases WHERE stripe_session_id=${job.stripe_session_id} AND revoked_at IS NULL FOR UPDATE`;
      const current = await tx`SELECT stripe_session_id FROM report_email_outbox WHERE stripe_session_id=${job.stripe_session_id}
        AND status='sending' AND token_ciphertext=${job.token_ciphertext} FOR UPDATE`;
      if (!purchase.length || !current.length) return;
      const token = decryptClaimToken(job.token_ciphertext, tokenEncryptionKey());
      const base = SITE_URL.replace(/\/$/, "");
      const rescanRows = await tx<{ token_ciphertext: string; rescans_limit: number | null }[]>`SELECT token_ciphertext,rescans_limit FROM paid_url_access WHERE scan_id=${job.scan_id} AND stripe_session_id=${job.stripe_session_id} AND recipient=${job.recipient} AND expires_at>now() ORDER BY created_at DESC LIMIT 1`;
      const rescanToken = rescanRows[0] ? decryptClaimToken(rescanRows[0].token_ciphertext, tokenEncryptionKey()) : "";
      const claimUrl = `${base}/api/scans/${encodeURIComponent(job.scan_id)}/claim?token=${encodeURIComponent(token)}${rescanToken ? `&rescan=${encodeURIComponent(rescanToken)}` : ""}`;
      const rescanText = !rescanToken ? "" : rescanRows[0].rescans_limit === null ? "Your purchase includes unlimited re-scans of this exact URL for seven days." : "Your purchase includes two additional re-scans of this exact URL within seven days. Each re-scan checks the current page again.";
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json", "Idempotency-Key": `report-${hashAccessToken(job.token_ciphertext)}` }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [job.recipient], subject: `${PRODUCT_NAME}: your verified report`, text: `Your one-time ${PRODUCT_NAME} report is ready. Open the secure purchaser link: ${claimUrl}\n\n${rescanText}\n\nThis link grants access to the paid report. Do not forward it.` }) });
      if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`);
      await tx`UPDATE report_email_outbox SET status='sent',sent_at=now(),token_ciphertext='',locked_at=NULL WHERE stripe_session_id=${job.stripe_session_id}`;
    });
  } catch (error) {
    const safeCode = error instanceof Error ? error.name : "UnknownError";
    console.error("Report claim email delivery failed", { errorName: safeCode });
    await sql`UPDATE report_email_outbox SET status='pending',next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts,7))::int)),locked_at=NULL WHERE stripe_session_id=${job.stripe_session_id} AND status='sending' AND token_ciphertext=${job.token_ciphertext}`;
  }
  return true;
}

export async function requestClaimEmail(scanId: string, email: string) {
  const sql = database(); if (!sql) return;
  const normalized = email.trim().toLowerCase();
  await sql.begin(async (tx) => {
    const rows = await tx<{ stripe_session_id: string; status: string; recovery_pending: boolean }[]>`SELECT o.stripe_session_id,o.status,(t.pending_expires_at>now()) AS recovery_pending FROM report_email_outbox o
      JOIN purchases p ON p.stripe_session_id=o.stripe_session_id
      JOIN checkout_access_tokens t ON t.stripe_session_id=o.stripe_session_id
      WHERE o.scan_id=${scanId} AND o.recipient=${normalized} AND p.revoked_at IS NULL ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE`;
    const row = rows[0]; if (!row) return;
    if (row.status === "sent") {
      if (row.recovery_pending) return;
      const token = randomBytes(32).toString("base64url");
      await tx`UPDATE checkout_access_tokens SET pending_token_hash=${hashAccessToken(token)},pending_expires_at=now()+interval '24 hours' WHERE stripe_session_id=${row.stripe_session_id}`;
      await tx`UPDATE report_email_outbox SET status='pending',token_ciphertext=${encryptClaimToken(token, tokenEncryptionKey())},attempts=0,next_attempt_at=now(),locked_at=NULL,sent_at=NULL WHERE stripe_session_id=${row.stripe_session_id}`;
    } else if (row.status === "pending") {
      await tx`UPDATE report_email_outbox SET next_attempt_at=now() WHERE stripe_session_id=${row.stripe_session_id}`;
    }
  });
}

async function authorizedPaidScan(scanId: string, token: string) {
  const sql = database(); if (!sql) return undefined;
  const tokenHash = hashAccessToken(token);
  const rows = await sql<{ token_hash: string }[]>`SELECT t.token_hash FROM checkout_access_tokens t JOIN purchases p ON p.stripe_session_id=t.stripe_session_id WHERE t.scan_id=${scanId} AND p.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now()) AND t.token_hash=${tokenHash}
    UNION ALL SELECT t.token_hash FROM paid_rescan_reports r JOIN purchases p ON p.stripe_session_id=r.stripe_session_id AND p.revoked_at IS NULL JOIN checkout_access_tokens t ON t.stripe_session_id=r.stripe_session_id WHERE r.scan_id=${scanId} AND t.token_hash=${tokenHash}
    UNION ALL SELECT a.token_hash FROM paid_rescan_reports r JOIN paid_url_access a ON a.stripe_session_id=r.stripe_session_id JOIN purchases p ON p.stripe_session_id=r.stripe_session_id AND p.revoked_at IS NULL WHERE r.scan_id=${scanId} AND a.token_hash=${tokenHash}
    UNION ALL SELECT a.token_hash FROM paid_url_access a JOIN purchases p ON p.stripe_session_id=a.stripe_session_id AND p.revoked_at IS NULL JOIN scans s ON s.id=${scanId} AND s.is_paid AND a.normalized_url=s.url WHERE a.token_hash=${tokenHash} AND a.created_at<=s.created_at AND a.expires_at>s.created_at AND a.expires_at>now() AND s.payload->>'paidRescanSessionId' IS NULL AND NOT EXISTS (SELECT 1 FROM paid_url_access original WHERE original.scan_id=s.id) AND 1=(SELECT count(*) FROM paid_url_access historical_access WHERE historical_access.normalized_url=s.url AND historical_access.created_at<=s.created_at AND historical_access.expires_at>s.created_at)
    UNION ALL SELECT a.token_hash FROM paid_url_access a JOIN purchases p ON p.stripe_session_id=a.stripe_session_id AND p.revoked_at IS NULL JOIN scans s ON s.id=${scanId} AND s.is_paid AND a.normalized_url=s.url WHERE a.token_hash=${tokenHash} AND a.expires_at>now() AND s.payload->>'paidRescanExpiresAt' IS NOT NULL AND abs(extract(epoch FROM (a.expires_at-(s.payload->>'paidRescanExpiresAt')::timestamptz)))<0.0011 AND 1=(SELECT count(*) FROM paid_url_access marked WHERE marked.normalized_url=s.url AND abs(extract(epoch FROM (marked.expires_at-(s.payload->>'paidRescanExpiresAt')::timestamptz)))<0.0011) LIMIT 1`;
  if (!rows[0]) return undefined;
  const expected = Buffer.from(rows[0].token_hash); const actual = Buffer.from(tokenHash);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  const scan = await readScan(scanId);
  return scan?.paid ? scan : undefined;
}

export async function getPaidReport(scanId: string, token: string) {
  const scan = await authorizedPaidScan(scanId, token);
  if (!scan?.paidPayload?.available || !scan.paidPayload.paidModelReady) return undefined;
  return scan.paidPayload;
}

export async function isPaidReportPreparing(scanId: string, token: string) {
  const scan = await authorizedPaidScan(scanId, token);
  return Boolean(scan && (!scan.paidPayload?.available || !scan.paidPayload.paidModelReady));
}

export async function verifyClaimToken(scanId: string, token: string) {
  const sql = database(); if (!sql) return false;
  const tokenHash = hashAccessToken(token);
  return sql.begin(async (tx) => {
    const rows = await tx<{ token_hash: string; pending_token_hash: string | null }[]>`SELECT t.token_hash,t.pending_token_hash FROM checkout_access_tokens t JOIN purchases p ON p.stripe_session_id=t.stripe_session_id
      WHERE t.scan_id=${scanId} AND p.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now())
      AND (t.token_hash=${tokenHash} OR (t.pending_token_hash=${tokenHash} AND t.pending_expires_at>now())) LIMIT 1 FOR UPDATE`;
    const row = rows[0]; if (!row) return false;
    if (row.pending_token_hash === tokenHash) {
      await tx`UPDATE checkout_access_tokens SET token_hash=${tokenHash},pending_token_hash=NULL,pending_expires_at=NULL WHERE token_hash=${row.token_hash}`;
    }
    return true;
  });
}

export async function verifyPaidRescanToken(token: string, scanId?: string, normalizedUrl?: string) {
  const sql = database(); if (!sql) return undefined;
  const tokenHash = hashAccessToken(token);
  const rows = await sql<{ scan_id: string; stripe_session_id: string; normalized_url: string; expires_at: Date; rescans_used: number; rescans_limit: number | null }[]>`SELECT a.scan_id,a.stripe_session_id,a.normalized_url,a.expires_at,a.rescans_used,a.rescans_limit FROM paid_url_access a JOIN purchases p ON p.stripe_session_id=a.stripe_session_id AND p.revoked_at IS NULL WHERE a.token_hash=${tokenHash} AND a.expires_at>now() LIMIT 1`;
  if (!rows[0] || (scanId && rows[0].scan_id !== scanId) || (normalizedUrl && rows[0].normalized_url !== normalizedUrl)) return undefined;
  return { ...rows[0], entitlementTokenHash: tokenHash, rescansRemaining: rows[0].rescans_limit === null ? null : Math.max(0, rows[0].rescans_limit - rows[0].rescans_used) };
}

export async function consumePaidRescan(token: string, normalizedUrl: string) {
  const sql = database(); if (!sql) return undefined;
  const tokenHash = hashAccessToken(token);
  const rows = await sql<{ scan_id: string; stripe_session_id: string; normalized_url: string; expires_at: Date; rescans_used: number; rescans_limit: number | null }[]>`UPDATE paid_url_access a
    SET rescans_used=a.rescans_used+1
    FROM purchases p
    WHERE a.stripe_session_id=p.stripe_session_id AND p.revoked_at IS NULL AND a.token_hash=${tokenHash}
      AND a.normalized_url=${normalizedUrl} AND a.expires_at>now() AND (a.rescans_limit IS NULL OR a.rescans_used<a.rescans_limit)
    RETURNING a.scan_id,a.stripe_session_id,a.normalized_url,a.expires_at,a.rescans_used,a.rescans_limit`;
  const row = rows[0];
  return row ? { ...row, entitlementTokenHash: tokenHash, rescansRemaining: row.rescans_limit === null ? null : Math.max(0, row.rescans_limit - row.rescans_used) } : undefined;
}

export async function releasePaidRescan(token: string) {
  const sql = database(); if (!sql) return;
  const tokenHash = hashAccessToken(token);
  await sql`UPDATE paid_url_access SET rescans_used=GREATEST(0,rescans_used-1) WHERE token_hash=${tokenHash}`;
}
