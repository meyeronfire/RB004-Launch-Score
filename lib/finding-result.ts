import type { Finding } from "./types";

type Evidence = Pick<Finding, "title" | "evidence" | "category">;

/** Presentation state only. Existing severity, priority, and score remain unchanged. */
export function findingResult(finding: Evidence): "Confirmed issue" | "Needs review" {
  const title = finding.title.toLowerCase();
  const evidence = finding.evidence.toLowerCase();
  if (/form action could not be confirmed|form submission could not be verified/.test(title)) return "Needs review";
  if (finding.category === "trust" && /not detected|no recognizable|no faq|no contact/.test(title)) return "Needs review";
  if (/could not (?:be )?(?:confirmed|verified|determined)|not submitted|not tested|needs review/.test(title)) return "Needs review";
  if (/^\s*(?:this|the) (?:finding|issue|result) (?:could not|was not) (?:be )?(?:confirmed|verified)/.test(evidence)) return "Needs review";
  return "Confirmed issue";
}
