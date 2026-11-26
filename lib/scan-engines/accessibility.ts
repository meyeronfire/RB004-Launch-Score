import type { Page } from "playwright";
import type { AxeResults } from "axe-core";
import { makeFinding } from "../score";
import { recordFinding, type ScanEngine } from "./engine";

type Input = { page: Page; url: string; date: string; viewport: "mobile" | "desktop"; rendered: boolean };
const severity = { critical: "high", serious: "medium", moderate: "low", minor: "low" } as const;
const overlaps: Record<string, string> = {
  "html-has-lang": "document-language",
  "image-alt": "image-alternative",
  "heading-order": "heading-order",
  label: "form-label",
};

type AxeSample = { violations: Array<AxeResults["violations"][number] & { count: number }>; incomplete: Array<{ id: string }> };
type Result = { findings: ReturnType<typeof makeFinding>[]; violationCount: number; manualCount: number };

function normalize(result: AxeSample, { url, date, viewport }: Input, version: string): Result {
  const findings = [...result.violations]
    .sort((a, b) => Object.keys(severity).indexOf(a.impact ?? "minor") - Object.keys(severity).indexOf(b.impact ?? "minor"))
    .slice(0, 16)
    .map((rule) => {
      const elements = rule.nodes.slice(0, 4).map((node) => ({
        selector: node.target.map((part) => Array.isArray(part) ? part.join(" › ") : part).join(" › ").replace(/\[[^\]]*\]/g, "[attribute]").slice(0, 180),
        // Retain tag context without attribute values, scripts or page text.
        snippet: node.html.match(/^<[a-z][a-z0-9:-]*/i)?.[0].concat(">"),
        detail: viewport,
      }));
      const finding = makeFinding({
        category: rule.id === "label" || rule.id === "button-name" ? "conversion" : "technical",
        section: "technical",
        severity: severity[rule.impact ?? "minor"],
        confidence: "confirmed",
        title: rule.help,
        why_it_matters: rule.description,
        evidence: `${rule.id} affected ${rule.count} element(s) in the ${viewport} rendering.`,
        fix: `Resolve axe-core rule ${rule.id} on the affected elements. Re-run the rule, then verify the controls with keyboard and assistive technology as appropriate.`,
      });
      const source = { engine: "accessibility" as const, version, ruleId: rule.id, elements, measured: rule.count, expected: 0 };
      const normalized = recordFinding(finding, url, source, date, overlaps[rule.id] ?? `axe:${rule.id}`);
      return { ...normalized, id: `axe-${rule.id}` };
    });
  return { findings, violationCount: result.violations.length, manualCount: result.incomplete.length };
}

export const accessibility: ScanEngine<Input, Result> = {
  id: "accessibility",
  version: "axe-core",
  timeoutMs: 6500,
  async run(input, signal) {
    const empty = { findings: [], violationCount: 0, manualCount: 0 };
    if (!input.rendered) return { value: empty, status: "incomplete", note: "The page was captured in static fallback mode." };
    const { default: axe } = await import("axe-core");
    signal.throwIfAborted();
    const session = await input.page.context().newCDPSession(input.page);
    try {
      const { frameTree } = await session.send("Page.getFrameTree");
      const { executionContextId } = await session.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "rb004-accessibility" });
      signal.throwIfAborted();
      const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
        contextId: executionContextId,
        expression: `${axe.source}\n;axe.run(document, {iframes: false, resultTypes: ["violations", "incomplete"]}).then(({violations,incomplete}) => ({
          violations: violations.map(({id,impact,help,description,nodes}) => ({
            id,impact,help,description,nodes: nodes.slice(0,4).map(({target,html}) => ({target,html: html.slice(0,160)})), count: nodes.length
          })), incomplete: incomplete.map(({id}) => ({id}))
        }))`,
        awaitPromise: true,
        returnByValue: true,
        timeout: 5000,
      });
      if (exceptionDetails || !result.value) throw new Error("axe-core evaluation failed");
      const value = normalize(result.value as AxeSample, input, axe.version);
      const note = `Main document at ${input.viewport} size. ${value.manualCount} rule(s) need manual review. Automated coverage alone cannot verify WCAG conformance.`;
      return { value, version: axe.version, status: value.violationCount ? "issues" : value.manualCount ? "manual" : "passed", note };
    } finally {
      await session.detach().catch(() => undefined);
    }
  },
};
