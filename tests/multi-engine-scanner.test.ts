import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { accessibility } from "../lib/scan-engines/accessibility";
import { combineFindings, runEngine, recordFinding, type ScanEngine } from "../lib/scan-engines/engine";
import { lighthouseLabMetrics } from "../lib/scan-engines/lighthouse";
import { linkIntegrity } from "../lib/scan-engines/link-integrity";
import { markup, markupFindings } from "../lib/scan-engines/markup";
import { makeFinding } from "../lib/score";
import { scoreLighthouseAudit } from "../lib/lighthouse-scoring";

const url = "https://app.example/";
const date = "2026-11-24T09:00:00Z";

describe("versioned scan engines", () => {
  it("keeps missing, blocked, and transient link responses distinct", async () => {
    const probe = vi.fn(async (target: string) => {
      const status = Number(new URL(target).pathname.slice(1));
      if (!status) throw new Error("timeout");
      return { status };
    });
    const paths = ["/404", "/410", "/401", "/403", "/429", "/500", "/200", "/timeout", "/logout", "/reset?token=private"];
    const result = await runEngine(linkIntegrity, {
      entryUrl: url, date, probe,
      targets: paths.map((path) => ({ url: new URL(path, url).href, priority: path === "/404" })),
    });
    expect(result.coverage.status).toBe("incomplete");
    expect(result.value?.findings.map((finding) => finding.severity).sort()).toEqual(["high", "medium"]);
    expect(result.value?.broken.sort()).toEqual(["https://app.example/404", "https://app.example/410"]);
    expect(result.value?.unknownCount).toBe(5);
    expect(probe).toHaveBeenCalledTimes(8);
  });

  it("retains combined evidence and one stable issue through version or query changes", () => {
    const issue = makeFinding({ category: "technical", severity: "high", title: "Missing language", evidence: "No language", why_it_matters: "Readers need the language", fix: "Set lang" });
    const first = recordFinding(issue, url + "?first=1", { engine: "accessibility", version: "4.14.1", ruleId: "html-has-lang" }, date, "document-language");
    const second = recordFinding({ ...issue, id: "built-in-language-check" }, url + "#another", { engine: "functionality", version: "1", ruleId: "lang" }, date, "document-language");
    expect(first.fingerprint).toBe(second.fingerprint);
    const merged = combineFindings([first, second]);
    expect(merged).toEqual([{ ...first, sources: [...first.sources!, ...second.sources!] }]);
    const suite = lighthouseLabMetrics(undefined, "mobile");
    const score = scoreLighthouseAudit({ findings: merged, checks: {}, mobile: suite, desktop: suite });
    expect(score.scoreBreakdown.categories.technical).toMatchObject({ count: 1, lost: 13 });
  });

  it("isolates faults and time limits", async () => {
    const engine: ScanEngine<undefined, undefined> = {
      id: "markup", version: "1", timeoutMs: 10,
      async run() { throw new Error("raw response must not reach report"); },
    };
    const failed = await runEngine(engine, undefined);
    expect(failed.coverage.status).toBe("unavailable");
    expect(failed.coverage.note).not.toContain("raw response");
    const timedOut = await runEngine({ ...engine, async run(_, signal) {
      return new Promise((_, reject) => {
        const fallback = setTimeout(() => reject(new Error("fallback")), 1000);
        signal.addEventListener("abort", () => { clearTimeout(fallback); reject(signal.reason); }, { once: true });
      });
    } }, undefined);
    expect(timedOut.coverage.status).toBe("incomplete");
    expect(timedOut.value).toBeUndefined();
  });

  it("uses TBT only for the new Lighthouse lab metric and keeps missing metrics unknown", () => {
    const lab = lighthouseLabMetrics({ lighthouseVersion: "13", audits: {
      "total-blocking-time": { numericValue: 35 },
      "interaction-to-next-paint": { numericValue: 99 },
      "first-contentful-paint": { numericValue: 950 },
      "unused-javascript": { details: { overallSavingsMs: 76.21 } },
    } }, "mobile");
    expect(lab.inpTbt.value).toBe(35);
    expect(lab.lcp.state).toBe("unknown");
    expect(lab.lab).toMatchObject({ version: "13", fcp: { value: 950 }, opportunities: [{ ruleId: "unused-javascript", estimatedMs: 76 }] });
  });

  it("keeps only selected markup evidence; raw messages stay out of the report", () => {
    const issues = markupFindings([
      { type: "error", message: "Duplicate ID secret", lastLine: 12 },
      { type: "info", message: "Duplicate ID warning" },
      { type: "error", message: "Stray doctype" },
    ], { html: "", url, date }, "26.11.20");
    expect(issues).toHaveLength(1);
    expect(JSON.stringify(issues)).not.toContain("secret");
    expect(issues[0].sources?.[0].elements?.[0].detail).toBe("Response HTML, line 12");
  });

  it.skipIf(!process.env.SCAN_NU_JAR)("runs the real Nu process with an invalid HTML fixture", async () => {
    const result = await runEngine(markup, {
      html: '<!doctype html><html lang="en"><title>Fixture</title><p id="duplicate">First</p><p id="duplicate">Second</p></html>',
      url, date,
    });
    expect(result.coverage.status).toBe("manual");
    expect(result.value?.some((issue) => issue.sources?.[0].ruleId === "duplicate-id")).toBe(true);
  }, 12_000);

  it("runs axe on rendered Chromium fixtures and ignores a fake main-world engine", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.setContent('<html lang="en"><head><title>Fixture</title></head><body><main><h1>Contact</h1><button id="submit"></button><script>window.axe={run:()=>({violations:[]})}</script></main></body></html>');
      const result = await runEngine(accessibility, { page, url, date, viewport: "mobile", rendered: true });
      expect(result.coverage.status).toBe("issues");
      const issue = result.value?.findings.find((finding) => finding.sources?.[0].ruleId === "button-name");
      expect(issue?.sources?.[0].elements?.[0]).toMatchObject({ selector: "#submit", snippet: "<button>", detail: "mobile" });
      await page.setContent('<html lang="en"><head><title>Fixture</title></head><body><main><h1>Contact</h1><button id="submit">Send message</button></main></body></html>');
      const corrected = await runEngine(accessibility, { page, url, date, viewport: "mobile", rendered: true });
      expect(corrected.value?.findings.some((finding) => finding.sources?.[0].ruleId === "button-name")).toBe(false);
      expect(corrected.value).toBeDefined();
    } finally {
      await browser.close();
    }
  }, 20_000);
});
