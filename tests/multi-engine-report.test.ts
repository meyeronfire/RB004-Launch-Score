import { afterEach, expect, it, vi } from "vitest";
import type { ScanRecord } from "../lib/types";
import type { SafeResponse } from "../lib/ssrf";

const state = vi.hoisted(() => ({ report: undefined as ScanRecord | undefined }));
vi.mock("../lib/store", () => ({
  readScan: async () => state.report,
  updateScan: async (_id: string, update: (record: ScanRecord) => ScanRecord) => {
    if (state.report) state.report = update(state.report);
    return state.report;
  },
  saveScan: async (record: ScanRecord) => { state.report = record; },
  findCachedScan: async () => undefined,
  failScanAndReleasePaidRescan: async (_id: string, update: (record: ScanRecord) => ScanRecord) => {
    if (state.report) state.report = update(state.report);
  },
}));
vi.mock("../lib/free-tier", () => ({
  settleScanCost: async () => 0,
  releaseFreeScanReservation: async () => undefined,
  reserveFreeScan: async () => undefined,
}));
vi.mock("../lib/ssrf", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/ssrf")>();
  return {
    ...original,
    safeFetch: async (input: string): Promise<SafeResponse> => {
      const url = new URL(input);
      const path = url.pathname;
      const pages: Record<string, { status: number; text: string; type: string }> = {
        "/": {
          status: 200, type: "text/html", text: `<!doctype html><html lang="en"><head>
          <title>A launch preview for a tiny fixture</title><meta name="viewport" content="width=device-width">
          <style>body { color: black; background: white }</style></head><body><main>
          <h1>Plan your next release</h1><a href="/signup">Start signup</a>
          <a href="/account">My account</a><button id="empty-control"></button>
          <p id="duplicate">Part one</p><p id="duplicate">Part two</p>
          <script src="/missing-script.js"></script></main></body></html>`,
        },
        "/robots.txt": { status: 200, type: "text/plain", text: "User-agent: *\nAllow: /" },
        "/signup": { status: 404, type: "text/html", text: "<h1>Missing</h1>" },
        "/account": { status: 403, type: "text/html", text: "<h1>Restricted</h1>" },
      };
      const response = pages[path] ?? { status: 404, type: "text/plain", text: "" };
      return { status: response.status, headers: { "content-type": response.type }, body: Buffer.from(response.text), finalUrl: url.href, redirects: [] };
    },
  };
});

import { processScan } from "../lib/scanner";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("saves a real rendered base report with optional engines disabled or enabled", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAGESPEED_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  const testsHaveNu = Boolean(process.env.SCAN_NU_JAR);
  const originalJar = process.env.SCAN_NU_JAR;
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  async function scan(enable: boolean) {
    vi.stubEnv("SCAN_AXE_ENABLED", enable ? "1" : "0");
    vi.stubEnv("SCAN_NU_JAR", enable ? originalJar : "");
    const now = new Date().toISOString();
    state.report = { id: "e25859f0-61ef-4b3f-8303-abf22b2ef3cb", url: "https://app.example/", status: "queued", phase: "Queued", createdAt: now, updatedAt: now };
    await processScan(state.report.id);
    expect(state.report?.status, state.report?.error).toBe("complete");
    return state.report!;
  }

  const base = await scan(false);
  const upgraded = await scan(true);
  expect(base.findings?.some((finding) => finding.sources?.some(({ ruleId }) => ruleId === "button-name"))).toBe(false);
  expect(upgraded.findings?.some((finding) => finding.sources?.some(({ ruleId }) => ruleId === "button-name"))).toBe(true);
  expect(upgraded.findings?.filter((finding) => finding.affectedUrl?.endsWith("/signup"))).toHaveLength(1);
  expect(upgraded.findings?.some((finding) => finding.affectedUrl?.endsWith("/account"))).toBe(false);
  expect(upgraded.findings?.some((finding) => finding.title === "A page script resource returned not found")).toBe(true);
  expect(upgraded.engines).toHaveLength(8);
  expect(upgraded.engines?.find(({ id }) => id === "performance")?.status).toBe("unavailable");
  expect(upgraded.scoringVersion).toBe(5);
  expect(new Set(upgraded.findings?.flatMap(({ fingerprint }) => fingerprint ? [fingerprint] : [])).size)
    .toBe(upgraded.findings?.filter(({ fingerprint }) => fingerprint).length);
  if (testsHaveNu) expect(upgraded.findings?.some((finding) => finding.sources?.some(({ ruleId }) => ruleId === "duplicate-id"))).toBe(true);
  expect(info).toHaveBeenCalledTimes(2);
  if (process.env.SCAN_FIXTURE_METRICS === "1") process.stdout.write(JSON.stringify(info.mock.calls.map(([, metrics]) => metrics)) + "\n");
}, 30_000);
