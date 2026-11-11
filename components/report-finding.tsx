import type { Finding } from "@/lib/types";
import { categoryAccent } from "@/lib/report-visuals";
import { findingResult } from "@/lib/finding-result";
import { SEVERITY_PENALTY } from "@/lib/score";

const categories: Record<string, string> = {
  clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust",
  technical: "Technical", security: "Security", seo_aeo: "SEO / AEO",
};
const rank: Record<Finding["severity"], string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

function nextStep(finding: Pick<Finding, "category" | "section" | "title" | "evidence">) {
  const text = `${finding.title} ${finding.evidence}`.toLowerCase();
  if (/tap target|touch target/.test(text) && /\b44\s*[×x]\s*44/.test(text)) return "Increase the affected control's touch area to at least 44 × 44px, preserve its label and destination, and leave enough room between neighboring controls. Recheck the measured target on mobile.";
  if (/\bforms?\b|\bsubmission\b/.test(text)) return "Verify the form's actual submission path with a safe test in a non-production or test environment; do not infer failure from a missing HTML action alone.";
  if (finding.category === "security" && /csp|content.security.policy|header/.test(text)) return "Review the response policy against the page's scripts, embeds, and integrations, then confirm the effective response headers. A missing header alone does not demonstrate an exploitable vulnerability.";
  if (/alt text|image description|alt attribute/.test(text)) return "Review each affected image in context and provide concise descriptions for informative images; keep decorative images silent to assistive technology.";
  if (finding.category === "seo_aeo") return "Check the relevant document metadata in the rendered page and align it with the page's actual content and canonical URL.";
  if (finding.category === "technical") return "Reproduce the observation in the affected browser or viewport, then check the rendered page after the smallest targeted change.";
  if (finding.category === "conversion") return "Follow the primary action through to its destination and confirm the visitor can complete the intended next step.";
  if (finding.category === "clarity") return "Review the visible page copy with the intended audience and offer in mind; keep claims tied to verified product facts.";
  if (finding.category === "trust") return "Confirm the relevant trust information is accurate, current, and easy to find on the page.";
  if (finding.category === "design_brand") return "Review the cited element in its surrounding layout and test the smallest change at mobile and desktop sizes.";
  return "Recheck the recorded observation on the current page, then choose a targeted change only if the evidence is reproducible.";
}

export function ReportFinding({ finding, index, fix, scoringVersion, compact = false, evidenceAvailable = false, evidenceHref = "#page-evidence" }: { finding: Pick<Finding, "id" | "code" | "category" | "section" | "severity" | "title" | "why_it_matters" | "evidence"> & Partial<Pick<Finding, "fix">>; index: number; fix?: string; scoringVersion?: number; compact?: boolean; evidenceAvailable?: boolean; evidenceHref?: string }) {
  const category = categories[finding.category] ?? "Other";
  const result = findingResult(finding);
  return <article className={`report-finding${compact ? " report-finding--compact" : ""}`} style={{ "--category-accent": categoryAccent(finding.category) } as React.CSSProperties}>
    <div className="report-finding-head"><span className="report-finding-number mono">{String(index + 1).padStart(2, "0")}</span><div className="report-finding-title"><h3>{finding.title}</h3><div className="report-finding-meta"><span className="finding-category-tag">{category}</span><span className={`finding-result-tag finding-result-tag--${result === "Confirmed issue" ? "confirmed" : "review"}`}>{result}</span><span className={`finding-severity-tag finding-severity-tag--${finding.severity}`}>{rank[finding.severity]} severity</span></div></div></div>
    <p className="report-finding-why"><strong>Why it matters</strong>{finding.why_it_matters}</p>
    <p className="report-finding-observation"><strong>Observed</strong>{findingResult(finding) === "Needs review" && /form/i.test(`${finding.title} ${finding.evidence}`) ? "Form submission could not be verified from markup. " : ""}{finding.evidence}</p>
    {!compact && <p className="report-finding-next"><strong>Next step</strong>{fix ?? nextStep(finding)}</p>}
    {evidenceAvailable && <a className="finding-evidence-link" href={evidenceHref}>View captured page renders</a>}
    <details className="report-finding-details"><summary>Show technical details &amp; scoring</summary><div><p><strong>Recorded evidence:</strong> {finding.evidence}</p><p><strong>Result:</strong> {result}. This status describes the evidence recorded for the finding.</p><p><strong>Severity:</strong> {rank[finding.severity]}. {result === "Needs review" && scoringVersion !== undefined && scoringVersion >= 4 ? "No score deduction is applied until the observation is confirmed." : result === "Needs review" ? "This saved report may use an earlier scoring rule; its recorded score has not been recalculated." : `The scoring model applies its configured −${SEVERITY_PENALTY[finding.severity]} rule-point deduction.`}</p>{finding.code && <p><strong>Rule:</strong> <code>{finding.code}</code></p>}</div></details>
  </article>;
}
