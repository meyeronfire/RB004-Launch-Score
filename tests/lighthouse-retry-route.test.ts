import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LighthouseStrategy, ScanRecord } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  claimScopedCooldown: vi.fn(),
  psiMetrics: vi.fn(),
  readScan: vi.fn(),
  updateScan: vi.fn(),
  publicScan: vi.fn(),
  scoreLighthouseAudit: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, claimScopedCooldown: mocks.claimScopedCooldown }));
vi.mock("@/lib/scanner", () => ({ psiMetrics: mocks.psiMetrics }));
vi.mock("@/lib/store", () => ({ readScan: mocks.readScan, updateScan: mocks.updateScan, publicScan: mocks.publicScan }));
vi.mock("@/lib/lighthouse-scoring", () => ({ scoreLighthouseAudit: mocks.scoreLighthouseAudit }));

import { POST } from "@/app/api/scans/[id]/lighthouse/route";

const scanId = "db87a257-8356-41ad-94e0-6d8df80f00c9";
const metric = (value: number) => ({ state: "checked" as const, value });
const strategy = (score: number): LighthouseStrategy => ({
  performance: metric(score), accessibility: metric(score), bestPractices: metric(score), seo: metric(score),
  lcp: metric(1800), cls: metric(0.02), inpTbt: metric(120),
});

let persisted: ScanRecord;

beforeEach(() => {
  vi.clearAllMocks();
  persisted = { id: scanId, url: "https://example.com/", status: "complete", leaseToken: "lease-existing", findings: [], checks: {}, score: 80, lighthouse: { mobile: strategy(71), desktop: strategy(74), source: "via Google PageSpeed Insights" } } as unknown as ScanRecord;
  mocks.rateLimit.mockResolvedValue({ allowed: true, misconfigured: false });
  mocks.claimScopedCooldown.mockResolvedValue(true);
  mocks.readScan.mockImplementation(async () => persisted);
  mocks.psiMetrics.mockImplementation(async (_url: string, device: "mobile" | "desktop") => strategy(device === "mobile" ? 88 : 91));
  mocks.scoreLighthouseAudit.mockReturnValue({ score: 87, categoryScores: { seo_aeo: 87 }, categoryCoverage: {}, scoreBreakdown: {} });
  mocks.updateScan.mockImplementation(async (_id: string, update: (scan: ScanRecord) => ScanRecord, expectedLease?: string) => {
    if (expectedLease !== persisted.leaseToken) throw new Error("Scan lease changed before this worker could save results.");
    persisted = update(persisted);
    return persisted;
  });
  mocks.publicScan.mockImplementation((scan: ScanRecord) => ({ id: scan.id, status: scan.status, lighthouse: scan.lighthouse, score: scan.score }));
});

describe("Lighthouse retry route", () => {
  it.each([["mobile", 88, 74], ["desktop", 91, 71]] as const)("refreshes only the requested %s strategy and keeps the other strategy", async (selected, freshScore, existingOtherScore) => {
    const request = new Request(`https://rb004.vercel.app/api/scans/${scanId}/lighthouse`, {
      method: "POST", headers: { origin: "https://rb004.vercel.app", "content-type": "application/json" }, body: JSON.stringify({ strategy: selected }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: scanId }) });
    const other = selected === "mobile" ? "desktop" : "mobile";

    expect(response.status).toBe(200);
    expect(mocks.psiMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.psiMetrics).toHaveBeenCalledWith("https://example.com/", selected);
    expect(mocks.updateScan).toHaveBeenCalledWith(scanId, expect.any(Function), "lease-existing");
    expect(persisted.lighthouse?.[selected].seo).toEqual(metric(freshScore));
    expect(persisted.lighthouse?.[other].performance).toEqual(metric(existingOtherScore));
    const body = await response.json();
    expect(body.report.lighthouse[selected].seo).toEqual(metric(freshScore));
    expect(JSON.stringify(body)).not.toContain("lease-existing");
  });
});
