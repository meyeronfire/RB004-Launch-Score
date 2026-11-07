import type { Category, Finding, Severity } from "./types";
import { CATEGORY_WEIGHTS, LIGHTHOUSE_TECHNICAL_SHARE } from "../config/scoring";

export { CATEGORY_WEIGHTS };
if (Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0) !== 100) throw new Error("Category weights must sum to 100.");
const PENALTY: Record<Severity, number> = { critical: 22, high: 13, medium: 7, low: 3 };
export const SEVERITY_PENALTY = PENALTY;

export function makeFinding(input: Omit<Finding, "id">): Finding {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 36);
  return { ...input, id: `${input.category}-${slug}` };
}

export function scoreFindings(findings: Finding[], coverage: Partial<Record<Category, number>> = { clarity: 0.6, conversion: 0.7, design_brand: 0.45, trust: 0.25, technical: 0.7, security: 0.55, seo_aeo: 0.55 }, lighthouseScores?: number[], assessments: Partial<Record<Category, number>> = {}) {
  const categoryScores = {} as Record<Category, number>;
  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const penalties = findings.filter((f) => f.category === category).reduce((sum, f) => sum + PENALTY[f.severity], 0);
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

export function rankFindings(findings: Finding[]) {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity] || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
