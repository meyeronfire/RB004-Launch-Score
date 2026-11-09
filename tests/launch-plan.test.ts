import { describe, expect, it } from "vitest";
import { buildLaunchPlan, formatLaunchPlanMarkdown, OWNER_LAUNCH_CHECKS } from "../lib/launch-plan";
import { promptVariants, emptyDrafts } from "../lib/fix-prompts";
import type { Finding } from "../lib/types";

const finding = (overrides: Partial<Finding> = {}): Finding => ({
  id: "security-header", code: "SEC-01", category: "security", section: "security", severity: "high",
  title: "Add a content security policy", why_it_matters: "A policy can reduce the impact of injected content.",
  evidence: "No Content-Security-Policy response header was recorded.", fix: "Add a suitable policy and verify required assets still load.",
  ...overrides,
});

describe("personalized launch plan", () => {
  it("orders review tasks before high impact fixes and launch polish", () => {
    const steps = buildLaunchPlan([
      finding({ id: "low", severity: "low", title: "Polish the footer" }),
      finding({ id: "high", severity: "high", title: "Protect the page" }),
      finding({ id: "review", category: "trust", title: "Pricing details were not detected" }),
    ]);
    expect(steps.map((step) => [step.id, step.phase])).toEqual([
      ["review", "Confirm first"], ["high", "Before launch"], ["low", "Launch polish"],
    ]);
    expect(steps[0].action).toContain("Verify this concern");
  });

  it("includes the owner checklist with clear non-scan attribution in exports and prompts", () => {
    const markdown = formatLaunchPlanMarkdown([finding()]);
    const prompt = promptVariants({ url: "https://example.test", title: "Example", stack: [], findings: [finding()], copyDrafts: emptyDrafts() }).Codex;
    expect(markdown).toContain("Owner confirmation · not checked by the scan");
    expect(markdown).toContain("Confirm backups run and that someone has tested restoring them.");
    expect(prompt).toContain("Personalized launch plan");
    expect(prompt).toContain("owner-confirmation checklist is not scan evidence");
    expect(OWNER_LAUNCH_CHECKS).toHaveLength(7);
  });
});
