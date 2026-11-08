import { claimScopedCooldown, rateLimit } from "@/lib/rate-limit";
import { psiMetrics } from "@/lib/scanner";
import { publicScan, readScan, updateScan } from "@/lib/store";
import { scoreLighthouseAudit } from "@/lib/lighthouse-scoring";
import type { LighthouseStrategy } from "@/lib/types";

const inFlight = new Set<string>();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, context: RouteContext<"/api/scans/[id]/lighthouse">) {
  const limit = await rateLimit(request, "lighthouse-retry");
  if (limit.misconfigured) return Response.json({ error: "Service unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!limit.allowed) return Response.json({ error: "Please try again later." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { strategy?: unknown };
  const strategy = body.strategy === undefined ? "mobile" : body.strategy;
  if (strategy !== "mobile" && strategy !== "desktop") return Response.json({ error: "Choose a mobile or desktop Lighthouse strategy." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const current = await readScan(id);
  if (!current) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (current.status !== "complete") return Response.json({ error: "The report is not ready yet." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (!process.env.PAGESPEED_API_KEY) {
    console.warn("PageSpeed retry unavailable: PAGESPEED_API_KEY is not configured.");
    return Response.json({ error: "Lighthouse is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (inFlight.has(id)) return Response.json({ error: "A Lighthouse retry is already running." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  let cooldownClaimed = false;
  try { cooldownClaimed = await claimScopedCooldown(`lighthouse:${id}:${strategy}`, 60_000); }
  catch { return Response.json({ error: "Lighthouse is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!cooldownClaimed) return Response.json({ error: "Please wait before retrying this Lighthouse strategy." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  inFlight.add(id);
  const target = current.finalUrl ?? current.url;
  try {
    const fresh = await psiMetrics(target, strategy);
    if (Object.values(fresh).every((metric) => metric.state === "unknown")) {
      const message = Object.values(fresh).find((metric) => metric.state === "unknown" && metric.note)?.note ?? `PageSpeed did not return ${strategy} results.`;
      return Response.json({ report: publicScan(current), unavailable: true, message }, { headers: { "Cache-Control": "no-store" }, status: 503 });
    }
    const merge = (incoming: LighthouseStrategy, existing?: LighthouseStrategy): LighthouseStrategy => Object.fromEntries(Object.entries(incoming).map(([key, metric]) => [key, metric.state === "checked" ? metric : existing?.[key as keyof LighthouseStrategy] ?? metric])) as LighthouseStrategy;
    const empty: LighthouseStrategy = { performance: { state: "unknown", note: "This strategy has not been refreshed." }, accessibility: { state: "unknown", note: "This strategy has not been refreshed." }, bestPractices: { state: "unknown", note: "This strategy has not been refreshed." }, seo: { state: "unknown", note: "This strategy has not been refreshed." }, lcp: { state: "unknown", note: "This strategy has not been refreshed." }, cls: { state: "unknown", note: "This strategy has not been refreshed." }, inpTbt: { state: "unknown", note: "This strategy has not been refreshed." } };
    const mobile = strategy === "mobile" ? merge(fresh, current.lighthouse?.mobile) : current.lighthouse?.mobile ?? empty;
    const desktop = strategy === "desktop" ? merge(fresh, current.lighthouse?.desktop) : current.lighthouse?.desktop ?? empty;
    const checks = { ...(current.checks ?? {}), pageSpeedMobile: mobile.performance, pageSpeedDesktop: desktop.performance, lighthouseMobileAccessibility: mobile.accessibility, lighthouseDesktopAccessibility: desktop.accessibility, lighthouseMobileBestPractices: mobile.bestPractices, lighthouseDesktopBestPractices: desktop.bestPractices, lighthouseMobileSeo: mobile.seo, lighthouseDesktopSeo: desktop.seo, lcpMobile: mobile.lcp, clsMobile: mobile.cls, inpTbtMobile: mobile.inpTbt, lcpDesktop: desktop.lcp, clsDesktop: desktop.cls, inpTbtDesktop: desktop.inpTbt };
    const scored = scoreLighthouseAudit({ findings: current.findings ?? [], checks, mobile, desktop, designReview: current.designReview });
    const next = await updateScan(id, (scan) => ({ ...scan, lighthouse: { mobile, desktop, source: "via Google PageSpeed Insights" }, checks, categoryCoverage: scored.categoryCoverage, score: scored.score, categoryScores: scored.categoryScores, scoreBreakdown: scored.scoreBreakdown, scoringVersion: 3, updatedAt: new Date().toISOString() }), current.leaseToken);
    if (!next) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ report: publicScan(next), unavailable: false }, { headers: { "Cache-Control": "no-store" } });
  } finally { inFlight.delete(id); }
}
