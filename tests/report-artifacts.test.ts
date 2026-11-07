import { describe, expect, it } from "vitest";
import { createReportArtifacts, getCheckLedger } from "../lib/report-artifacts";
import type { Finding, MetricCheck } from "../lib/types";

const checks: Record<string, MetricCheck> = {
  https: { state: "checked", value: "Secure" },
  canonical: { state: "checked", value: "Missing" },
  pageSpeedMobile: { state: "unknown", note: "PageSpeed unavailable" },
  renderedTiming: { state: "checked", value: "524ms" },
};
const findings: Array<Omit<Finding, "fix">> = [{
  id: "seo-canonical", code: "SEO-01", category: "technical", section: "seo", severity: "high",
  title: "Add a canonical URL", why_it_matters: "Search engines need a preferred URL.", evidence: "No canonical link was detected.",
}];
const report = {
  id: "abcdefab-cdef-4abc-8def-abcdefabcdef", url: "https://example.test/", domain: "example.test", title: "Example",
  status: "complete", createdAt: "2026-11-07T12:00:00.000Z", updatedAt: "2026-11-07T12:01:00.000Z", score: 81,
  categoryScores: { clarity: 90, technical: 72 }, auditCounts: { checksRun: 2, passed: 1, issues: 1 }, checks, findings: [{ ...findings[0], fix: "private fix" }],
  paidPayload: { prompts: { Cursor: "PRIVATE PROMPT" } }, leadEmail: "private@example.test", leaseToken: "private-lease",
} as unknown as Parameters<typeof createReportArtifacts>[0];

describe("report audit artifacts", () => {
  it("classifies measured, failed, unknown, and unscored checks without guessing", () => {
    expect(getCheckLedger(checks, findings)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "https", status: "pass" }),
      expect.objectContaining({ key: "canonical", status: "issue" }),
      expect.objectContaining({ key: "pageSpeedMobile", status: "unknown" }),
      expect.objectContaining({ key: "renderedTiming", status: "measured" }),
    ]));
  });

  it("exports useful public Markdown and structured JSON without private or paid fields", () => {
    const artifacts = createReportArtifacts(report);
    expect(artifacts.markdown).toContain("81/100");
    expect(artifacts.markdown).toContain("Add a canonical URL");
    expect(artifacts.markdown).toContain("No canonical link was detected.");
    expect(artifacts.markdown).toContain("Unknown: 1");
    expect(artifacts.json).toContain('"status": "issue"');
    for (const secret of ["PRIVATE PROMPT", "private@example.test", "private-lease", "private fix"]) {
      expect(artifacts.markdown).not.toContain(secret);
      expect(artifacts.json).not.toContain(secret);
    }
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
