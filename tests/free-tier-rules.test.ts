import { afterEach, describe, expect, it, vi } from "vitest";
import { emailClaimDecision, freeBudgetDecision, freeScanDecision, paidRescanActive } from "../lib/free-tier-rules";
import { clientIpHash, isObviousBot, rateLimit, scanRequestAllowance } from "../lib/rate-limit";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("free scan limits", () => {
  it("allows one anonymous scan, then requires email verification", () => {
    expect(freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: null })).toEqual({ allowed: true, remaining: 1, requiresEmail: false });
    expect(freeScanDecision({ hasAnonymousUse: true, authenticatedEmailScans: null })).toEqual({ allowed: false, remaining: 0, requiresEmail: true });
  });

  it("caps verified emails at three lifetime scans", () => {
    expect(freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: 1 })).toEqual({ allowed: true, remaining: 2, requiresEmail: false });
    expect(freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: 2 })).toEqual({ allowed: true, remaining: 1, requiresEmail: false });
    expect(freeScanDecision({ hasAnonymousUse: false, authenticatedEmailScans: 3 })).toEqual({ allowed: false, remaining: 0, requiresEmail: false });
  });

  it("counts a newly attached anonymous scan against an existing email lifetime cap", () => {
    expect(emailClaimDecision(2, null, "email-hash")).toEqual({ allowed: true, attach: true, scansUsed: 3 });
    expect(emailClaimDecision(3, null, "email-hash").allowed).toBe(false);
    expect(emailClaimDecision(2, "email-hash", "email-hash")).toEqual({ allowed: true, attach: false, scansUsed: 2 });
    expect(emailClaimDecision(null, null, "email-hash")).toEqual({ allowed: true, attach: true, scansUsed: 1 });
  });

  it("pauses free reservations at the daily budget boundary", () => {
    expect(freeBudgetDecision(4.94, 0.05, 5).allowed).toBe(true);
    expect(freeBudgetDecision(4.96, 0.05, 5).allowed).toBe(false);
    expect(freeBudgetDecision(0, 0.05, 0).allowed).toBe(false);
  });

  it("expires paid URL re-scan access after seven days", () => {
    const now = 1_000_000;
    expect(paidRescanActive(now + 1, now)).toBe(true);
    expect(paidRescanActive(now, now)).toBe(false);
  });

  it("allows five hourly scan requests and blocks the sixth", () => {
    expect(scanRequestAllowance(5)).toEqual({ allowed: true, remaining: 0 });
    expect(scanRequestAllowance(6)).toEqual({ allowed: false, remaining: 0 });
  });

  it("resets the actual per-IP limiter after one hour", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const request = () => new Request("http://localhost/api/scans", { headers: { "x-forwarded-for": "203.0.113.77" } });
    for (let count = 0; count < 5; count++) expect((await rateLimit(request())).allowed).toBe(true);
    expect((await rateLimit(request())).allowed).toBe(false);
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect((await rateLimit(request())).allowed).toBe(true);
  });

  it("uses the rightmost forwarded address behind Vercel", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("RATE_LIMIT_SALT", "stable-test-salt");
    const first = clientIpHash(new Request("https://example.test", { headers: { "x-forwarded-for": "spoofed, 198.51.100.7" } }));
    const second = clientIpHash(new Request("https://example.test", { headers: { "x-forwarded-for": "different, 198.51.100.7" } }));
    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });

  it("fails closed in production when the IP-hash salt is missing", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("RATE_LIMIT_SALT", "");
    expect(clientIpHash(new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.7" } }))).toBeUndefined();
  });

  it("blocks obvious automation without treating normal browser agents as bots", () => {
    expect(isObviousBot("curl/8.1" )).toBe(true);
    expect(isObviousBot("Mozilla/5.0 Chrome/140 Safari/537.36")).toBe(false);
    expect(isObviousBot(null)).toBe(true);
  });
});
