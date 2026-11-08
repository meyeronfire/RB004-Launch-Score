import { describe, expect, it } from "vitest";
import fixture from "./fixtures/design-signals.json";
import { auditDesignSignals, contrastRatio } from "../lib/design-audit";
import { promptVariants } from "../lib/fix-prompts";
import type { VisualSignals } from "../lib/types";

describe("design signal audit", () => {
  it("counts font/color/spacing signals and emits cited WCAG contrast findings", () => {
    const result = auditDesignSignals([fixture.desktop, fixture.mobile] as VisualSignals[]);
    expect(result.fontFamilies).toHaveLength(fixture.expected.fontFamilies);
    expect(result.colors).toHaveLength(fixture.expected.colors);
    expect(result.spacingValues.length).toBeGreaterThan(0);
    expect(result.contrastFailureCount).toBe(fixture.expected.contrastFailureCount);
    expect(result.findings[0]).toMatchObject({ category: "design_brand", section: "design", title: fixture.expected.findingTitle });
    expect(result.findings[0].evidence).toContain("Pricing");
    expect(result.findings[0].evidence).toContain("One-time payment");
  });

  it("uses WCAG relative luminance for contrast ratios", () => {
    expect(contrastRatio("#000", "#fff")).toBe(21);
    expect(contrastRatio("rgb(90, 90, 90)", "rgb(0, 0, 0)")).toBeLessThan(4.5);
    expect(contrastRatio("transparent", "#fff")).toBeUndefined();
  });

  it("keeps design fix prompts tied to cited evidence and the current palette", () => {
    const prompt = promptVariants({ url: "https://example.test", title: "A clear offer", stack: [], findings: [{ id: "design-contrast", category: "design_brand", section: "design", severity: "medium", title: "Text contrast is low in Hero", why_it_matters: "The visible hero copy is difficult to read.", evidence: "Hero — ‘A clear offer’ has 2.80:1 contrast.", fix: "Adjust the existing foreground token to reach WCAG AA." }], copyDrafts: { status: "unavailable", headlines: [], subheadline: "", cta: "", faq: "", metaTitle: "", metaDescription: "" } });
    expect(prompt.Cursor).toContain("Measure the cited text and background");
    expect(prompt.Cursor).toContain("Inspect the actual repository");
    expect(prompt.Cursor).toContain("Hero — ‘A clear offer’");
  });
});
