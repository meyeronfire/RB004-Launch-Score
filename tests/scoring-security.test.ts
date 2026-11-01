import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/page-snapshots.json";
import { deterministicFindings, summarizeLinkStatuses, isRobotsDisallowed } from "../lib/scanner";
import { CATEGORY_WEIGHTS, scoreFindings } from "../lib/score";
import { isPublicAddress, normalizePublicUrl, UnsafeTargetError } from "../lib/ssrf";
import { readBoundedBody } from "../lib/http";
import { publicScan } from "../lib/store";
import { decryptClaimToken, encryptClaimToken, validatePaidSession, verifyStripeEvent } from "../lib/payments";
import Stripe from "stripe";
import type StripeTypes from "stripe";
import { newDb } from "pg-mem";
import { readFile } from "node:fs/promises";

const cta = { visible: true, top: 300, height: 48, width: 160, text: "Get started" };
function makeInput(overrides: (typeof fixtures)[number]) {
  const page = { title: "A useful product for independent teams", h1: "Build a better first impression for your launch", description: "A clear product description for a first-time visitor.", viewport: "width=device-width, initial-scale=1", lang: "en", imageCount: 1, imageAltCount: 1, ctas: [cta], deadButtons: 0, placeholders: [], hasProof: true, hasPricing: true, hasFaq: true, hasContact: true, ...overrides.page };
  const mobile = { bodyWidth: 390, viewportWidth: 390, ctas: [cta], ...overrides.mobile };
  const links = { broken: [], checked: 0, unknownCount: 0, ...overrides.links };
  const input = { page, mobile, links, status: overrides.status ?? 200, protocol: overrides.protocol ?? "https:", ogImage: { state: "unknown" as const, note: "No OG image" }, ogImageTooSmall: false };
  return { input, coverage: overrides.coverage };
}

describe("scoring fixtures", () => {
  it("uses the six requested category weights totaling 100", () => {
    expect(CATEGORY_WEIGHTS).toEqual({ clarity: 25, conversion: 25, design_brand: 15, trust: 10, technical: 15, security: 10 });
    expect(Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });
  for (const fixture of fixtures) {
    it(`${fixture.id} stays within its reviewed score range`, () => {
      const { input, coverage } = makeInput(fixture);
      const findings = deterministicFindings(input);
      const { score } = scoreFindings(findings, coverage);
      expect(score).toBeGreaterThanOrEqual(fixture.expected[0]);
      expect(score).toBeLessThanOrEqual(fixture.expected[1]);
    });
  }
  it("limits category scores when only a partial set of checks is available", () => {
    const scored = scoreFindings([], { clarity: 0.6, conversion: 0.85, trust: 0.75, technical: 0.9 });
    expect(scored.categoryScores).toEqual({ clarity: 80, conversion: 93, design_brand: 78, trust: 88, technical: 95, security: 78 });
    expect(scored.score).toBeLessThan(100);
  });
});

describe("public-target safety", () => {
  it("allows ordinary global IPs and blocks private, reserved, and transition IPs", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "2001:4860:4860::8888"]) expect(isPublicAddress(ip)).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "fc00::1", "::ffff:127.0.0.1", "2001:db8::1", "2001::1", "2002::1", "2001:20::1"]) expect(isPublicAddress(ip)).toBe(false);
  });
  it("rejects local hosts, credential URLs, and non-standard ports", () => {
    for (const url of ["http://localhost", "http://127.0.0.1", "https://user:pass@example.com", "https://example.com:8443", "ftp://example.com"]) expect(() => normalizePublicUrl(url)).toThrow(UnsafeTargetError);
    expect(normalizePublicUrl("https://example.com/path#fragment").toString()).toBe("https://example.com/path");
  });
  it("honors user-agent groups, wildcard/end patterns, and longest allow rules", () => {
    const rules = "User-agent: *\nDisallow: /\nAllow: /public/\nUser-agent: RB004-Launch-Score\nDisallow: /private/\nAllow: /private/share/\nDisallow: /*.pdf$";
    expect(isRobotsDisallowed(rules, "/public/launch")).toBe(false);
    expect(isRobotsDisallowed(rules, "/private/billing")).toBe(true);
    expect(isRobotsDisallowed(rules, "/private/share/card")).toBe(false);
    expect(isRobotsDisallowed(rules, "/public/guide.pdf")).toBe(true);
  });
});

