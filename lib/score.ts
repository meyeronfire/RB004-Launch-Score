import type { Category, Finding, Severity } from "./types";

export const CATEGORY_WEIGHTS: Record<Category, number> = { clarity: 35, conversion: 30, trust: 15, technical: 20 };
const PENALTY: Record<Severity, number> = { critical: 22, high: 13, medium: 7, low: 3 };

export function makeFinding(input: Omit<Finding, "id">): Finding {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 36);
  return { ...input, id: `${input.category}-${slug}` };
}

export function scoreFindings(findings: Finding[], coverage: Record<Category, number> = { clarity: 0.6, conversion: 0.7, trust: 0.25, technical: 0.7 }) {
  const categoryScores = {} as Record<Category, number>;
  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const penalties = findings.filter((f) => f.category === category).reduce((sum, f) => sum + PENALTY[f.severity], 0);
    const evidenceCeiling = Math.round(50 + 50 * Math.max(0, Math.min(1, coverage[category])));
    categoryScores[category] = Math.max(0, Math.min(evidenceCeiling, 100 - penalties));
  }
  const weighted = Object.entries(CATEGORY_WEIGHTS).reduce((sum, [category, weight]) => sum + categoryScores[category as Category] * weight, 0) / 100;
  return { score: Math.round(weighted), categoryScores };
}

export function rankFindings(findings: Finding[]) {
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity] || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
