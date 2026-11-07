import { describe, expect, it } from "vitest";
import { buildShareCardData, SHARE_FORMATS } from "../lib/share-card";
import type { ScanRecord } from "../lib/types";

const baseScan = {
  status: "complete" as const,
  score: 81,
  domain: "example.test",
  categoryScores: { clarity: 70, conversion: 82, design_brand: 73, trust: 91, technical: 88, security: 100, seo_aeo: 84 },
  findings: [
    { id: "a", category: "security" as const, severity: "critical" as const, title: "A", why_it_matters: "", evidence: "", fix: "" },
    { id: "b", category: "technical" as const, severity: "high" as const, title: "B", why_it_matters: "", evidence: "", fix: "" },
    { id: "c", category: "trust" as const, severity: "medium" as const, title: "C", why_it_matters: "", evidence: "", fix: "" },
    { id: "d", category: "clarity" as const, severity: "low" as const, title: "D", why_it_matters: "", evidence: "", fix: "" },
  ],
} satisfies Pick<ScanRecord, "score" | "domain" | "categoryScores" | "findings" | "status">;

describe("share-card data", () => {
  it("maps real score, seven categories, and severity totals without exposing finding text", () => {
    const data = buildShareCardData(baseScan);
    expect(data.score).toBe(81);
    expect(data.domain).toBe("example.test");
    expect(data.categories).toEqual([
      { label: "Clarity", value: 70 },
      { label: "Conversion", value: 82 },
      { label: "Design & Brand", value: 73 },
      { label: "Trust", value: 91 },
      { label: "Technical", value: 88 },
      { label: "Security", value: 100 },
      { label: "SEO / AEO", value: 84 },
    ]);
    expect(data.severityCounts).toEqual({ critical: 1, high: 1, medium: 1, low: 1 });
    expect(data.issueCount).toBe(4);
    expect(JSON.stringify(data)).not.toContain("why_it_matters");
    expect(JSON.stringify(data)).not.toContain("fix");
  });

  it("keeps incomplete data honest and tolerates missing category scores", () => {
    const data = buildShareCardData({ ...baseScan, status: "scanning", score: undefined, domain: undefined, categoryScores: undefined, findings: undefined });
    expect(data.hasData).toBe(false);
    expect(data.score).toBeNull();
    expect(data.domain).toBe("");
    expect(data.categories.every(({ value }) => value === null)).toBe(true);
    expect(data.issueCount).toBe(0);
    expect(data.statusLabel).toBe("Assessment incomplete.");
  });

  it("bounds long domains for deterministic image rendering", () => {
    const domain = `${"a".repeat(50)}.test`;
    expect(buildShareCardData({ ...baseScan, domain }).domain).toBe(`${domain.slice(0, 39)}…`);
  });

  it("defines the requested pixel dimensions for every export format", () => {
    expect(SHARE_FORMATS).toEqual({
      og: { width: 1200, height: 630, label: "1200 × 630 · X / OG" },
      portrait: { width: 1080, height: 1350, label: "1080 × 1350 · Post" },
      story: { width: 1080, height: 1920, label: "1080 × 1920 · Story" },
    });
  });
});
