import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientIpHash: vi.fn(),
  isObviousBot: vi.fn(),
  rateLimit: vi.fn(),
  createScan: vi.fn(),
  findCachedScan: vi.fn(),
  grantPaidCacheAccess: vi.fn(),
  hasLiveWorker: vi.fn(),
  cookieValue: vi.fn(),
  deviceHash: vi.fn(),
  freeStatus: vi.fn(),
  newOpaqueToken: vi.fn(),
  verifyPaidRescanToken: vi.fn(),
  enqueuePaidPrompt: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ clientIpHash: mocks.clientIpHash, isObviousBot: mocks.isObviousBot, rateLimit: mocks.rateLimit }));
vi.mock("@/lib/scanner", () => ({ createScan: mocks.createScan, ScanAdmissionError: class ScanAdmissionError extends Error {} }));
vi.mock("@/lib/ssrf", () => ({ normalizePublicUrl: (value: string) => new URL(value), UnsafeTargetError: class UnsafeTargetError extends Error {} }));
vi.mock("@/lib/store", () => ({ findCachedScan: mocks.findCachedScan, grantPaidCacheAccess: mocks.grantPaidCacheAccess, hasLiveWorker: mocks.hasLiveWorker }));
vi.mock("@/lib/free-tier", () => ({ cookieValue: mocks.cookieValue, DEVICE_COOKIE: "rb004_device", deviceHash: mocks.deviceHash, FREE_SESSION_COOKIE: "rb004_free_session", newOpaqueToken: mocks.newOpaqueToken, freeStatus: mocks.freeStatus, PAID_RESCAN_COOKIE: "rb004_paid_rescan" }));
vi.mock("@/lib/payments", () => ({ ACCESS_COOKIE: "rb004_access_", verifyPaidRescanToken: mocks.verifyPaidRescanToken }));
vi.mock("@/lib/paid-prompt", () => ({ enqueuePaidPrompt: mocks.enqueuePaidPrompt }));

import { POST } from "@/app/api/scans/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientIpHash.mockReturnValue("ip-hash");
  mocks.isObviousBot.mockReturnValue(false);
  mocks.rateLimit.mockResolvedValue({ allowed: true, misconfigured: false });
  mocks.createScan.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", status: "queued" });
  mocks.findCachedScan.mockResolvedValue(undefined);
  mocks.hasLiveWorker.mockResolvedValue(true);
  mocks.cookieValue.mockReturnValue("");
  mocks.deviceHash.mockReturnValue("device-hash");
  mocks.newOpaqueToken.mockReturnValue("device-token-123456789012345678901234");
  mocks.verifyPaidRescanToken.mockResolvedValue(undefined);
  process.env.RB004_OWNER_SCAN_HOSTS = "rb004.vercel.app";
});

afterEach(() => { delete process.env.RB004_OWNER_SCAN_HOSTS; });

describe("configured free-scan hosts", () => {
  it("bypasses the free quota without granting a paid report", async () => {
    const response = await POST(new Request("https://rb004.vercel.app/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify({ url: "https://rb004.vercel.app/" }),
    }));

    expect(response.status).toBe(202);
    expect(mocks.createScan).toHaveBeenCalledWith("https://rb004.vercel.app/", {
      paid: false,
      paidRescanExpiresAt: undefined,
      freeAdmission: { device: "device-hash", ip: "ip-hash", skipIdentityLimits: true },
    });
    expect(mocks.freeStatus).not.toHaveBeenCalled();
  });

  it("retains the hourly abuse limit for free-scan hosts", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, misconfigured: false });
    const response = await POST(new Request("https://rb004.vercel.app/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify({ url: "https://rb004.vercel.app/" }),
    }));

    expect(response.status).toBe(429);
    expect(mocks.createScan).not.toHaveBeenCalled();
  });
});
