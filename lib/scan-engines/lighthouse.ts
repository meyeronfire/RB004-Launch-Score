import type { LighthouseStrategy, MetricCheck } from "../types";
import { safeFetch, currentScanSignal } from "../ssrf";
import type { ScanEngine } from "./engine";

type Audit = { numericValue?: number; details?: { overallSavingsMs?: number } };
type LighthouseResult = {
  lighthouseVersion?: string;
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, Audit>;
};

const opportunities = ["render-blocking-resources", "render-blocking-insight", "unused-javascript", "unused-css-rules", "uses-optimized-images", "image-delivery-insight", "total-byte-weight"];

export function lighthouseLabMetrics(result: LighthouseResult | undefined, strategy: string): LighthouseStrategy {
  const audits = result?.audits ?? {};
  const category = (key: string): MetricCheck => {
    const value = result?.categories?.[key]?.score;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
      ? { state: "checked", value: Math.round(value * 100) }
      : { state: "unknown", note: `Lighthouse did not return the ${key} score for ${strategy}.` };
  };
  const audit = (key: string): MetricCheck => {
    const value = audits[key]?.numericValue;
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? { state: "checked", value: key === "cumulative-layout-shift" ? value : Math.round(value) }
      : { state: "unknown", note: "Lighthouse did not return this lab metric." };
  };
  return {
    performance: category("performance"),
    accessibility: category("accessibility"),
    bestPractices: category("best-practices"),
    seo: category("seo"),
    lcp: audit("largest-contentful-paint"),
    cls: audit("cumulative-layout-shift"),
    inpTbt: audit("total-blocking-time"),
    ...(result && { lab: {
      version: result.lighthouseVersion,
      fcp: audit("first-contentful-paint"),
      speedIndex: audit("speed-index"),
      opportunities: opportunities.flatMap((ruleId) => {
        const est = audits[ruleId]?.details?.overallSavingsMs;
        return typeof est === "number" && Number.isFinite(est) && est > 0 ? [{ ruleId, estimatedMs: Math.round(est) }] : [];
      }),
    } }),
  };
}

type PsiStrategy = LighthouseStrategy;
const unknown = (note: string): MetricCheck => ({ state: "unknown", note });
export const missingPsiStrategy = (note: string): PsiStrategy => ({ performance: unknown(note), accessibility: unknown(note), bestPractices: unknown(note), seo: unknown(note), lcp: unknown(note), cls: unknown(note), inpTbt: unknown(note) });
const PAGESPEED_TIMEOUT_MS = 100_000;
export async function psiMetrics(url: string, strategy: "mobile" | "desktop") {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    console.warn("PageSpeed Insights is unavailable: PAGESPEED_API_KEY is not configured.");
    return missingPsiStrategy("PageSpeed Insights is not configured for this scan.");
  }
  for (let attempt = 1; attempt <= 2; attempt++) try {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 650));
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url); endpoint.searchParams.set("strategy", strategy); endpoint.searchParams.set("key", apiKey);
    for (const category of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) endpoint.searchParams.append("category", category);
    const response = await safeFetch(endpoint.toString(), { timeoutMs: PAGESPEED_TIMEOUT_MS, maxBytes: 1_500_000, maxRedirects: 0 });
    if (response.status < 200 || response.status >= 300) {
      let apiMessage = "";
      try { apiMessage = String((JSON.parse(response.body.toString("utf8")) as { error?: { status?: string; message?: string } }).error?.message ?? ""); } catch { /* Keep status as the diagnostic when the provider response is not JSON. */ }
      const detail = apiMessage.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]").replace(/https?:\/\/\S+/gi, "[url]").replace(/AIza[\w-]{20,}/g, "[redacted]").slice(0, 200);
      throw new Error(`HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
    }
    const data = JSON.parse(response.body.toString("utf8")) as { lighthouseResult?: Parameters<typeof lighthouseLabMetrics>[0] };
    return lighthouseLabMetrics(data.lighthouseResult, strategy);
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]").replace(/([?&]url=)[^&\s]+/gi, "$1[redacted]").slice(0, 180) : "Unknown error";
    console.error("PageSpeed Insights API error", { strategy, attempt, error: detail });
    if (currentScanSignal()?.aborted) return missingPsiStrategy(`PageSpeed Insights was cancelled when the scan ended during the ${strategy} run.`);
    const timedOut = error instanceof Error && /too long to respond|exceeded its time limit/i.test(error.message);
    if (timedOut || attempt === 2) return missingPsiStrategy(timedOut
      ? `PageSpeed Insights timed out during the ${strategy} run. Retry Lighthouse to try again.`
      : `PageSpeed Insights could not complete the ${strategy} run.`);
  }
  return missingPsiStrategy("PageSpeed Insights did not return a result.");
}

export const performanceEngine: ScanEngine<string, [PsiStrategy, PsiStrategy]> = {
  id: "performance", version: "Lighthouse via PageSpeed Insights", timeoutMs: 80_000,
  async run(url, signal) {
    const mobilePromise = psiMetrics(url, "mobile");
    const desktopPromise = process.env.SCAN_LIGHTHOUSE_MOBILE_ONLY === "1"
      ? Promise.resolve(missingPsiStrategy("Desktop Lighthouse is available on request."))
      : psiMetrics(url, "desktop");
    const value = await Promise.all([mobilePromise, desktopPromise]);
    signal.throwIfAborted();
    const measured = value.filter((strategy) => strategy.performance.state === "checked");
    return {
      value,
      version: value[0].lab?.version ?? value[1].lab?.version,
      status: measured.length === 2 ? "passed" : measured.length ? "incomplete" : "unavailable",
      note: "Simulated Lighthouse lab data; field Core Web Vitals are not measured.",
    };
  },
};
