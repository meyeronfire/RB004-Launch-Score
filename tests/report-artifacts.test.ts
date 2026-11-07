import { describe, expect, it } from "vitest";
import { createReportArtifacts, getCheckLabel, getCheckLedger, getCategoryCheckStats, getCategoryCoverage } from "../lib/report-artifacts";
import type { Finding, MetricCheck } from "../lib/types";
import { contentReviewCheck } from "../lib/content-review";

const checks: Record<string, MetricCheck> = {
  https: { state: "checked", value: "Secure" },
  canonical: { state: "checked", value: "Missing" },
  pageSpeedMobile: { state: "unknown", note: "PageSpeed unavailable" },
  renderedTiming: { state: "checked", value: "524ms" },
};
const findings: Array<Omit<Finding, "fix">> = [{
  id: "seo-canonical", code: "SEO-01", category: "seo_aeo", section: "seo", severity: "high",
  title: "Add a canonical URL", why_it_matters: "Search engines need a preferred URL.", evidence: "No canonical link was detected.",
}];
const report = {
  id: "abcdefab-cdef-4abc-8def-abcdefabcdef", url: "https://example.test/", domain: "example.test", title: "Example",
  status: "complete", createdAt: "2026-11-07T12:00:00.000Z", updatedAt: "2026-11-07T12:01:00.000Z", score: 81, scoringVersion: 3,
  categoryScores: { clarity: 90, technical: 72 }, auditCounts: { checksRun: 2, passed: 1, issues: 1 }, checks, findings: [{ ...findings[0], fix: "private fix" }],
  paidPayload: { prompts: { Cursor: "PRIVATE PROMPT" } }, leadEmail: "private@example.test", leaseToken: "private-lease",
} as unknown as Parameters<typeof createReportArtifacts>[0];

describe("report audit artifacts", () => {
  it("returns a readable label for every expected check key", () => {
    expect(getCheckLabel("designReview")).toBe("Design Review");
    expect(getCheckLabel("ogImage")).toBe("Open Graph image");
  });

  it("classifies measured, failed, unknown, and unscored checks without guessing", () => {
    expect(getCheckLedger(checks, findings)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "https", status: "pass" }),
      expect.objectContaining({ key: "canonical", status: "issue" }),
      expect.objectContaining({ key: "pageSpeedMobile", status: "unknown" }),
      expect.objectContaining({ key: "renderedTiming", status: "measured" }),
    ]));
  });

  it("records absent expected checks as unknown and derives coverage from actual check states", () => {
    const missing = getCheckLedger({ contentReview: { state: "unknown", note: "Model review unavailable" } });
    expect(missing.find((row) => row.key === "canonical")).toMatchObject({ category: "SEO / AEO", status: "unknown" });
    expect(getCategoryCoverage({ contentReview: { state: "unknown" } }).clarity).toBe(0);
    expect(getCategoryCoverage({ contentReview: { state: "review", value: "Review completed" } }).clarity).toBe(1);
    expect(getCategoryCoverage({ contentReview: { state: "not_applicable", note: "Not applicable" } }).clarity).toBe(0);
  });

  it("maps explicit content-review completion to a review state without parsing status wording", () => {
    expect(contentReviewCheck(false, "Provider returned a custom error response.")).toMatchObject({ state: "unknown" });
    expect(contentReviewCheck(true, "Five-second review completed.")).toMatchObject({ state: "review", value: "Completed" });
  });

  it("summarizes each category using only its recorded pass, issue, review, unknown, N/A, and measured states", () => {
    const ledgerChecks: Record<string, MetricCheck> = {
      title: { state: "checked", value: "Missing" },
      h1Count: { state: "checked", value: 1 },
      canonical: { state: "unknown", note: "Unavailable" },
      metaRobots: { state: "review", value: "noindex, follow" },
      sitemap: { state: "not_applicable", note: "No sitemap is declared." },
      ogImage: { state: "checked", value: "1200 × 630" },
    };
    expect(getCategoryCheckStats(ledgerChecks, [], { seo_aeo: 64 }).seo_aeo).toEqual({
      score: 64, pass: 1, issue: 1, review: 1, unknown: 14, not_applicable: 1, measured: 1,
    });
  });

  it("exports useful public Markdown and structured JSON without private or paid fields", () => {
    const artifacts = createReportArtifacts(report);
    expect(artifacts.markdown).toContain("81/100");
    expect(artifacts.markdown).toContain("Add a canonical URL");
    expect(artifacts.markdown).toContain("No canonical link was detected.");
    expect(artifacts.markdown).toMatch(/Unknown: \d+/);
    expect(artifacts.json).toContain('"status": "issue"');
    expect(artifacts.json).toContain('"scoringVersion": 3');
    expect(artifacts.markdown).toContain("Scoring version: 3");
    for (const secret of ["PRIVATE PROMPT", "private@example.test", "private-lease", "private fix"]) {
      expect(artifacts.markdown).not.toContain(secret);
      expect(artifacts.json).not.toContain(secret);
    }
  });

  it("exports AI crawler policy separately from training/data-use preferences and the score", () => {
    const reportWithCrawler = { ...report, aiCrawlerReport: {
      state: "checked" as const, robotsUrl: "https://example.test/robots.txt", fetchedAt: "2026-11-07T12:00:00.000Z",
      policies: [{ name: "GPTBot", userAgent: "GPTBot", purpose: "Model crawler", policy: "blocked" as const, matchedRules: [{ directive: "disallow" as const, path: "/" }], requestTested: false as const }],
      preferences: [{ signal: "Google-Extended", label: "Google data-use preference", status: "blocked" as const, matchedRules: [{ directive: "disallow" as const, path: "/" }] }],
      note: "robots.txt policy only; no requests were sent.",
    } } as unknown as Parameters<typeof createReportArtifacts>[0];
    const artifacts = createReportArtifacts(reportWithCrawler);
    expect(artifacts.markdown).toContain("AI crawler and data-use policy");
    expect(artifacts.markdown).toContain("Training/data-use preference signals (separate from crawler access and score)");
    expect(artifacts.json).toContain('"requestTested": false');
    expect(artifacts.json).toContain('"Google-Extended"');
  });

  it("includes full fixes and tool prompts only when paid data is explicitly supplied", () => {
    const paid = {
      findings: [{ ...findings[0], evidence: "Full evidence.", fix: "Add <link rel=canonical> to the page." }],
      prompts: { Cursor: "Apply the canonical fix." },
      copyDrafts: { status: "ready", headlines: [], subheadline: "", cta: "", faq: "", metaTitle: "", metaDescription: "" },
    };
    const artifacts = createReportArtifacts(report, paid);
    expect(artifacts.markdown).toContain("Add \\<link rel=canonical\\> to the page.");
    expect(artifacts.markdown).toContain("Apply the canonical fix.");
    expect(artifacts.json).toContain('"Cursor": "Apply the canonical fix."');
  });
});
