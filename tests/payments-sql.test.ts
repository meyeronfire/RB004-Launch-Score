import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type Stripe from "stripe";
import type postgres from "postgres";

const mocks = vi.hoisted(() => ({ sql: undefined as unknown, create: vi.fn() }));
vi.mock("../lib/store", () => ({
  database: () => mocks.sql,
  readScan: async (id: string) => {
    const sql = mocks.sql as ReturnType<typeof postgres>;
    const rows = await sql`SELECT payload,is_paid FROM scans WHERE id=${id}`;
    return rows[0] ? { ...rows[0].payload, paid: rows[0].is_paid } : undefined;
  },
}));
vi.mock("stripe", () => ({ default: class { checkout = { sessions: { create: mocks.create } }; } }));
import { activatePurchase, activateRefund, decryptClaimToken, deliverClaimEmail, getPaidReport, makeCheckout, requestClaimEmail, verifyClaimToken, verifyPaidRescanToken } from "../lib/payments";
import { enqueuePaidPrompt } from "../lib/paid-prompt";

const scanId = "11111111-1111-4111-8111-111111111111";
const key = Buffer.alloc(32, 7);
let db: PGlite;
type Queryable = { query: (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
function tag(client: Queryable) {
  return async (parts: TemplateStringsArray, ...values: unknown[]) => client.query(parts.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, ""), values).then((result) => result.rows);
}
function paid(id: string, attemptId?: string) {
  return { id, metadata: { scanId, releaseCode: "RB004", oneTime: "true", ...(attemptId ? { checkoutAttemptId: attemptId } : {}) }, client_reference_id: scanId, mode: "payment", payment_method_types: ["card"], currency: "usd", amount_total: 1200, payment_status: "paid", customer_details: { email: "buyer@example.test" }, payment_intent: `pi_${id}` } as unknown as Stripe.Checkout.Session;
}
const event = (id: string) => ({ id }) as Stripe.Event;
async function issued(id: string) {
  await db.query("INSERT INTO checkout_sessions (stripe_session_id,scan_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [id, scanId]);
  await activatePurchase(event(`evt_${id}`), paid(id));
  const row = (await db.query<{ token_ciphertext: string }>("SELECT token_ciphertext FROM report_email_outbox WHERE stripe_session_id=$1", [id])).rows[0];
  return row ? decryptClaimToken(row.token_ciphertext, key) : undefined;
}
async function counts(table: string) { return Number((await db.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`)).rows[0].count); }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/001_initial.sql", "utf8"));
  await db.exec(await readFile("db/migrations/002_free_tier_costs.sql", "utf8"));
  await db.exec(await readFile("db/migrations/001_initial.sql", "utf8"));
  // PGlite is a single-connection PostgreSQL runtime. Transaction and row semantics are real;
  // advisory lock scheduling needs the separate hosted multi-connection acceptance check.
  await db.exec("CREATE FUNCTION public.pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'; SET search_path TO public,pg_catalog;");
  const sql = Object.assign(tag(db), { begin: (callback: (tx: ReturnType<typeof tag>) => Promise<unknown>) => db.transaction((tx) => callback(tag(tx))) });
  mocks.sql = sql;
});
beforeEach(async () => {
  await db.exec("TRUNCATE scans, stripe_events, refunded_payment_intents CASCADE");
  await db.query("INSERT INTO scans(id,url,status,phase,payload) VALUES($1,'https://example.test/','complete','Ready',$2::jsonb)", [scanId, JSON.stringify({ id: scanId, status: "complete", domain: "example.test", score: 88, paidPayload: { available: true, paidModelReady: true, model: "gpt-4.1", prompts: { Cursor: "private fix" } } })]);
  vi.stubEnv("REPORT_TOKEN_ENCRYPTION_KEY", key.toString("base64"));
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_fake");
  vi.stubEnv("RESEND_API_KEY", "re_test_fake");
  vi.stubEnv("RESEND_FROM_EMAIL", "reports@example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  mocks.create.mockReset().mockImplementation(async (params: Stripe.Checkout.SessionCreateParams) => ({ ...paid(`cs_${mocks.create.mock.calls.length}`, params.metadata?.checkoutAttemptId as string), url: "https://checkout.stripe.test/local" }));
});
afterAll(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await db.close(); });

describe("paid report transactions on PostgreSQL", () => {
  it("does not create a chargeable session before webhook delivery is configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    await expect(makeCheckout(scanId)).rejects.toThrow("Stripe webhook is not configured");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await counts("checkout_sessions")).toBe(0);
  });
  it("keeps every issued session after reservation replacement and delivers both legitimate purchases", async () => {
    const first = (await makeCheckout(scanId)).session;
    await expect(makeCheckout(scanId)).rejects.toThrow("already open");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await db.exec("UPDATE checkout_reservations SET expires_at=now()-interval '1 minute'");
    const second = (await makeCheckout(scanId)).session;
    expect(await activatePurchase(event("evt_delayed"), first)).toBe(true);
    expect(await activatePurchase(event("evt_second"), second)).toBe(true);
    expect(await activatePurchase(event("evt_delayed"), first)).toBe(false);
    expect(await activatePurchase(event("evt_other_delivery"), first)).toBe(false);
    expect(await counts("purchases")).toBe(2);
    expect(await counts("checkout_access_tokens")).toBe(2);
    expect(await counts("report_email_outbox")).toBe(2);
    expect(await counts("checkout_sessions")).toBe(2);
    expect(await deliverClaimEmail()).toBe(true);
    expect(await deliverClaimEmail()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reconciles a paid Stripe session even if the create response was lost", async () => {
    let charged: Stripe.Checkout.Session | undefined;
    mocks.create.mockImplementationOnce(async (params: Stripe.Checkout.SessionCreateParams) => { charged = paid("cs_lost", params.metadata?.checkoutAttemptId as string); throw new Error("network response lost"); });
    await expect(makeCheckout(scanId)).rejects.toThrow("network response lost");
    expect(await counts("checkout_sessions")).toBe(1);
    await activatePurchase(event("evt_lost"), charged!);
    expect(await counts("purchases")).toBe(1);
    expect((await db.query("SELECT stripe_session_id FROM checkout_sessions")).rows).toEqual([{ stripe_session_id: "cs_lost" }]);
  });
  it("rolls back unissued or wrong-price webhooks without acknowledging the event", async () => {
    await expect(activatePurchase(event("evt_unissued"), paid("cs_unknown"))).rejects.toThrow("not issued");
    await expect(activatePurchase(event("evt_wrong_price"), { ...paid("cs_unknown"), amount_total: 1 })).rejects.toThrow("price");
    expect(await counts("stripe_events")).toBe(0);
    expect(await counts("purchases")).toBe(0);
  });
  it("preserves purchaser access on an email-only recovery request until the replacement link is claimed", async () => {
    const original = (await issued("cs_recovery"))!;
    await deliverClaimEmail();
    await requestClaimEmail(scanId, "BUYER@example.test");
    const row = (await db.query<{ token_ciphertext: string }>("SELECT token_ciphertext FROM report_email_outbox")).rows[0];
    const replacement = decryptClaimToken(row.token_ciphertext, key);
    expect(await getPaidReport(scanId, original)).toBeDefined();
    expect(await getPaidReport(scanId, replacement)).toBeUndefined();
    await deliverClaimEmail();
    await requestClaimEmail(scanId, "buyer@example.test");
    expect((await db.query("SELECT status FROM report_email_outbox")).rows).toEqual([{ status: "sent" }]);
    expect(await getPaidReport(scanId, original)).toBeDefined();
    expect(await verifyClaimToken(scanId, replacement)).toBe(true);
    expect(await getPaidReport(scanId, replacement)).toBeDefined();
    expect(await getPaidReport(scanId, original)).toBeUndefined();
  });
  it("expires unused recovery links while preserving current purchaser access", async () => {
    const token = (await issued("cs_expiry"))!;
    await deliverClaimEmail();
    await requestClaimEmail(scanId, "buyer@example.test");
    const ciphertext = (await db.query<{ token_ciphertext: string }>("SELECT token_ciphertext FROM report_email_outbox")).rows[0].token_ciphertext;
    await db.exec("UPDATE checkout_access_tokens SET pending_expires_at=now()-interval '1 second'");
    expect(await verifyClaimToken(scanId, decryptClaimToken(ciphertext, key))).toBe(false);
    expect(await getPaidReport(scanId, token)).toBeDefined();
    await requestClaimEmail(scanId, "attacker@example.test");
    expect(await getPaidReport(scanId, token)).toBeDefined();
  });
  it("revokes only the refunded purchase and cancels its claimed email job", async () => {
    const first = (await issued("cs_first"))!;
    const second = (await issued("cs_second"))!;
    const firstRescan = decryptClaimToken((await db.query<{ token_ciphertext: string }>("SELECT token_ciphertext FROM paid_url_access WHERE stripe_session_id='cs_first'")).rows[0].token_ciphertext, key);
    const secondRescan = decryptClaimToken((await db.query<{ token_ciphertext: string }>("SELECT token_ciphertext FROM paid_url_access WHERE stripe_session_id='cs_second'")).rows[0].token_ciphertext, key);
    await db.exec("UPDATE report_email_outbox SET status='sending',locked_at=now()-interval '3 minutes' WHERE stripe_session_id='cs_first'");
    await activateRefund(event("evt_refund"), { amount_refunded: 1200, payment_intent: "pi_cs_first" } as Stripe.Charge);
    await activateRefund(event("evt_refund"), { amount_refunded: 1200, payment_intent: "pi_cs_first" } as Stripe.Charge);
    expect(await getPaidReport(scanId, first)).toBeUndefined();
    expect(await getPaidReport(scanId, second)).toBeDefined();
    expect(await verifyPaidRescanToken(firstRescan)).toBeUndefined();
    expect(await verifyPaidRescanToken(secondRescan)).toBeDefined();
    expect((await db.query("SELECT status FROM report_email_outbox WHERE stripe_session_id='cs_first'")).rows).toEqual([{ status: "cancelled" }]);
    await deliverClaimEmail();
    expect(fetch).toHaveBeenCalledTimes(1);
    await activateRefund(event("evt_last_refund"), { amount_refunded: 1200, payment_intent: "pi_cs_second" } as Stripe.Charge);
    expect(await getPaidReport(scanId, second)).toBeUndefined();
    expect((await db.query("SELECT is_paid FROM scans")).rows).toEqual([{ is_paid: false }]);
  });
  it("allows another visitor to purchase the same cached URL after an earlier purchase", async () => {
    await issued("cs_existing_buyer");
    const checkout = (await makeCheckout(scanId)).session;
    expect(await activatePurchase(event("evt_new_buyer"), checkout)).toBe(true);
    expect(await counts("purchases")).toBe(2);
  });
  it("does not restart a paid prompt that is already complete", async () => {
    await db.query("INSERT INTO paid_prompt_jobs (scan_id,status,attempts) VALUES ($1,'complete',1)", [scanId]);
    await enqueuePaidPrompt(scanId);
    expect((await db.query("SELECT status,attempts FROM paid_prompt_jobs WHERE scan_id=$1", [scanId])).rows).toEqual([{ status: "complete", attempts: 1 }]);
  });
  it("does not release a free-model paid payload while its paid prompt is pending", async () => {
    const token = (await issued("cs_model_gate"))!;
    await db.query("UPDATE scans SET payload=jsonb_set(payload,'{paidPayload,paidModelReady}','false'::jsonb) WHERE id=$1", [scanId]);
    expect(await getPaidReport(scanId, token)).toBeUndefined();
    expect(await verifyClaimToken(scanId, token)).toBe(true);
    await db.query("UPDATE scans SET payload=jsonb_set(payload,'{paidPayload,paidModelReady}','true'::jsonb) WHERE id=$1", [scanId]);
    expect(await getPaidReport(scanId, token)).toBeDefined();
  });
  it("handles a refund delivered before its checkout completion webhook", async () => {
    await activateRefund(event("evt_early_refund"), { amount_refunded: 1200, payment_intent: "pi_cs_late" } as Stripe.Charge);
    await db.query("INSERT INTO checkout_sessions (stripe_session_id,scan_id,expires_at) VALUES ('cs_late',$1,now()+interval '1 hour')", [scanId]);
    expect(await activatePurchase(event("evt_cs_late"), paid("cs_late"))).toBe(false);
    expect(await counts("purchases")).toBe(1);
    expect(await counts("checkout_access_tokens")).toBe(0);
    expect(await counts("report_email_outbox")).toBe(0);
    expect((await db.query("SELECT is_paid FROM scans")).rows).toEqual([{ is_paid: false }]);
  });
  it("retries a failed delivery with the same provider idempotency key", async () => {
    await issued("cs_retry");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("temporary network failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await deliverClaimEmail();
    expect((await db.query("SELECT status FROM report_email_outbox")).rows).toEqual([{ status: "pending" }]);
    await db.exec("UPDATE report_email_outbox SET next_attempt_at=now()");
    await deliverClaimEmail();
    const calls = vi.mocked(fetch).mock.calls;
    expect((calls[0][1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe((calls[1][1]?.headers as Record<string, string>)["Idempotency-Key"]);
    expect((await db.query("SELECT status,token_ciphertext FROM report_email_outbox")).rows).toEqual([{ status: "sent", token_ciphertext: "" }]);
    log.mockRestore();
  });
});
