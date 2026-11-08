import { afterEach, describe, expect, it } from "vitest";
import { isOwnerScanRedirectAllowed, isOwnerScanTarget } from "../lib/owner-scan-access";

afterEach(() => { delete process.env.RB004_OWNER_SCAN_HOSTS; });

describe("owner scan hosts", () => {
  it("allows only exact configured hosts", () => {
    process.env.RB004_OWNER_SCAN_HOSTS = "regularbasis.studio, rb004.vercel.app";
    expect(isOwnerScanTarget(new URL("https://regularbasis.studio/"))).toBe(true);
    expect(isOwnerScanTarget(new URL("https://shop.regularbasis.studio/"))).toBe(false);
    expect(isOwnerScanTarget(new URL("https://rb004.vercel.app/"))).toBe(true);
    expect(isOwnerScanTarget(new URL("https://store.rb004.vercel.app/"))).toBe(false);
    expect(isOwnerScanTarget(new URL("https://notregularbasis.studio/"))).toBe(false);
    expect(isOwnerScanTarget(new URL("https://rb004.vercel.app.example.org/"))).toBe(false);
  });

  it("keeps allowlisted scans on allowlisted redirect hosts without changing other scans", () => {
    process.env.RB004_OWNER_SCAN_HOSTS = "regularbasis.studio, rb004.vercel.app";
    expect(isOwnerScanRedirectAllowed(new URL("https://rb004.vercel.app/"), new URL("https://rb004.vercel.app/report"))).toBe(true);
    expect(isOwnerScanRedirectAllowed(new URL("https://rb004.vercel.app/"), new URL("https://store.rb004.vercel.app/"))).toBe(false);
    expect(isOwnerScanRedirectAllowed(new URL("https://rb004.vercel.app/"), new URL("https://example.org/"))).toBe(false);
    expect(isOwnerScanRedirectAllowed(new URL("https://example.org/"), new URL("https://other.example/"))).toBe(true);
  });

  it("does not accept non-HTTP schemes", () => {
    process.env.RB004_OWNER_SCAN_HOSTS = "regularbasis.studio";
    expect(isOwnerScanTarget(new URL("javascript://regularbasis.studio/"))).toBe(false);
  });
});
