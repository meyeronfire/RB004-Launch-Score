import type { EngineId, Finding, MetricCheck } from "../types";
import { recordFinding, type ScanEngine } from "./engine";
import { makeFinding } from "../score";

const sharedRules: Record<string, string> = {
  "The page does not declare its language": "document-language",
  "Some images have no alt attribute": "image-alternative",
  "The heading order skips a level": "heading-order",
  "A form field is missing an accessible label": "form-label",
};

type Input = {
  findings: Finding[];
  url: string;
  date: string;
  checks?: MetricCheck[];
  incomplete?: boolean;
  manual?: boolean;
  note?: string;
};

export function observationEngine(id: EngineId, version: string): ScanEngine<Input, Finding[]> {
  return {
    id, version, timeoutMs: 1000,
    async run({ findings, url, date, checks, incomplete, manual, note }) {
      const value = findings.map((finding) => recordFinding(finding, url, {
        engine: id, version, ruleId: finding.id,
      }, date, sharedRules[finding.title] ?? `${id}:${finding.id}`));
      const status = incomplete || checks?.some((check) => check.state === "unknown") ? "incomplete"
        : value.some((finding) => finding.verification === "observed") ? "issues"
        : manual || value.length ? "manual" : "passed";
      return { value, status, note };
    },
  };
}

export const seoEngine = observationEngine("seo", "r4r-1");
export const securityEngine = observationEngine("security", "r4r-1");
export const launchEngine = observationEngine("launch", "r4r-1");
const browserEngine = observationEngine("functionality", "r4r-1");

export function functionalityEngine(input: Input & {
  emptyRender: boolean;
  mobileCaptured: boolean;
  initializationErrors: number;
  failedAssets: Array<[string, { kind: string; status: number }]>;
}) {
  const findings = [...input.findings];
  const assets = new Map(input.failedAssets);
  for (const assetKind of ["script", "stylesheet", "image"]) {
    const affected = [...assets].filter(([, asset]) => asset.kind === assetKind && (asset.status === 404 || asset.status === 410));
    if (!affected.length) continue;
    findings.push(makeFinding({
      section: "technical", category: "technical", severity: assetKind === "script" ? "high" : "medium",
      confidence: "confirmed",
      title: `A page ${assetKind} resource returned not found`,
      why_it_matters: "Missing resources can break the experience or leave parts of the page unstyled.",
      evidence: affected.slice(0, 4).map(([path, { status }]) => `${path.slice(0, 140)} · HTTP ${status}`).join(" | "),
      fix: "Verify that the deployment serves the referenced files and that the page uses current asset paths.",
    }));
  }
  if (input.emptyRender) findings.push(makeFinding({
    section: "technical", category: "technical", severity: "high", confidence: "review",
    title: "The captured page may have stayed empty",
    why_it_matters: "Visitors may see a blank page or loading screen if the app does not finish starting.",
    evidence: `The desktop capture contained no page text, images or page controls. ${input.initializationErrors} browser error(s) were recorded.`,
    fix: "Open the deployed page in a fresh session, allow scripts and resources to load, and check whether the app displays its expected first screen. Verify loading and failure states.",
  }));
  return {
    engine: browserEngine,
    input: { ...input, findings, incomplete: !input.mobileCaptured || input.incomplete, manual: true },
  };
}
