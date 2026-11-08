import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Finding, LighthouseStrategy, MetricCheck } from "../lib/types";

vi.mock("next/image", async () => {
  const { createElement } = await vi.importActual<typeof import("react")>("react");
  return { default: (props: { src: string; alt: string; width: number; height: number; unoptimized?: boolean }) => {
    const imageProps = { ...props }; delete imageProps.unoptimized; return createElement("img", imageProps);
  } };
});

import { ReportFinding } from "../components/report-finding";
import { ReportCategoryScore } from "../components/report-category-score";
import { ReportOtherChecks } from "../components/report-other-checks";
import { getCheckLedger } from "../lib/report-artifacts";
import { TechnicalReportSections } from "../components/technical-report-sections";
import { CATEGORY_ACCENTS, categoryAccent } from "../lib/report-visuals";
import { findingResult } from "../lib/finding-result";
import { promptVariants, emptyDrafts } from "../lib/fix-prompts";
import { SEVERITY_PENALTY, scoreFindings } from "../lib/score";

const finding: Finding = {
  id: "sec-01", code: "SEC-01", category: "security", section: "security", severity: "high",
  title: "Missing Content-Security-Policy security header",
  why_it_matters: "A response policy can limit browser capabilities.",
  evidence: "Content-Security-Policy was not present in the launch page response.",
  fix: "PRIVATE_FIX_SENTINEL: configure the policy after reviewing integrations.",
};
const unknownStrategy = (note: string): LighthouseStrategy => ({
  performance: { state: "unknown", note }, accessibility: { state: "unknown", note },
  bestPractices: { state: "unknown", note }, seo: { state: "unknown", note },
  lcp: { state: "unknown", note }, cls: { state: "unknown", note }, inpTbt: { state: "unknown", note },
});
const scan = {
  id: "scan-123", url: "https://example.test/", title: "Example", createdAt: "2026-11-08T00:00:00.000Z",
  checks: { speedFcp: { state: "checked", value: "0 ms first contentful paint" } as MetricCheck,
    speedLcp: { state: "checked", value: "0 ms largest contentful paint" } as MetricCheck,
    speedDcl: { state: "checked", value: "0 ms DOMContentLoaded" } as MetricCheck,
    speedCls: { state: "checked", value: 0 } as MetricCheck },
  lighthouse: { source: "via Google PageSpeed Insights" as const,
    mobile: unknownStrategy("PageSpeed Insights timed out during the mobile run."),
    desktop: unknownStrategy("PageSpeed Insights timed out during the desktop run.") },
  aiCrawlerReport: { state: "checked" as const, robotsUrl: "https://example.test/robots.txt", fetchedAt: "2026-11-08T00:00:00.000Z",
    policies: [{ name: "GPTBot", userAgent: "GPTBot", purpose: "AI search", policy: "allowed" as const, matchedRules: [], requestTested: false as const }],
    preferences: [], note: "robots.txt rules only; no real bot requests were tested." },
} as unknown as Parameters<typeof TechnicalReportSections>[0]["scan"];

const renderedPerformance = () => renderToStaticMarkup(React.createElement(TechnicalReportSections, {
  scan, onRetryLighthouse: async () => null,
}));

