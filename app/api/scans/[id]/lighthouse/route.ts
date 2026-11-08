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
  const current = await readScan(id);
  if (!current) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (current.status !== "complete") return Response.json({ error: "The report is not ready yet." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (!process.env.PAGESPEED_API_KEY) {
    console.warn("PageSpeed retry unavailable: PAGESPEED_API_KEY is not configured.");
    return Response.json({ error: "Lighthouse is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (inFlight.has(id)) return Response.json({ error: "A Lighthouse retry is already running." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  let cooldownClaimed = false;
  try { cooldownClaimed = await claimScopedCooldown(`lighthouse:${id}`, 60_000); }
  catch { return Response.json({ error: "Lighthouse is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!cooldownClaimed) return Response.json({ error: "Please wait before retrying Lighthouse for this report." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  inFlight.add(id);
  const target = current.finalUrl ?? current.url;
  try {
    const [freshMobile, freshDesktop] = await Promise.all([psiMetrics(target, "mobile"), psiMetrics(target, "desktop")]);
    const fresh = [...Object.values(freshMobile), ...Object.values(freshDesktop)];
    if (fresh.every((metric) => metric.state === "unknown")) return Response.json({ report: publicScan(current), unavailable: true }, { headers: { "Cache-Control": "no-store" }, status: 503 });
    const merge = (incoming: LighthouseStrategy, existing?: LighthouseStrategy): LighthouseStrategy => Object.fromEntries(Object.entries(incoming).map(([key, metric]) => [key, metric.state === "checked" ? metric : existing?.[key as keyof LighthouseStrategy] ?? metric])) as LighthouseStrategy;
    const mobile = merge(freshMobile, current.lighthouse?.mobile); const desktop = merge(freshDesktop, current.lighthouse?.desktop);
    const checks = { ...(current.checks ?? {}), pageSpeedMobile: mobile.performance, pageSpeedDesktop: desktop.performance, lighthouseMobileAccessibility: mobile.accessibility, lighthouseDesktopAccessibility: desktop.accessibility, lighthouseMobileBestPractices: mobile.bestPractices, lighthouseDesktopBestPractices: desktop.bestPractices, lighthouseMobileSeo: mobile.seo, lighthouseDesktopSeo: desktop.seo, lcpMobile: mobile.lcp, clsMobile: mobile.cls, inpTbtMobile: mobile.inpTbt, lcpDesktop: desktop.lcp, clsDesktop: desktop.cls, inpTbtDesktop: desktop.inpTbt };
    const scored = scoreLighthouseAudit({ findings: current.findings ?? [], checks, mobile, desktop, designReview: current.designReview });
    const next = await updateScan(id, (scan) => ({ ...scan, lighthouse: { mobile, desktop, source: "via Google PageSpeed Insights" }, checks, categoryCoverage: scored.categoryCoverage, score: scored.score, categoryScores: scored.categoryScores, scoreBreakdown: scored.scoreBreakdown, scoringVersion: 3, updatedAt: new Date().toISOString() }));
    if (!next) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const unavailable = [...Object.values(mobile), ...Object.values(desktop)].every((metric) => metric.state === "unknown");
    return Response.json({ report: publicScan(next), unavailable }, { headers: { "Cache-Control": "no-store" }, status: unavailable ? 503 : 200 });
  } finally { inFlight.delete(id); }
}
