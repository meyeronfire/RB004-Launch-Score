import { describe, expect, it } from "vitest";
import { CATEGORY_CHECKS } from "../config/scoring";
import { scoreLighthouseAudit } from "../lib/lighthouse-scoring";
import type { LighthouseStrategy, MetricCheck } from "../lib/types";

const metric = (value: string | number): MetricCheck => ({ state: "checked", value });
const strategy = (seo: number): LighthouseStrategy => ({
  performance: metric(80), accessibility: metric(90), bestPractices: metric(85), seo: metric(seo),
  lcp: metric(1200), cls: metric(0.02), inpTbt: metric(100),
});

const checks = (mobileSeo: number, desktopSeo: number) => Object.fromEntries([
  ...CATEGORY_CHECKS.technical,
  ...CATEGORY_CHECKS.seo_aeo,
].map((key) => [key, metric("Recorded")]).concat([
  ["lighthouseMobileSeo", metric(mobileSeo)],
  ["lighthouseDesktopSeo", metric(desktopSeo)],
]));

describe("Lighthouse score categories", () => {
  it("scores Lighthouse SEO only in SEO/AEO, not again in Technical", () => {
    const highSeo = scoreLighthouseAudit({ findings: [], checks: checks(100, 100), mobile: strategy(100), desktop: strategy(100) });
    const lowSeo = scoreLighthouseAudit({ findings: [], checks: checks(0, 0), mobile: strategy(0), desktop: strategy(0) });

    expect(highSeo.categoryScores.technical).toBe(lowSeo.categoryScores.technical);
    expect(highSeo.categoryScores.seo_aeo).toBeGreaterThan(lowSeo.categoryScores.seo_aeo);
    expect(highSeo.scoreBreakdown.categories.seo_aeo.base).toBe(100);
    expect(lowSeo.scoreBreakdown.categories.seo_aeo.base).toBe(0);
    expect(highSeo.categoryCoverage.seo_aeo).toBe(1);
  });
  it("keeps the Lighthouse accessibility score out of Technical when axe coverage is available", () => {
    const base = { findings: [], checks: checks(100, 100), desktop: strategy(100) };
    const mobile = strategy(100);
    const fallback = scoreLighthouseAudit({ ...base, mobile: { ...mobile, accessibility: metric(0) } });
    const normal = scoreLighthouseAudit({ ...base, mobile });
    expect(fallback.categoryScores.technical).toBeLessThan(normal.categoryScores.technical);
    const axeLow = scoreLighthouseAudit({ ...base, mobile: { ...mobile, accessibility: metric(0) }, skipAccessibilityScore: true });
    const axeHigh = scoreLighthouseAudit({ ...base, mobile, skipAccessibilityScore: true });
    expect(axeLow).toEqual(axeHigh);
  });
});
