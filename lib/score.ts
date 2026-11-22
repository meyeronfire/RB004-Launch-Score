import type { Category, Finding, Severity } from "./types";
import { CATEGORY_WEIGHTS, LIGHTHOUSE_TECHNICAL_SHARE } from "../config/scoring";
import { findingResult } from "./finding-result";

export { CATEGORY_WEIGHTS };
if (Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0) !== 100) throw new Error("Category weights must sum to 100.");
const PENALTY: Record<Severity, number> = { critical: 22, high: 13, medium: 7, low: 3 };
export const SEVERITY_PENALTY = PENALTY;
export const needsFindingReview = (finding: Finding) => findingResult(finding) === "Needs review";

export function makeFinding(input: Omit<Finding, "id">): Finding {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 36);
  return { ...input, id: `${input.category}-${slug}` };
}

export function dedupeFindings(findings: Finding[]) {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = unique.get(finding.id);
    const existingIsConfirmed = existing && !needsFindingReview(existing);
    const nextIsConfirmed = !needsFindingReview(finding);
    if (!existing || (!existingIsConfirmed && nextIsConfirmed)) unique.set(finding.id, finding);
  }
  return [...unique.values()];
}

export function scoreFindings(findings: Finding[], coverage: Partial<Record<Category, number>> = { clarity: 0.6, conversion: 0.7, design_brand: 0.45, trust: 0.25, technical: 0.7, security: 0.55, seo_aeo: 0.55 }, lighthouseScores?: number[], assessments: Partial<Record<Category, number>> = {}) {
  const uniqueFindings = dedupeFindings(findings);
  const categoryScores = {} as Record<Category, number>;
  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const penalties = uniqueFindings.filter((f) => f.category === category && !needsFindingReview(f)).reduce((sum, f) => sum + PENALTY[f.severity], 0);
    const evidenceCeiling = Math.round(50 + 50 * Math.max(0, Math.min(1, coverage[category] ?? 0.55)));
    const findingsScore = Math.max(0, Math.min(evidenceCeiling, Math.round(assessments[category] ?? 100) - penalties));
    if (category === "technical" && lighthouseScores?.length) {
      const valid = lighthouseScores.filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
      const lighthouseAverage = valid.reduce((sum, score) => sum + score, 0) / (valid.length || 1);
      categoryScores[category] = valid.length ? Math.min(evidenceCeiling, Math.round(findingsScore * (1 - LIGHTHOUSE_TECHNICAL_SHARE) + lighthouseAverage * LIGHTHOUSE_TECHNICAL_SHARE)) : findingsScore;
    } else categoryScores[category] = findingsScore;
  }
  const weighted = Object.entries(CATEGORY_WEIGHTS).reduce((sum, [category, weight]) => sum + categoryScores[category as Category] * weight, 0) / 100;
  return { score: Math.round(weighted), categoryScores };
}

type StoredScore = {
  score?: number;
  categoryScores?: Partial<Record<Category, number>>;
  findings?: Finding[];
  scoreBreakdown?: { categories: Record<string, { score: number; base: number; ceiling: number; lost: number; count: number }>; top: Array<{ code?: string; severity: Severity; penalty: number; title: string; category: Category }> };
};

// Saved scans can contain the same finding id twice. Those copies must not be
// deducted twice. When the stored breakdown lost more points than the unique
// findings, replace that category with base − deduped penalty, capped by its
// recorded ceiling, and recompute the overall score from the category scores.
export function reconcileDuplicateFindingScores<T extends StoredScore>(scan: T): T {
  const findings = scan.findings ?? [];
  const unique = dedupeFindings(findings);
  if (unique.length === findings.length || !scan.categoryScores || !scan.scoreBreakdown) return scan;
  const categoryScores = { ...scan.categoryScores };
  const categories = { ...scan.scoreBreakdown.categories };
  let changed = false;
  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const entry = categories[category];
    if (!entry) continue;
    const confirmed = unique.filter((finding) => finding.category === category && !needsFindingReview(finding));
    const lost = confirmed.reduce((sum, finding) => sum + PENALTY[finding.severity], 0);
    if (lost === entry.lost) continue;
    const score = Math.max(0, Math.min(entry.ceiling, entry.base - lost));
    categoryScores[category] = score;
    categories[category] = { ...entry, score, lost, count: confirmed.length };
    changed = true;
  }
  if (!changed) return scan;
  const keys = Object.keys(CATEGORY_WEIGHTS) as Category[];
  const score = keys.every((key) => typeof categoryScores[key] === "number")
    ? Math.round(keys.reduce((sum, key) => sum + (categoryScores[key] as number) * CATEGORY_WEIGHTS[key], 0) / 100)
    : scan.score;
  return { ...scan, score, categoryScores, scoreBreakdown: { ...scan.scoreBreakdown, categories } };
}

export function rankFindings(findings: Finding[]) {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const confidence = (finding: Finding) => finding.confidence === "unknown" ? 2 : needsFindingReview(finding) ? 1 : 0;
  return [...findings].sort((a, b) => confidence(a) - confidence(b) || order[a.severity] - order[b.severity] || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
