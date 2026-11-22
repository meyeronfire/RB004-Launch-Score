import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScan: vi.fn(),
  findCachedScan: vi.fn(),
  hasLiveWorker: vi.fn(),
  verifyPaidRescanToken: vi.fn(),
  consumePaidRescan: vi.fn(),
  releasePaidRescan: vi.fn(),
}));

vi.mock("@/lib/scanner", () => ({ createScan: mocks.createScan, ScanAdmissionError: class ScanAdmissionError extends Error {} }));
vi.mock("@/lib/store", () => ({ findCachedScan: mocks.findCachedScan, hasLiveWorker: mocks.hasLiveWorker, database: () => undefined }));
vi.mock("@/lib/payments", () => ({
  ACCESS_COOKIE: "rb004_access_",
  verifyPaidRescanToken: mocks.verifyPaidRescanToken,
  consumePaidRescan: mocks.consumePaidRescan,
  releasePaidRescan: mocks.releasePaidRescan,
}));

import { POST } from "@/app/api/scans/route";

const SECRET = "outreach-admin-key";

function scan(ip: string, headers: Record<string, string>, url = "https://example.org/") {
  return new Request("https://rb004.vercel.app/api/scans", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "x-forwarded-for": ip, ...headers },
    body: JSON.stringify({ url }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createScan.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", status: "queued" });
  mocks.findCachedScan.mockResolvedValue(undefined);
  mocks.hasLiveWorker.mockResolvedValue(true);
  mocks.verifyPaidRescanToken.mockResolvedValue(undefined);
  mocks.consumePaidRescan.mockResolvedValue(undefined);
  delete process.env.RB004_OWNER_SCAN_HOSTS;
  delete process.env.SCAN_ADMIN_KEY;
});

afterEach(() => { delete process.env.SCAN_ADMIN_KEY; delete process.env.RB004_OWNER_SCAN_HOSTS; });

describe("anonymous scan limits", () => {
  it("rejects raw non-browser user agents before spending an hourly slot", async () => {
    const blocked = await POST(scan("203.0.113.10", { "user-agent": "curl/8.1" }));
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "Automated scan requests are not accepted." });
    expect(mocks.createScan).not.toHaveBeenCalled();

    for (let count = 0; count < 5; count += 1) expect((await POST(scan("203.0.113.10", {}))).status).toBe(202);
    expect((await POST(scan("203.0.113.10", {}))).status).toBe(429);
  });

  it("allows five browser requests an hour and blocks the sixth for the same address", async () => {
    for (let count = 0; count < 5; count += 1) expect((await POST(scan("203.0.113.20", {}))).status).toBe(202);
    const blocked = await POST(scan("203.0.113.20", {}));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "That’s five scan requests in the past hour. Please try again later." });
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect(mocks.createScan).toHaveBeenCalledTimes(5);
    expect(mocks.createScan).toHaveBeenLastCalledWith("https://example.org/", expect.objectContaining({
      paid: false,
      freeAdmission: expect.objectContaining({ skipIdentityLimits: false }),
    }));
  });
});

describe("scan admin bypass", () => {
  it("skips the user-agent block, hourly cap, and device/IP free-scan cap when the key matches", async () => {
    process.env.SCAN_ADMIN_KEY = SECRET;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    for (let count = 0; count < 5; count += 1) expect((await POST(scan("203.0.113.30", {}))).status).toBe(202);

    const response = await POST(scan("203.0.113.30", { "user-agent": "curl/8.1", "x-admin-key": SECRET }, "https://prospect.example/"));
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ id: "22222222-2222-4222-8222-222222222222", status: "queued", remaining: null });
    expect(JSON.stringify({ body, headers: [...response.headers] })).not.toContain(SECRET);
    expect(mocks.createScan).toHaveBeenLastCalledWith("https://prospect.example/", expect.objectContaining({
      paid: false,
      freeAdmission: expect.objectContaining({ skipIdentityLimits: true, sessionToken: undefined }),
    }));
    expect((await POST(scan("203.0.113.30", {}))).status).toBe(429);

    for (const call of [...error.mock.calls, ...log.mock.calls]) expect(JSON.stringify(call)).not.toContain(SECRET);
    error.mockRestore();
    log.mockRestore();
  });

  it("does not let an admin request consume the visitor hourly allowance", async () => {
    process.env.SCAN_ADMIN_KEY = SECRET;
    expect((await POST(scan("203.0.113.31", { "user-agent": "curl/8.1", "x-admin-key": SECRET }))).status).toBe(202);
    for (let count = 0; count < 5; count += 1) expect((await POST(scan("203.0.113.31", {}))).status).toBe(202);
    expect((await POST(scan("203.0.113.31", {}))).status).toBe(429);
  });

  it("keeps every limit when the key is wrong or the env var is blank", async () => {
    process.env.SCAN_ADMIN_KEY = SECRET;
    const wrong = await POST(scan("203.0.113.40", { "user-agent": "curl/8.1", "x-admin-key": "not-the-key" }));
    expect(wrong.status).toBe(403);
    expect(JSON.stringify(await wrong.json())).not.toContain(SECRET);
    expect(mocks.createScan).not.toHaveBeenCalled();

    delete process.env.SCAN_ADMIN_KEY;
    expect((await POST(scan("203.0.113.41", { "user-agent": "curl/8.1", "x-admin-key": SECRET }))).status).toBe(403);
    process.env.SCAN_ADMIN_KEY = " ";
    expect((await POST(scan("203.0.113.42", { "user-agent": "curl/8.1", "x-admin-key": " " }))).status).toBe(403);
    expect(mocks.createScan).not.toHaveBeenCalled();
  });

  it("still starts a normal unpaid scan and leaves a paid re-scan on the paid path", async () => {
    process.env.SCAN_ADMIN_KEY = SECRET;
    const expiresAt = "2026-11-16T12:00:00.000Z";
    mocks.verifyPaidRescanToken.mockResolvedValue({ scan_id: "original-scan", normalized_url: "https://example.org/", expires_at: new Date(expiresAt), rescans_used: 0, rescansRemaining: 2 });
    mocks.consumePaidRescan.mockResolvedValue({ scan_id: "original-scan", normalized_url: "https://example.org/", expires_at: new Date(expiresAt), rescans_used: 1, rescansRemaining: 1, entitlementTokenHash: "paid-hash", stripe_session_id: "cs_test" });
    mocks.findCachedScan.mockResolvedValue({ id: "recent-cached-scan", status: "complete" });

    const response = await POST(scan("203.0.113.50", { "x-admin-key": SECRET, cookie: "rb004_paid_rescan=paid-rescan-token" }));
    expect(response.status).toBe(202);
    expect(mocks.findCachedScan).not.toHaveBeenCalled();
    expect(mocks.consumePaidRescan).toHaveBeenCalledWith("paid-rescan-token", "https://example.org/");
    expect(mocks.createScan).toHaveBeenCalledWith("https://example.org/", expect.objectContaining({
      paid: true,
      paidRescanExpiresAt: expiresAt,
      freeAdmission: undefined,
    }));
    expect(response.headers.get("set-cookie")).toContain("rb004_access_22222222-2222-4222-8222-222222222222=paid-rescan-token");
    expect(response.headers.get("set-cookie")).not.toContain(SECRET);
  });
});
