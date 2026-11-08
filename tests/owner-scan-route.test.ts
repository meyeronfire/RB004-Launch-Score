import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientIpHash: vi.fn(),
  freeBudgetStatus: vi.fn(),
  freeStatus: vi.fn(),
  verifyPaidRescanToken: vi.fn(),
  newOpaqueToken: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ clientIpHash: mocks.clientIpHash, rateLimit: vi.fn() }));
vi.mock("@/lib/free-tier", () => ({
  addFreeWaitlist: vi.fn(),
  cookieValue: () => "",
  deviceHash: () => "device-hash",
  DEVICE_COOKIE: "rb004_device",
  freeBudgetStatus: mocks.freeBudgetStatus,
  freeStatus: mocks.freeStatus,
  FREE_SESSION_COOKIE: "rb004_free_session",
  newOpaqueToken: mocks.newOpaqueToken,
  PAID_RESCAN_COOKIE: "rb004_paid_rescan",
  requestFreeMagicLink: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({ verifyPaidRescanToken: mocks.verifyPaidRescanToken }));

import { GET } from "@/app/api/free-access/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clientIpHash.mockReturnValue("ip-hash");
  mocks.freeStatus.mockResolvedValue({ allowed: false, remaining: 0, requiresEmail: true, authenticated: false });
  mocks.freeBudgetStatus.mockResolvedValue({ paused: false });
  mocks.verifyPaidRescanToken.mockResolvedValue(undefined);
  mocks.newOpaqueToken.mockReturnValue("device-token-123456789012345678901234");
  process.env.RB004_OWNER_SCAN_HOSTS = "rb004.vercel.app";
});

afterEach(() => { delete process.env.RB004_OWNER_SCAN_HOSTS; });

describe("owner target access status", () => {
  it("hides the free-tier gate for a configured owner target", async () => {
    const response = await GET(new Request("https://rb004.vercel.app/api/free-access?url=https%3A%2F%2Frb004.vercel.app%2F"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowed: true, remaining: null, requiresEmail: false, budgetPaused: false, hostAccess: true });
  });

  it("keeps the free-tier gate for other targets", async () => {
    mocks.freeBudgetStatus.mockResolvedValue({ paused: true });
    const response = await GET(new Request("https://rb004.vercel.app/api/free-access?url=https%3A%2F%2Fexample.org%2F"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ allowed: false, remaining: 0, requiresEmail: true, budgetPaused: true, hostAccess: false });
  });

  it("keeps configured hosts paused when the shared cost budget is exhausted", async () => {
    mocks.freeBudgetStatus.mockResolvedValue({ paused: true });
    const response = await GET(new Request("https://rb004.vercel.app/api/free-access?url=https%3A%2F%2Frb004.vercel.app%2F"));
    expect(await response.json()).toMatchObject({ allowed: false, remaining: 0, requiresEmail: false, budgetPaused: true, hostAccess: true });
  });
});