describe("report presentation", () => {
  it("keeps recorded checks outside the seven scoring categories visible", () => {
    const rows = getCheckLedger({ favicon: { state: "checked", value: "https://example.test/icon.png" },
      appleTouchIcon: { state: "checked", value: "https://example.test/touch.png" },
      lcp: { state: "unknown", note: "Historical measurement was unavailable." } });
    const html = renderToStaticMarkup(React.createElement(ReportOtherChecks, { rows }));
    expect(html).toContain("Other recorded checks");
    expect(html).toContain("https://example.test/icon.png");
    expect(html).toContain("https://example.test/touch.png");
    expect(html).toContain("Historical measurement was unavailable.");
  });
  it("distinguishes an unavailable category score from a measured zero", () => {
    const missing = renderToStaticMarkup(React.createElement(ReportCategoryScore, {}));
    expect(missing).toContain("Unavailable");
    expect(missing).not.toContain("/100");
    expect(missing).not.toContain("<i");
    expect(renderToStaticMarkup(React.createElement(ReportCategoryScore, { score: 0 }))).toContain("0<small>/100</small>");
  });

  it("gives a measured mobile tap target a specific next step and a capture link", () => {
    const tapTarget = { ...finding, category: "conversion" as const, title: "The first mobile action has a small tap target",
      evidence: "The first visible mobile action measures 163 × 30px; the target is at least 44 × 44px." };
    const html = renderToStaticMarkup(React.createElement(ReportFinding, { finding: tapTarget, index: 1, evidenceAvailable: true }));
    expect(html).toContain("touch area to at least 44 × 44px");
    expect(html).toContain('href="#page-evidence"');
    expect(html).not.toContain("PRIVATE_FIX_SENTINEL");
  });
  it("uses the one approved interface accent across all seven categories", () => {
    expect(Object.keys(CATEGORY_ACCENTS)).toHaveLength(7);
    expect(new Set(Object.values(CATEGORY_ACCENTS))).toEqual(new Set(["#ff2e7e"]));
    expect(categoryAccent("seo_aeo")).toBe("#ff2e7e");
  });

  it("keeps title first, evidence and severity distinct, and private fix out of free rendering", () => {
    const html = renderToStaticMarkup(React.createElement(ReportFinding, { finding, index: 0 }));
    expect(html.indexOf("Missing Content-Security-Policy")).toBeLessThan(html.indexOf("High severity"));
    expect(html).toContain("Confirmed issue");
    expect(html).toContain("Why it matters");
    expect(html).toContain("Observed");
    expect(html).toContain("Technical detail and scoring");
    expect(html).not.toContain("PRIVATE_FIX_SENTINEL");
    expect(renderToStaticMarkup(React.createElement(ReportFinding, { finding, index: 0, fix: finding.fix }))).toContain("PRIVATE_FIX_SENTINEL");
  });

  it("labels passive form and trust heuristics for review without changing scoring", () => {
    const form = { ...finding, category: "conversion" as const, severity: "medium" as const,
      title: "A form action could not be confirmed from markup",
      evidence: "Form 1 has no action attribute. It was not submitted; script-registered handlers cannot be confirmed by this passive check." };
    expect(findingResult(form)).toBe("Needs review");
    expect(SEVERITY_PENALTY[form.severity]).toBe(7);
    expect(scoreFindings([form], { conversion: 1 }).categoryScores.conversion).toBe(93);
    // Unapplied proposal: eligibility must be separately approved/versioned.
    const hypotheticalEligible = [form].filter((item) => findingResult(item) === "Confirmed issue");
    expect(scoreFindings(hypotheticalEligible, { conversion: 1 }).categoryScores.conversion).toBe(100);
    expect(renderToStaticMarkup(React.createElement(ReportFinding, { finding: form, index: 0 }))).toContain("Form submission could not be verified from markup.");
    expect(findingResult({ ...finding, category: "trust", title: "Pricing details were not detected" })).toBe("Needs review");
    expect(findingResult({ ...finding, category: "technical", title: "Some same-site links returned an HTTP error", evidence: "One link returned HTTP 404. Three other checks were unknown." })).toBe("Confirmed issue");
    const prompt = promptVariants({ url: "https://example.test/", title: "Example", stack: [], findings: [form, finding], copyDrafts: emptyDrafts() }).Codex;
    expect(prompt.indexOf("Missing Content-Security-Policy")).toBeLessThan(prompt.indexOf("## Separate verification tasks"));
    expect(prompt.indexOf("A form action could not be confirmed")).toBeGreaterThan(prompt.indexOf("## Separate verification tasks"));
  });

  it("shows unavailable positive timings honestly and keeps robots policy separate", () => {
    const html = renderedPerformance();
    expect(html).toContain("PageSpeed Insights timed out");
    expect(html).toContain("First contentful paint");
    expect(html).not.toContain("0 ms first contentful paint");
    expect(html).not.toContain("0 ms largest contentful paint");
    expect(html).toContain("Allowed by robots");
    expect(html).toContain("robots.txt rules only; no real bot requests were tested.");
  });

  it("keeps performance recommendations separate from form submission tasks", () => {
    const performance = { ...finding, category: "technical" as const, section: "technical" as const,
      title: "Mobile performance needs attention", evidence: "The recorded lab performance score is 45." };
    const html = renderToStaticMarkup(React.createElement(ReportFinding, { finding: performance, index: 0 }));
    expect(html).not.toContain("Verify the form");
    expect(promptVariants({ url: "https://example.test/", title: "Example", stack: [], findings: [performance], copyDrafts: emptyDrafts() }).Codex).not.toContain("A safe submission test");
  });
});
