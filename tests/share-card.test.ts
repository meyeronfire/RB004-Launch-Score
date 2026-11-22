import { describe, expect, it } from "vitest";
import { buildShareCardData, SHARE_CARD_CACHE_CONTROL, SHARE_CARD_VERSION, SHARE_FORMATS, shareCardImagePath } from "../lib/share-card";
import type { ScanRecord } from "../lib/types";

const safeagentScores = { trust: 91, clarity: 50, seo_aeo: 72, security: 67, technical: 90, conversion: 90, design_brand: 0 };
const animablyScores = { trust: 88, clarity: 50, seo_aeo: 70, security: 67, technical: 94, conversion: 76, design_brand: 88 };

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

  it("keeps a recorded Design & Brand score of 0, and uses the same category values as the report", () => {
    const safeagent = buildShareCardData({ status: "complete", score: 67, domain: "safeagent.live", categoryScores: safeagentScores });
    const animably = buildShareCardData({ status: "complete", score: 76, domain: "animably.com", categoryScores: animablyScores });
    expect(safeagent.score).toBe(67);
    expect(animably.score).toBe(76);
    expect(safeagent.categories).toEqual([
      { label: "Clarity", value: 50 },
      { label: "Conversion", value: 90 },
      { label: "Design & Brand", value: 0 },
      { label: "Trust", value: 91 },
      { label: "Technical", value: 90 },
      { label: "Security", value: 67 },
      { label: "SEO / AEO", value: 72 },
    ]);
    expect(animably.categories.map((category) => category.value)).toEqual([50, 76, 88, 88, 94, 67, 70]);
    expect(safeagent.categories.find((category) => category.label === "Design & Brand")?.value).toBe(safeagentScores.design_brand);
    expect(animably.categories.find((category) => category.label === "Design & Brand")?.value).toBe(animablyScores.design_brand);
  });

  it("does not turn a missing Design & Brand score into zero", () => {
    const data = buildShareCardData({ ...baseScan, categoryScores: { clarity: 70, conversion: 82, trust: 91, technical: 88, security: 100, seo_aeo: 84 } });
    expect(data.categories.find((category) => category.label === "Design & Brand")?.value).toBeNull();
  });

  it("versions the open graph image URL and refuses to cache the previous artwork", () => {
    const path = shareCardImagePath("5003bef3-2c69-4f79-93c6-fb62946144f2", "2026-11-22T14:35:59.000Z");
    expect(path).toBe(`/r/5003bef3-2c69-4f79-93c6-fb62946144f2/opengraph-image?v=${encodeURIComponent(`${SHARE_CARD_VERSION}-2026-11-22T14:35:59.000Z`)}`);
    expect(path).toContain("v=2-");
    expect(SHARE_CARD_CACHE_CONTROL).toContain("max-age=0");
    expect(SHARE_CARD_CACHE_CONTROL).toContain("must-revalidate");
  });

  it("defines the requested pixel dimensions for every export format", () => {
    expect(SHARE_FORMATS).toEqual({
      og: { width: 1200, height: 630, label: "1200 × 630 · X / OG" },
      portrait: { width: 1080, height: 1350, label: "1080 × 1350 · Post" },
      story: { width: 1080, height: 1920, label: "1080 × 1920 · Story" },
    });
  });
});
