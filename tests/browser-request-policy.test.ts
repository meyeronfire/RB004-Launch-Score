import { describe, expect, it } from "vitest";
import { admitBrowserRequest, BROWSER_ASSET_REQUEST_CAP, BROWSER_DOCUMENT_REQUEST_CAP, classifyBrowserRequest, htmlWithoutExecutableScripts, isScannerBlockedConsoleMessage, recentScanFailure } from "../lib/browser-request-policy";

describe("browser request policy", () => {
  it("lets the document through after asset prefetches have used the cap", () => {
    expect(classifyBrowserRequest({ url: "https://www.learnfrommistakes.in/", resourceType: "document", method: "GET", isNavigation: true })).toBe("document");
    expect(admitBrowserRequest({ kind: "document", method: "GET", documentRequests: 1, assetRequests: BROWSER_ASSET_REQUEST_CAP, bytes: 4_000_000, budgetRemaining: 8 })).toBe("fetch");
    expect(admitBrowserRequest({ kind: "document", method: "GET", documentRequests: BROWSER_DOCUMENT_REQUEST_CAP, assetRequests: 0, bytes: 0, budgetRemaining: 50 })).toBe("skip");
  });

  it("skips Next.js RSC prefetches and large media before they crowd out the page", () => {
    expect(classifyBrowserRequest({ url: "https://www.learnfrommistakes.in/incidents/example?_rsc=abc", resourceType: "fetch", method: "GET", headers: { "next-router-prefetch": "1" }, isNavigation: false })).toBe("prefetch");
    expect(classifyBrowserRequest({ url: "https://cevace.com/videos/homepage/homepage.mp4", resourceType: "media", method: "GET", isNavigation: false })).toBe("media");
    expect(admitBrowserRequest({ kind: "prefetch", method: "GET", documentRequests: 0, assetRequests: 0, bytes: 0, budgetRemaining: 50 })).toBe("skip");
    expect(admitBrowserRequest({ kind: "media", method: "GET", documentRequests: 0, assetRequests: 0, bytes: 0, budgetRemaining: 50 })).toBe("skip");
    expect(admitBrowserRequest({ kind: "asset", method: "GET", documentRequests: 0, assetRequests: BROWSER_ASSET_REQUEST_CAP, bytes: 0, budgetRemaining: 20 })).toBe("skip");
    expect(admitBrowserRequest({ kind: "asset", method: "POST", documentRequests: 0, assetRequests: 0, bytes: 0, budgetRemaining: 50 })).toBe("skip");
  });

  it("does not treat requests the scanner blocked as page console errors", () => {
    expect(isScannerBlockedConsoleMessage("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT")).toBe(true);
    expect(isScannerBlockedConsoleMessage("Uncaught TypeError: Cannot read properties of undefined")).toBe(false);
  });

  it("removes executable scripts while keeping server-rendered markup", () => {
    const html = `<html><head><script src="/app.js"></script><script>location.reload()</script></head><body><h1>Learn From Mistakes</h1></body></html>`;
    expect(htmlWithoutExecutableScripts(html)).toBe(`<html><head></head><body><h1>Learn From Mistakes</h1></body></html>`);
  });
});

describe("recent scan failure", () => {
  it("explains a failed scan and keeps a retry path", () => {
    expect(recentScanFailure({ id: "scan-1", url: "https://www.learnfrommistakes.in/", status: "failed", error: "The live page render was interrupted before the review could finish. Try again." })).toEqual({
      reason: "The live page render was interrupted before the review could finish. Try again.",
      reportHref: "/r/scan-1",
      retryHref: "/?url=https%3A%2F%2Fwww.learnfrommistakes.in%2F",
    });
    expect(recentScanFailure({ id: "scan-2", url: "https://cevace.com/", status: "failed", error: "  " })?.reason).toMatch(/could not be scanned/i);
    expect(recentScanFailure({ id: "scan-3", url: "https://cevace.com/", status: "complete", error: null })).toBeUndefined();
  });
});
