import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentScanSignal, withScanSignal, type SafeResponse } from "../lib/ssrf";

const safeFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/ssrf", async () => {
  const actual = await vi.importActual<typeof import("../lib/ssrf")>("../lib/ssrf");
  return { ...actual, safeFetch: safeFetchMock };
});

import { keepPromiseObserved, psiMetrics } from "../lib/scanner";

const providerResponse = (): SafeResponse => ({
  status: 200,
  headers: {},
  body: Buffer.from(JSON.stringify({
    lighthouseResult: {
      categories: { performance: { score: 0.67 }, accessibility: { score: 0.91 }, "best-practices": { score: 1 }, seo: { score: 1 } },
      audits: { "largest-contentful-paint": { displayValue: "2.1 s" }, "cumulative-layout-shift": { displayValue: "0.01" }, "total-blocking-time": { displayValue: "120 ms" } },
    },
  })),
  finalUrl: "https://example.com/",
  redirects: [],
});

describe("PageSpeed Insights reporting", () => {
  beforeEach(() => {
    vi.stubEnv("PAGESPEED_API_KEY", "test-only-key");
    safeFetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("allows enough time for slow Google PageSpeed runs", async () => {
    safeFetchMock.mockResolvedValueOnce(providerResponse());

    const metrics = await psiMetrics("https://example.com/", "mobile");

    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(safeFetchMock.mock.calls[0][1].timeoutMs).toBeGreaterThanOrEqual(90_000);
    expect(safeFetchMock.mock.calls[0][1].maxRedirects).toBe(0);
    expect(metrics.performance).toEqual({ state: "checked", value: 67 });
    expect(metrics.seo).toEqual({ state: "checked", value: 100 });
  });

  it("reports a timed-out strategy clearly without burning a second full timeout", async () => {
    safeFetchMock.mockRejectedValueOnce(new Error("The page took too long to respond."));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const metrics = await psiMetrics("https://example.com/", "desktop");

    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(metrics.seo.state).toBe("unknown");
    expect(metrics.seo.note).toMatch(/timed out/i);
  });

  it("does not retry after the scan cancels an in-flight strategy", async () => {
    const controller = new AbortController();
    safeFetchMock.mockImplementationOnce(() => new Promise<never>((_resolve, reject) => {
      const signal = currentScanSignal();
      if (!signal) { reject(new Error("scan signal missing")); return; }
      signal.addEventListener("abort", () => reject(new Error("request cancelled")), { once: true });
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const work = withScanSignal(controller.signal, () => psiMetrics("https://example.com/", "desktop"));
    controller.abort();
    const metrics = await work;

    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(metrics.seo.state).toBe("unknown");
    expect(metrics.seo.note).toMatch(/cancelled/i);
  });

  it("keeps both deferred strategies handled when the scan aborts before their later await", async () => {
    const controller = new AbortController();
    safeFetchMock.mockImplementation(() => new Promise<never>((_resolve, reject) => {
      const signal = currentScanSignal();
      if (!signal || signal.aborted) { reject(new Error("request cancelled")); return; }
      signal.addEventListener("abort", () => reject(new Error("request cancelled")), { once: true });
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const deferred = keepPromiseObserved(withScanSignal(controller.signal, () => Promise.all([
        psiMetrics("https://example.com/", "mobile"), psiMetrics("https://example.com/", "desktop"),
      ])));
      controller.abort();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
      const [mobile, desktop] = await deferred;
      expect(safeFetchMock).toHaveBeenCalledTimes(2);
      expect(mobile.seo.note).toMatch(/cancelled/i);
      expect(desktop.seo.note).toMatch(/cancelled/i);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps a rejected deferred PSI promise observed until the later await", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const deferred = keepPromiseObserved(Promise.reject(new Error("PageSpeed failed")));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
      await expect(deferred).rejects.toThrow("PageSpeed failed");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
