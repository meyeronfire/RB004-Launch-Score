import { findingResult } from "./finding-result";
import type { Finding } from "./types";

export type LaunchPlanStep = {
  id: string;
  phase: "Confirm first" | "Before launch" | "Launch polish";
  title: string;
  category: string;
  severity: Finding["severity"];
  evidence: string;
  action: string;
};

export const OWNER_LAUNCH_CHECKS = [
  { title: "Protect paid and sensitive endpoints", detail: "Confirm authentication, authorization, and rate limits for private or costly operations." },
  { title: "Back up important data", detail: "Confirm backups run and that someone has tested restoring them." },
  { title: "Review secrets", detail: "Check repository history and deployed settings for exposed credentials; rotate any exposed key." },
  { title: "Set spend limits and alerts", detail: "Review paid API and infrastructure limits, budgets, and notifications." },
  { title: "Know how to roll back", detail: "Confirm a previous stable release can be restored and who can do it." },
  { title: "Run checks before release", detail: "Confirm the existing CI or release process runs relevant tests and a production build." },
  { title: "Review AI safeguards when applicable", detail: "Check provider failure behavior, usage limits, and untrusted-input handling if the product uses AI." },
] as const;

export function buildLaunchPlan(findings: Finding[]): LaunchPlanStep[] {
  return findings.map((finding, index) => {
    const needsReview = findingResult(finding) === "Needs review";
    const phase: LaunchPlanStep["phase"] = needsReview ? "Confirm first" : finding.severity === "critical" || finding.severity === "high" ? "Before launch" : "Launch polish";
    return {
      id: finding.id || `${finding.code ?? "finding"}-${index}`,
      phase,
      title: finding.title,
      category: finding.category.replaceAll("_", " "),
      severity: finding.severity,
      evidence: finding.evidence,
      action: needsReview ? "Verify this concern in the live product and its implementation before making a change." : finding.fix,
    };
  }).sort((a, b) => {
    const order = { "Confirm first": 0, "Before launch": 1, "Launch polish": 2 };
    return order[a.phase] - order[b.phase];
  });
}

export function formatLaunchPlanMarkdown(findings: Finding[]) {
  const steps = buildLaunchPlan(findings);
  const phases = ["Confirm first", "Before launch", "Launch polish"] as const;
  const plan = phases.map((phase) => {
    const rows = steps.filter((step) => step.phase === phase);
    return rows.length ? [`### ${phase}`, ...rows.map((step) => `- [ ] **${step.title}** (${step.category}, ${step.severity})\n  - Evidence: ${step.evidence}\n  - Next step: ${step.action}`)].join("\n") : "";
  }).filter(Boolean);
  return ["## Personalized launch plan", "Work through these scan-specific steps, then re-scan the page. Findings are page-level evidence; confirm each condition before changing code.", ...plan, "### Owner confirmation · not checked by the scan", ...OWNER_LAUNCH_CHECKS.map((item) => `- [ ] **${item.title}** — ${item.detail}`), "Owner-check topics adapted from the [Vibe Coder’s Production Ready Checklist](https://github.com/pepperworks/vibe-coders-checklist)."].join("\n\n");
}
