import { CATEGORY_WEIGHTS } from "../config/scoring";
import { getCategoryCoverage } from "./report-artifacts";
import { needsFindingReview, scoreFindings, SEVERITY_PENALTY } from "./score";
import type { Category, DesignReview, Finding, LighthouseStrategy, MetricCheck, ScoreBreakdown } from "./types";

type Input = {
  findings: Finding[];
  checks: Record<string, MetricCheck>;
  mobile: LighthouseStrategy;
  desktop: LighthouseStrategy;
  designReview?: DesignReview;
};

function checkedScores(metrics: MetricCheck[]) {
  return metrics.flatMap((metric) => metric.state === "checked" && typeof metric.value === "number" ? [metric.value] : []);
}

export function scoreLighthouseAudit(input: Input) {
  const technicalScores = checkedScores([
    input.mobile.performance, input.mobile.accessibility, input.mobile.bestPractices,
    input.desktop.performance, input.desktop.accessibility, input.desktop.bestPractices,
  ]);
  const seoScores = checkedScores([input.mobile.seo, input.desktop.seo]);
  const categoryCoverage = getCategoryCoverage(input.checks, input.findings);
  const categoryBase: Partial<Record<Category, number>> = {
    ...(input.designReview?.score === undefined ? {} : { design_brand: input.designReview.score }),
    ...(seoScores.length ? { seo_aeo: seoScores.reduce((sum, score) => sum + score, 0) / seoScores.length } : {}),
  };
  const scored = scoreFindings(input.findings, categoryCoverage, technicalScores, categoryBase);
  const scoreBreakdown: ScoreBreakdown = {
    categories: Object.fromEntries((Object.keys(CATEGORY_WEIGHTS) as Category[]).map((category) => {
      const categoryFindings = input.findings.filter((finding) => finding.category === category && !needsFindingReview(finding));
      const lost = categoryFindings.reduce((sum, finding) => sum + SEVERITY_PENALTY[finding.severity], 0);
      const base = Math.round(categoryBase[category] ?? 100);
      const ceiling = Math.round(50 + 50 * Math.max(0, Math.min(1, categoryCoverage[category] ?? 0)));
      return [category, { score: scored.categoryScores[category], base, ceiling, lost, count: categoryFindings.length }];
    })),
    top: input.findings.filter((finding) => !needsFindingReview(finding))
      .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
      .slice(0, 5)
      .map((finding) => ({ code: finding.code, severity: finding.severity, penalty: SEVERITY_PENALTY[finding.severity], title: finding.title, category: finding.category })),
  };
  return { ...scored, categoryCoverage, scoreBreakdown };
}
