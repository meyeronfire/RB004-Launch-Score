import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Finding, LighthouseStrategy, MetricCheck } from "../lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  return {
    default: (props: { src: string; alt: string; width: number; height: number; unoptimized?: boolean }) => { const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps); },
  };
});

import { TechnicalReportSections } from "../components/technical-report-sections";
import { CATEGORY_ACCENTS, categoryAccent } from "../lib/report-visuals";

const finding: Finding = {
  id: "sec-01", code: "SEC-01", category: "security", section: "security", severity: "high",
  title: "Missing Content-Security-Policy security header",
  why_it_matters: "Response headers limit browser capabilities and reduce the impact of common web attacks.",
  evidence: "Content-Security-Policy was not present in the launch page response.",
  fix: "PRIVATE_FIX_SENTINEL: add a Content-Security-Policy header.",
};
const unknownStrategy = (note: string): LighthouseStrategy => ({
  performance: { state: "unknown", note }, accessibility: { state: "unknown", note },
  bestPractices: { state: "unknown", note }, seo: { state: "unknown", note },
  lcp: { state: "unknown", note }, cls: { state: "unknown", note }, inpTbt: { state: "unknown", note },
});
const scan = {
  id: "scan-123", url: "https://example.test/", title: "Example",
  findings: [finding],
  findingCounts: { security: { total: 1, critical: 0, high: 1, medium: 0, low: 0 } },
  checks: {
    contentSecurityPolicy: { state: "checked", value: "Missing" } as MetricCheck,
    title: { state: "checked", value: "Example" } as MetricCheck,
    canonical: { state: "checked", value: "Missing" } as MetricCheck,
    jsonLd: { state: "checked", value: "0 valid · 0 invalid" } as MetricCheck,
    lighthouseMobileSeo: { state: "unknown", note: "PageSpeed Insights timed out during the mobile run. Retry Lighthouse to try again." } as MetricCheck,
  },
  lighthouse: {
    source: "via Google PageSpeed Insights" as const,
    mobile: unknownStrategy("PageSpeed Insights timed out during the mobile run. Retry Lighthouse to try again."),
    desktop: unknownStrategy("PageSpeed Insights timed out during the desktop run. Retry Lighthouse to try again."),
  },
  aiCrawlerReport: {
    state: "checked" as const, robotsUrl: "https://example.test/robots.txt", fetchedAt: "2026-11-08T00:00:00.000Z",
    policies: [
      { name: "GPTBot", userAgent: "GPTBot", purpose: "AI search", policy: "allowed" as const, matchedRules: [], requestTested: false as const },
      { name: "ClaudeBot", userAgent: "ClaudeBot", purpose: "AI search", policy: "blocked" as const, matchedRules: [{ directive: "disallow" as const, path: "/" }], requestTested: false as const },
      { name: "PerplexityBot", userAgent: "PerplexityBot", purpose: "AI search", policy: "unknown" as const, matchedRules: [], requestTested: false as const },
      { name: "OtherBot", userAgent: "OtherBot", purpose: "AI search", policy: "no_matching_rule" as const, matchedRules: [], requestTested: false as const },
    ],
    preferences: [{ signal: "Google-Extended", label: "Google data-use preference", status: "blocked" as const, matchedRules: [{ directive: "disallow" as const, path: "/" }] }],
    note: "robots.txt rules only; no real bot requests were tested.",
  },
  checkoutAvailable: true,
} as unknown as Parameters<typeof TechnicalReportSections>[0]["scan"];

const renderReport = (paidFindings?: Finding[]) => renderToStaticMarkup(React.createElement(TechnicalReportSections, {
  scan, paidFindings, onRetryLighthouse: async () => null, onUnlock: () => {},
  checkoutPending: false, checkoutMessage: "", checkoutSection: "",
}));

describe("report detail interface", () => {
  it("assigns a stable high-contrast color to every report category", () => {
    const categories = ["clarity", "conversion", "design_brand", "trust", "technical", "security", "seo_aeo"] as const;
    const colors = categories.map((category) => categoryAccent(category));
    expect(Object.keys(CATEGORY_ACCENTS)).toHaveLength(7);
    expect(new Set(colors).size).toBe(7);
    expect(categoryAccent("seo_aeo")).toBe(CATEGORY_ACCENTS.seo_aeo);
  });

  it("organizes a finding like an audit with status, impact, evidence, and priority", () => {
    const html = renderReport();

    expect(html).toContain("Why this needs attention");
    expect(html).toContain("Evidence recorded");
    expect(html).toContain("Priority P2");
    expect(html).toContain("−13 rule points");
    expect(html).toContain("Content-Security-Policy was not present in the launch page response.");
    expect(html).toContain('data-category="security"');
    expect(html).toContain("--category-accent:#ff745e");
    expect(html).toContain("PageSpeed Insights timed out during the mobile run.");
  });

  it("keeps remediation private in the free report and reveals it only with paid findings", () => {
    const freeHtml = renderReport();
    expect(freeHtml).toContain("Unlock the site-specific correction");
    expect(freeHtml).not.toContain("PRIVATE_FIX_SENTINEL");
    expect(freeHtml).not.toContain("default-src 'self'");

    const paidHtml = renderReport([finding]);
    expect(paidHtml).toContain("PRIVATE_FIX_SENTINEL");
  });

  it("shows robots-policy counts and page-level SEO/AEO evidence without implying real bot requests", () => {
    const html = renderReport();

    expect(html).toContain("Allowed by robots");
    expect(html).toContain("Blocked by robots");
    expect(html).toContain("No matching rule");
    expect(html).toContain("Data-use preferences");
    expect(html).toContain("Page-level SEO / AEO readiness");
    expect(html).toContain("Structured data");
    expect(html).toContain("robots.txt rules only; no real bot requests were tested.");
  });
});

if (process.env.REPORT_PREVIEW_PATH) {
  it("writes a local report preview for visual verification", async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const css = await readFile("app/globals.css", "utf8");
    const markup = renderReport();
    await writeFile(process.env.REPORT_PREVIEW_PATH!, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="report-page">${markup}</main></body></html>`);
  });
}
