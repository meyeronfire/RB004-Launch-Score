import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "../config/release";
import { trackPurchased } from "../lib/analytics-server";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("optional server purchase analytics", () => {
  it("makes no external request when the analytics domain is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "");
    await trackPurchased();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the fixed provider endpoint without purchaser information", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "launch.example.test");
    await trackPurchased();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://plausible.io/api/event");
    expect(JSON.parse(options?.body as string)).toEqual({ name: "purchased", domain: "launch.example.test", url: SITE_URL });
    expect(options?.headers).toEqual({ "content-type": "application/json", "user-agent": "RB004-Launch-Score-Server/1.0" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("contains network failures so analytics cannot fail a verified payment", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "launch.example.test");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("analytics unavailable"));
    await expect(trackPurchased()).resolves.toBeUndefined();
  });
});