describe("bounded requests and link checks", () => {
  it("rejects a request body over the configured byte limit before parsing it", async () => {
    const request = new Request("https://app.test/api/scans", { method: "POST", body: JSON.stringify({ url: `https://${"a".repeat(5000)}.test` }) });
    expect((await readBoundedBody(request, 4096)).error).toBe("too_large");
  });
  it("keeps healthy, broken, and unavailable link results distinct", () => {
    expect(summarizeLinkStatuses([200, 304, 404, undefined])).toEqual({ checked: 3, brokenCount: 1, unknownCount: 1 });
    // A 200 response remains healthy even when its body is intentionally not downloaded.
    expect(summarizeLinkStatuses([200])).toEqual({ checked: 1, brokenCount: 0, unknownCount: 0 });
  });
});

describe("free and paid report boundaries", () => {
  const report = {
    id: "abcdefab-cdef-4abc-8def-abcdefabcdef", url: "https://example.test/", status: "complete" as const, phase: "ready", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), score: 75,
    findings: Array.from({ length: 5 }, (_, index) => ({ id: `finding-${index}`, category: "trust" as const, severity: "low" as const, title: `Finding ${index}`, why_it_matters: "A reason.", evidence: "private evidence", fix: "private fix" })),
    paid: false, leaseToken: "private-lease", leadEmail: "private@example.test", paidPayload: { available: true, prompts: { Cursor: "private prompt" }, findings: [], copyDrafts: { status: "private", headlines: [], subheadline: "", cta: "", faq: "", metaTitle: "", metaDescription: "" } },
  };
  it("projects all finding summaries with no evidence, fixes, email, or paid payload", () => {
    const projection = publicScan(report) as Record<string, unknown>;
    const findings = projection.findings as Array<Record<string, unknown>>;
    expect(findings).toHaveLength(5);
    expect(findings[0]).toMatchObject({ title: "Finding 0", why_it_matters: "A reason." });
    expect(findings[0].section).toBe("other");
    expect(findings[0]).not.toHaveProperty("fix"); expect(findings[0]).not.toHaveProperty("evidence");
    expect(projection.lockedCount).toBe(2); expect(projection.lockedTitles).toEqual([]);
    expect(projection.paidAvailable).toBe(true);
    expect(projection.checkoutAvailable).toBe(false);
    expect(JSON.stringify(projection)).not.toContain("private prompt"); expect(JSON.stringify(projection)).not.toContain("private@example.test");
    expect(projection).not.toHaveProperty("leaseToken");
    expect(JSON.stringify(publicScan({ ...report, paid: true }))).not.toContain("private fix");
  });
  it("accepts only the fixed paid Checkout session details", () => {
    const valid = { metadata: { scanId: report.id, releaseCode: "RB004", oneTime: "true" }, client_reference_id: report.id, mode: "payment", payment_method_types: ["card"], currency: "usd", amount_total: 1200, payment_status: "paid" } as unknown as StripeTypes.Checkout.Session;
    expect(validatePaidSession(valid, report.id)).toBe(true);
    expect(validatePaidSession({ ...valid, amount_total: 1199 }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, currency: "eur" }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, payment_status: "unpaid" }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, mode: "subscription" }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, metadata: { scanId: report.id, releaseCode: "RB004", oneTime: "false" } }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, payment_method_types: ["card", "link"] }, report.id)).toBe(false);
    expect(validatePaidSession({ ...valid, client_reference_id: "other" }, report.id)).toBe(false);
  });
  it("verifies Stripe webhook signatures and rejects a modified payload", () => {
    const stripe = new Stripe("sk_test_local_signature_only"); const secret = "whsec_test_local_signature_only";
    const payload = JSON.stringify({ id: "evt_test", object: "event", api_version: null, created: 1, data: { object: {} }, livemode: false, pending_webhooks: 0, request: null, type: "checkout.session.completed" });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) });
    expect(verifyStripeEvent(stripe, payload, signature, secret).id).toBe("evt_test");
    expect(() => verifyStripeEvent(stripe, `${payload} `, signature, secret)).toThrow();
  });
  it("encrypts purchaser claim tokens for the retryable outbox and detects tampering", () => {
    const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
    const token = "only-generated-after-verified-payment";
    const ciphertext = encryptClaimToken(token, key);
    expect(ciphertext).not.toContain(token);
    expect(decryptClaimToken(ciphertext, key)).toBe(token);
    const tampered = Buffer.from(ciphertext, "base64url");
    tampered[28] ^= 1;
    expect(() => decryptClaimToken(tampered.toString("base64url"), key)).toThrow();
  });
  it("allows durable paid-access token rows and enforces duplicate webhook event idempotency in SQL", async () => {
    const migration = await readFile("db/migrations/001_initial.sql", "utf8");
    const accessTable = migration.match(/CREATE TABLE IF NOT EXISTS checkout_access_tokens \(([\s\S]*?)\);/);
    const eventsTable = migration.match(/CREATE TABLE IF NOT EXISTS stripe_events \(([\s\S]*?)\);/);
    expect(accessTable?.[1]).toContain("expires_at timestamptz,");
    expect(accessTable?.[1]).not.toMatch(/expires_at[^,\n]*NOT NULL/i);
    expect(eventsTable?.[1]).toContain("event_id text PRIMARY KEY");
    expect(migration).toContain("lease_token text");
    expect(migration).toContain("lease_expires_at timestamptz");
    expect(migration).toContain("revoked_at timestamptz");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS report_email_outbox");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS checkout_reservations");
    const db = newDb(); db.public.none("CREATE TABLE scans (id text PRIMARY KEY)");
    db.public.none(`CREATE TABLE checkout_access_tokens (${accessTable?.[1]})`);
    db.public.none(`CREATE TABLE stripe_events (${eventsTable?.[1]})`);
    db.public.none("INSERT INTO scans (id) VALUES ('scan-1')");
    db.public.none("INSERT INTO checkout_access_tokens (token_hash,scan_id,stripe_session_id,expires_at) VALUES ('hash','scan-1','cs_1',NULL)");
    expect(db.public.one("SELECT expires_at FROM checkout_access_tokens WHERE token_hash='hash'").expires_at).toBeNull();
    expect(db.public.many("INSERT INTO stripe_events (event_id) VALUES ('evt_1') ON CONFLICT DO NOTHING RETURNING event_id")).toHaveLength(1);
    expect(db.public.many("INSERT INTO stripe_events (event_id) VALUES ('evt_1') ON CONFLICT DO NOTHING RETURNING event_id")).toHaveLength(0);
  });
  it("keeps free access, cost telemetry, paid rescans, and prompt jobs server-only", async () => {
    const migration = await readFile("db/migrations/002_free_tier_costs.sql", "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS free_scan_entitlements");
    expect(migration).toContain("scans_used integer NOT NULL DEFAULT 1 CHECK (scans_used BETWEEN 0 AND 3)");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS scan_costs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS paid_prompt_costs");
    expect(migration).toContain("ALTER TABLE scans ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE purchases ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS paid_url_access");
    expect(migration).toContain("expires_at timestamptz NOT NULL");
    expect(migration).toContain("ALTER TABLE free_waitlist ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE scan_costs ENABLE ROW LEVEL SECURITY");
  });
});
