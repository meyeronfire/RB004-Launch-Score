"use client";

import { lighthouseChecks } from "@/lib/lighthouse-fields";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { RELEASE_CODE, PRICE_FIX_PROMPT_USD, PRODUCT_NAME } from "@/config/release";
import { track } from "@/lib/analytics-client";
import type { Finding } from "@/lib/types";
import { TechnicalReportSections, ReportSharePreview } from "@/components/technical-report-sections";
import { GlassCard } from "@/components/glass-card";
import { ScanForm } from "@/components/scan-form";
import { CATEGORY_WEIGHTS } from "@/config/scoring";
import type { Category } from "@/lib/types";
import { getCheckLedger, getCategoryCheckStats, type CheckStatus } from "@/lib/report-artifacts";
import { findingResult } from "@/lib/finding-result";
import { ScrollReveal } from "@/components/scroll-reveal";
import { promptVariants } from "@/lib/fix-prompts";
import { exampleReport } from "@/lib/example";
import { ReportArtifactActions } from "@/components/report-artifact-actions";
import { ReportFinding } from "@/components/report-finding";
import { ReportOtherChecks } from "@/components/report-other-checks";
import { PaidReportSection } from "@/components/paid-report-section";
import { SiteFooter } from "@/components/site-footer";
import { categoryAccent } from "@/lib/report-visuals";

type FreeReport = ReturnType<typeof import("@/lib/store").publicScan>;
const labels: Record<Category, string> = { clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust", technical: "Technical", security: "Security", seo_aeo: "SEO / AEO" };
const categoryOrder = Object.keys(CATEGORY_WEIGHTS) as Category[];
const scoreDisplay = (score?: number) => typeof score === "number" ? String(score).padStart(2, "0") : "—";
const formatUtc = (value?: string, options?: Intl.DateTimeFormatOptions) => value ? `${new Date(value).toLocaleString("en-GB", { ...options, timeZone: "UTC" })} UTC` : "Time unavailable";
function examplePaidData() {
  const findings = exampleReport.findings ?? [];
  const copyDrafts = { status: "Page-copy drafts were not generated for this historical sample scan.", headlines: [] as string[], subheadline: "", cta: "", faq: "", metaTitle: "", metaDescription: "" };
  return {
    available: true,
    findings,
    prompts: promptVariants({ url: exampleReport.finalUrl ?? exampleReport.url, title: exampleReport.title ?? "", stack: exampleReport.stackHints ?? [], findings, copyDrafts, scannedAt: exampleReport.createdAt, scoringVersion: exampleReport.scoringVersion }),
    copyDrafts,
  };
}

export function ReportClient({ initial }: { initial: FreeReport }) {
  const params = useParams<{ id: string }>(); const searchParams = useSearchParams();
  const id = params.id;
  const paidPreview = id === "example" && searchParams.get("paidPreview") === "1";
  const [scan, setScan] = useState(initial as FreeReport & { findings?: Finding[]; lockedTitles?: string[]; lockedCount?: number; paidRescansRemaining?: number | null });
  const [paidData, setPaidData] = useState<{ available: boolean; findings: Finding[]; prompts: Record<string, string>; copyDrafts: { status: string; headlines: string[]; subheadline: string; cta: string; faq: string; metaTitle: string; metaDescription: string } } | undefined>(() => paidPreview ? examplePaidData() : undefined);
  const [paidStatus, setPaidStatus] = useState("");
  const [shareStatus, setShareStatus] = useState(""); const [emailStatus, setEmailStatus] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false); const [checkoutMessage, setCheckoutMessage] = useState(""); const [checkoutSection, setCheckoutSection] = useState("");
  const [accessStatus, setAccessStatus] = useState("");
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const checkoutAvailable = Boolean(scan.checkoutAvailable && !scan.paidRescanAvailable && !scan.founderPreview);
  useEffect(() => {
    if (scan.id === "example" || ["queued", "scanning"].includes(scan.status)) return;
    let cancelled = false;
    void fetch(`/api/scans/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (response) => {
      if (response.ok && !cancelled) setScan(await response.json());
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, scan.id, scan.status]);
  useEffect(() => {
    if (["queued", "scanning"].includes(scan.status)) {
      const timer = setInterval(async () => {
        try { const response = await fetch(`/api/scans/${encodeURIComponent(id)}`, { cache: "no-store" }); if (response.ok) { const next = await response.json(); setScan(next); } } catch { /* transient polling error; next interval will retry */ }
      }, 1100);
      return () => clearInterval(timer);
    }
  }, [id, scan.status]);
  useEffect(() => {
    if (scan.status === "complete" && scan.id !== "example" && (scan.paidAvailable || scan.paidReportPending) && typeof window !== "undefined") {
      let cancelled = false;
      let attempts = 0; let retryTimer: ReturnType<typeof setTimeout> | undefined;
      const loadPaidReport = async () => {
        try {
          let response = scan.founderPreview
            ? await fetch(`/admin/api/scans/${encodeURIComponent(id)}/paid`, { cache: "no-store" })
            : await fetch(`/api/scans/${encodeURIComponent(id)}/paid`, { cache: "no-store" });
          if (scan.founderPreview && [401, 403].includes(response.status)) {
            response = await fetch(`/api/scans/${encodeURIComponent(id)}/paid`, { cache: "no-store" });
          }
          if (response.status === 202 && !cancelled) {
            setPaidStatus(attempts < 20 ? "Your paid report is being prepared." : "Your report is still preparing. Check back shortly.");
            if (attempts++ < 20) retryTimer = setTimeout(loadPaidReport, 3000);
            return;
          }
          if (response.ok && !cancelled) {
            const result = await response.json() as NonNullable<typeof paidData>;
            result.prompts = promptVariants({ url: scan.finalUrl ?? scan.url, title: scan.title ?? "", stack: scan.stackHints ?? [], findings: result.findings, copyDrafts: result.copyDrafts, scannedAt: scan.createdAt, scoringVersion: scan.scoringVersion });
            setPaidData(result); setPaidStatus("");
          }
        } catch { /* a later retry or refresh can recover */ }
      };
      void loadPaidReport();
      return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
    }
  }, [id, scan.createdAt, scan.finalUrl, scan.founderPreview, scan.id, scan.paidAvailable, scan.paidReportPending, scan.scoringVersion, scan.stackHints, scan.status, scan.title, scan.url]);
  const completed = scan.status === "complete";
  useEffect(() => {
    if (!completed || typeof scan.score !== "number") return;
    try {
      const key = `rb004-pending-scan:${id}`;
      if (sessionStorage.getItem(key)) {
        sessionStorage.removeItem(key);
        track("scan_done", { score: scan.score });
      }
    } catch { /* Optional analytics must not affect report access. */ }
  }, [completed, id, scan.score]);
  useEffect(() => {
    if (!completed || typeof scan.score !== "number" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const score = scan.score;
    const start = performance.now();
    let frame: number;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / 650);
      setAnimatedScore(Math.round(score * (1 - Math.pow(1 - progress, 4))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [completed, scan.score]);
  const contentUnavailable = !scan.checks?.contentReview || scan.checks.contentReview.state === "unknown";
  const speedUnavailable = !scan.lighthouse || [...lighthouseChecks(scan.lighthouse.mobile), ...lighthouseChecks(scan.lighthouse.desktop)].every((metric) => metric.state === "unknown");
  const partial = contentUnavailable || speedUnavailable || Object.values(scan.categoryCoverage ?? {}).some((coverage) => coverage < 1);
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href.split("?")[0]); setShareStatus("Link copied."); track("share_clicked", { destination: "copy" }); } catch { setShareStatus("Your browser could not copy the link."); }
  }
  function openShare(kind: "x" | "linkedin") {
    track("share_clicked", { destination: kind });
    const url = window.location.href.split("?")[0];
    const target = kind === "x" ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${scan.score}/100 ${PRODUCT_NAME} for ${scan.domain} · ${RELEASE_CODE}`)}&url=${encodeURIComponent(url)}` : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }
  async function checkout(section = "") {
    setCheckoutSection(section); setCheckoutMessage(""); setCheckoutPending(true);
    try {
      let attribution: unknown;
      try { attribution = JSON.parse(sessionStorage.getItem(`rb004-attribution:${id}`) ?? "null"); } catch { attribution = undefined; }
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, attribution }) });
      const result = await response.json(); if (!response.ok || !result.url) throw new Error(result.error ?? "Checkout could not be started.");
      track("checkout_started");
      window.location.href = result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout could not be started.";
      setCheckoutMessage(/not configured|configuration|database|REPORT_TOKEN_ENCRYPTION_KEY|RESEND_API_KEY|STRIPE_/i.test(message) ? "Unlock is temporarily unavailable. Try again later." : message);
      setCheckoutPending(false);
    }
  }
  async function retryLighthouse(strategy: "mobile" | "desktop") {
    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(id)}/lighthouse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strategy }), cache: "no-store" });
      const result = await response.json();
      if (result.report) setScan(result.report);
      return response.ok && !result.unavailable ? null : result.message ?? result.error ?? `PageSpeed could not return ${strategy} results. Try again later.`;
    } catch { return "Could not contact PageSpeed. Check your connection and try again."; }
  }
  async function submitLead(form: FormData) {
    setEmailStatus("");
    try { const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, email: form.get("email") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The email could not be saved."); setEmailStatus(result.emailed ? "Saved. Your free report link is on its way." : "Saved, but the email could not be sent. Keep this report link."); }
    catch (error) { setEmailStatus(error instanceof Error ? error.message : "The email could not be saved."); }
  }
  async function requestAccess(form: FormData) {
    setAccessStatus("");
    try {
      const response = await fetch("/api/report-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, email: form.get("email") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
      setAccessStatus(result.message ?? "If that email belongs to an active purchase, a secure link will be sent.");
    } catch (error) { setAccessStatus(error instanceof Error ? error.message : "The request could not be completed."); }
  }
  const findings = scan.findings ?? [];
  const freeFindings = [...findings, ...(scan.additionalFindings ?? [])];
  const recommendationFindings = paidData?.findings ?? freeFindings;
  const [recommendationFilter, setRecommendationFilter] = useState<"all" | "confirmed" | "review">("all");
  const captureLink = (finding: Pick<Finding, "category" | "title">) => {
    const visibleContext = ["clarity", "conversion", "design_brand", "trust"].includes(finding.category)
      || /viewport|overflow|tap target|touch target|contrast|layout/i.test(finding.title);
    if (!visibleContext) return undefined;
    if (/mobile|tap target|touch target/i.test(finding.title) && scan.mobileImage) return "#mobile-evidence";
    return scan.desktopImage ? "#desktop-evidence" : scan.mobileImage ? "#mobile-evidence" : undefined;
  };
  const firstNeedsReview = findings.length > 0 && findingResult(findings[0]) === "Needs review";
  const checkLedger = getCheckLedger(scan.checks, paidData?.findings ?? freeFindings);
  const checkCounts = checkLedger.reduce<Record<CheckStatus, number>>((counts, row) => { counts[row.status] += 1; return counts; }, { pass: 0, issue: 0, review: 0, unknown: 0, not_recorded: 0, not_applicable: 0, measured: 0 });
  const categoryStats = getCategoryCheckStats(scan.checks, paidData?.findings ?? freeFindings, scan.categoryScores);
  const recommendationCounts = {
    confirmed: recommendationFindings.filter((finding) => findingResult(finding) === "Confirmed issue").length,
    review: recommendationFindings.filter((finding) => findingResult(finding) !== "Confirmed issue").length,
  };
  const confirmedFindings = recommendationFindings.filter((finding) => findingResult(finding) === "Confirmed issue");
  const launchCounts = {
    critical: confirmedFindings.filter((finding) => finding.severity === "critical").length,
    warnings: confirmedFindings.filter((finding) => finding.severity !== "critical").length,
    passed: checkCounts.pass,
    review: recommendationFindings.length - confirmedFindings.length,
  };
  const visibleRecommendations = recommendationFindings.filter((finding) => recommendationFilter === "all" || (recommendationFilter === "confirmed" ? findingResult(finding) === "Confirmed issue" : findingResult(finding) !== "Confirmed issue"));
  const reportCounts = { checksRun: checkCounts.pass + checkCounts.issue, passed: checkCounts.pass, issues: checkCounts.issue };
  const unscoredCategories = categoryOrder.filter((key) => typeof scan.categoryScores?.[key] !== "number");
  const completedPhases = (scan.phaseHistory ?? []).filter((phase) => phase !== scan.phase);
  const paidReportSection = paidData ? <PaidReportSection scan={scan} paidData={paidData} /> : null;
  const paidReportOffer = scan.id !== "example" && !paidData && scan.paidAvailable && !scan.paidRescanAvailable && !scan.founderPreview ? <section className="wrap report-unlock-offer" id="unlock" aria-label="Unlock the launch plan and full report">
    <div>
      <p className="mono report-unlock-label">PERSONALIZED LAUNCH PLAN + CODING PROMPTS · ${PRICE_FIX_PROMPT_USD} · ONE‑TIME</p>
      <p>Get a prioritized launch checklist, page-copy drafts, one focused coding-agent prompt per finding, and a complete prompt that brings the fixes together.</p>
      <p className="mono report-unlock-note">ONE URL · TWO FRESH RE-SCANS IN SEVEN DAYS · NO SUBSCRIPTION · CURSOR, CLAUDE CODE, CODEX &amp; MORE</p>
    </div>
    <div className="report-unlock-action">
      {checkoutAvailable
        ? <button className="inline-unlock" type="button" onClick={() => void checkout("report")} disabled={checkoutPending}>{checkoutPending && checkoutSection === "report" ? "Opening checkout…" : `Unlock full report — $${PRICE_FIX_PROMPT_USD}`}</button>
        : <p className="inline-status" role="status">{scan.paidRescanAvailable
          ? "This report is included in your purchase. Your personalized plan is loading."
          : scan.paidAvailable
            ? "The personalized plan is ready, but checkout is temporarily unavailable. No payment was taken."
            : "The personalized plan and prompts could not be prepared for this scan because the AI review was incomplete. Checkout is unavailable for this report, and no payment was taken. You can still email yourself the free report below."}</p>}
      {checkoutMessage && checkoutSection === "report" && <p className="inline-status" role="status">{checkoutMessage}</p>}
    </div>
  </section> : null;
  const paidReportLoading = scan.id !== "example" && !paidData && (scan.paidRescanAvailable || scan.founderPreview) ? <section className="wrap report-plan-loading" id="unlock" aria-live="polite"><span className="mono">{scan.founderPreview ? "FOUNDER PREVIEW · NO PAYMENT" : "PURCHASED REPORT"}</span><p>Your personalized plan is loading and is included. No payment is needed.</p></section> : null;
  const paidReportUnavailable = scan.id !== "example" && !paidData && !scan.paidAvailable && !scan.paidRescanAvailable && !scan.founderPreview ? <section className="wrap report-plan-unavailable" id="unlock" aria-labelledby="report-plan-unavailable-title">
    <div><span className="mono">PERSONALIZED LAUNCH PLAN</span><h2 id="report-plan-unavailable-title">Not available for this scan.</h2><p>The free audit is ready, but we couldn’t prepare its personalized plan. Checkout is unavailable and nothing was charged. Your findings are still available above.</p></div>
    <div className="report-plan-unavailable-actions"><a href="#email-report">Email the free report</a><Link href={`/?url=${encodeURIComponent(scan.url)}`}>Try another scan</Link></div>
  </section> : null;

  return <main className="report-page">
    <ScrollReveal selectors=".depth-section, .categories-section, .findings-section, .capture-section, .category-row, .check-evidence > div, .finding-glass-shell, .speed-insights > div" />
    <header className="wrap masthead"><Link className="brand" href="/" aria-label="Ready for Real home"><Image className="brand-icon" src="/r4r-logo.jpg" alt="" width={40} height={40} priority /><span className="brand-name">Ready for Real<span className="brand-dot">.</span></span><span className="brand-sub">Launch Readiness</span></Link><span className="mast-meta">{scan.domain ?? "PAGE REVIEW"}</span></header>
    {paidPreview && <p className="wrap coverage-note"><strong>NO-CHARGE PAID-PAGE PREVIEW · HISTORICAL REGULARBASIS.STUDIO SCAN</strong><br/>Demo based on a scan from 31 October 2026. No real purchase or report access is changed.</p>}
    {!completed && scan.status !== "failed" && <section className="wrap scan-progress" aria-live="polite">
      <h1>{scan.phase}</h1>
      <ol className="progress-log">
        {completedPhases.map((phase) => <li className="done mono" key={phase}>{phase}</li>)}
        <li className="active mono" aria-current="step"><span className="live-dot" aria-hidden="true"/>{scan.phase}</li>
      </ol>
    </section>}
    {scan.status === "failed" && <section className="wrap scan-progress scan-failed"><span className="mono progress-label">SCAN STOPPED</span><h1>This page could not be reviewed.</h1><p>{scan.error ?? "The page could not be reached. Check the URL and try again."}</p><ScanForm initialUrl={scan.url} submitLabel="Retry scan" /><Link className="text-link" href="/">Try a different page →</Link></section>}
    {completed && <>
      <section className="wrap report-hero">
        <div className="report-domain">{scan.domain} <span>·</span> {scan.id === "example" ? "EXAMPLE REPORT · 31 OCT 2026" : scan.createdAt ? `SCANNED ${formatUtc(scan.createdAt, { dateStyle: "medium", timeStyle: "short" })}` : "SCAN DATE UNAVAILABLE"}</div>
        <h1 className="report-heading">Launch page audit</h1>
        <nav className="report-jump-nav" aria-label="Jump to report section">
          <a href={recommendationFindings.length ? "#top-fixes" : "#categories"}>Findings <span>{recommendationFindings.length}</span></a>
          <a href="#categories">Categories <span>7</span></a>
          <a href="#page-evidence">Page evidence</a>
          <a href="#lighthouse-title">Technical checks</a>
          <a href={paidData ? "#launch-plan" : scan.id === "example" ? "#use-report" : "#unlock"}>{paidData ? "Launch plan" : "Full plan"}</a>
        </nav>
        <div className="report-summary-grid">
        <GlassCard className="score-overview" shellClassName="report-score-shell" glow={false}>
          <div className="summary-score-head"><span className="mono">READY FOR REAL SCORE</span><span className="summary-complete-state"><i aria-hidden="true"/> Scan completed</span></div>
          <div className="score-line" role="img" aria-label={typeof scan.score === "number" ? `${PRODUCT_NAME}: ${scan.score} out of 100` : `${PRODUCT_NAME} score unavailable`}><span className="score-number" aria-hidden="true">{scoreDisplay(animatedScore ?? scan.score)}</span>{typeof scan.score === "number" && <span className="score-denom" aria-hidden="true">/100</span>}</div>
          <p className="coverage-note score-coverage">{partial ? "Some checks could not be confirmed; this score reflects the recorded evidence." : "This score summarizes recorded checks across seven launch-page categories."} Unknown checks do not add points.</p>
          <p className="scan-counts-line">{reportCounts.checksRun} checks with a pass/fail result · {reportCounts.passed} passed · {reportCounts.issues} flagged · {checkCounts.review} need review</p>
          <div className="launch-readiness-summary" aria-label="Launch readiness summary">
            <h2>Are you ready to launch?</h2>
            <div className="launch-readiness-counts">
              <span><strong>{launchCounts.critical}</strong> critical</span><span><strong>{launchCounts.warnings}</strong> warnings</span><span><strong>{launchCounts.passed}</strong> checks passed</span><span><strong>{launchCounts.review}</strong> need review</span>
            </div>
            <p>All {recommendationFindings.length} findings are listed below in priority order. Review the evidence before changing your page.</p>
          </div>
          <details className="summary-scan-details"><summary>Scan details and coverage</summary><div><p>{reportCounts.checksRun} checks with a pass/fail result · {checkCounts.review} need review · {checkCounts.unknown} unknown · {checkCounts.not_recorded} not recorded · {checkCounts.not_applicable} not applicable · {checkCounts.measured} informational.</p><p>“Not recorded” means the scan did not capture that configured check. “Unknown” means it attempted the check but could not confirm a result. A measured value is informational and does not imply a pass.</p><p>HTTP response: {scan.checks?.status?.value ?? "Unavailable"} · Redirects: {scan.checks?.redirects?.value ?? "Unavailable"}</p></div></details>
          {searchParams.get("checkout") === "complete" && <p className="inline-status" role="status">Your checkout returned to this report. Once the payment is verified, we’ll email a secure purchaser link for the full report.</p>}
          {searchParams.get("checkout") === "cancelled" && <p className="inline-status" role="status">Checkout was cancelled. Your free report is still available here.</p>}
        </GlassCard>
        <div className="overview-categories" aria-label="Seven category scores">{categoryOrder.map((key) => { const score = scan.categoryScores?.[key]; const stats = categoryStats[key]; return <div className="overview-category" data-category={key} style={{ "--category-accent": categoryAccent(key) } as React.CSSProperties} key={key}><div className="overview-category-label"><span>{labels[key]}</span><strong className="mono">{typeof score === "number" ? `${score}/100` : "Unavailable"}</strong></div><span className={`overview-category-track${typeof score === "number" ? "" : " is-unavailable"}`} aria-hidden="true"><i style={{ width: `${typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0}%` }}/></span><small>{stats.issue} issue{stats.issue === 1 ? "" : "s"} · {stats.review} review · {stats.unknown} unknown · {stats.not_recorded} not recorded</small></div>; })}</div>
        </div>
        <div className="overview-verdict"><div><span className="mono">EVIDENCE-BASED SUMMARY</span><p>{findings.length ? <>{firstNeedsReview ? "First recorded finding needs verification: " : "First recorded priority: "}<strong>{findings[0].title}</strong>{firstNeedsReview ? ". Confirm the behavior before changing the page." : ". Its recorded evidence and next step are below."} All {recommendationFindings.length} recorded findings are shown below.</> : partial ? "Some evidence is unavailable or needs review. Open the category results to see what was recorded." : "No score-losing finding was recorded. The result reflects this scan’s checks only."}</p></div><a className="primary-action summary-next-action" href={recommendationFindings.length ? "#top-fixes" : "#categories"}>{recommendationFindings.length ? `Review all ${recommendationFindings.length} findings` : "Explore category checks"}</a></div>
        {unscoredCategories.length > 0 && <p className="coverage-note category-legacy-note">Scores not recorded for this saved report: {unscoredCategories.map((category) => labels[category]).join(", ")}. Historical reports are not rescored automatically.</p>}
      </section>
      {recommendationFindings.length > 0 && <section className="wrap findings-section" id="top-fixes" aria-labelledby="findings-title">
        <div className="report-section-title"><div><h2 id="findings-title">Findings for this page.</h2><p>All {recommendationFindings.length} recorded findings are visible below, ordered by priority. Open technical details for rule IDs, source checks, and scoring.</p></div><span className="mono">{recommendationFindings.length} FINDINGS</span></div>
        <div className="recommendation-tabs" role="group" aria-label="Filter recommendations">
          {([ ["all", "All findings", recommendationFindings.length], ["confirmed", "Confirmed", recommendationCounts.confirmed], ["review", "Needs review", recommendationCounts.review] ] as const).map(([filter, label, count]) => <button type="button" key={filter} className={recommendationFilter === filter ? "is-active" : ""} aria-pressed={recommendationFilter === filter} onClick={() => setRecommendationFilter(filter)}>{label}<span>{count}</span></button>)}
        </div>
        <p className="finding-filter-status" aria-live="polite">Showing {visibleRecommendations.length} of {recommendationFindings.length} findings</p>
        <div className="finding-list top-recommendation-list">{visibleRecommendations.map((item) => <ReportFinding key={item.id} finding={item as React.ComponentProps<typeof ReportFinding>["finding"]} index={recommendationFindings.findIndex((finding) => finding.id === item.id)} scoringVersion={scan.scoringVersion} evidenceAvailable={Boolean(captureLink(item))} evidenceHref={captureLink(item)}/>)}</div>
      </section>}
      {paidReportOffer ?? paidReportLoading ?? paidReportUnavailable}
      {paidReportSection}
      <section className="wrap capture-section" id="page-evidence" aria-label="Rendered page previews">
        <div className="report-section-title"><h2>Page evidence.</h2><span className="mono">CAPTURED RENDERS · NOT PROOF OF INVISIBLE BEHAVIOR</span></div>
        {scan.desktopImage || scan.mobileImage ? <div className="capture-grid">{scan.desktopImage && <figure id="desktop-evidence"><a className="capture-open" href={scan.desktopImage} target="_blank" rel="noreferrer" aria-label={`Open full desktop capture of ${scan.domain}`}><Image src={scan.desktopImage} alt={`Desktop rendering of ${scan.domain}`} width={1440} height={900} unoptimized loading="eager"/></a><figcaption className="mono">DESKTOP · 1440 × 900 · scan time {formatUtc(scan.createdAt)} <a className="capture-return" href={scan.desktopImage} target="_blank" rel="noreferrer">Open full capture ↗</a></figcaption></figure>}{scan.mobileImage && <figure id="mobile-evidence"><a className="capture-open capture-open-mobile" href={scan.mobileImage} target="_blank" rel="noreferrer" aria-label={`Open full mobile capture of ${scan.domain}`}><Image src={scan.mobileImage} alt={`Mobile rendering of ${scan.domain}`} width={390} height={844} unoptimized loading="eager"/></a><figcaption className="mono">MOBILE · 390 × 844 · scan time {formatUtc(scan.createdAt)} <a className="capture-return" href={scan.mobileImage} target="_blank" rel="noreferrer">Open full capture ↗</a></figcaption></figure>}</div> : <p className="coverage-note">No screenshot was recorded for this scan. Findings retain their textual evidence; no marker locations were recorded.</p>}
      </section>
      <section className="wrap categories-section" id="categories"><div className="report-section-title"><div><h2>Category overview.</h2><p>All findings appear above. Open a category for its check-by-check evidence.</p></div><span className="mono">7 CATEGORIES</span></div>
        <div className="score-categories">{categoryOrder.map((key) => { const stats = categoryStats[key]; const findingsForCategory = recommendationFindings.filter((item) => item.category === key); const rows = checkLedger.filter((row) => row.category === labels[key]); const confirmedFindings = findingsForCategory.filter((item) => findingResult(item) === "Confirmed issue").length; const reviewFindings = findingsForCategory.length - confirmedFindings; return <details className="category-row" data-category={key} id={`category-${key}`} key={key}><summary><span className="category-row-name">{labels[key]}</span><span className="mono category-row-context">{rows.length} checks · {confirmedFindings} confirmed · {reviewFindings} review · {stats.unknown} unknown · {stats.not_recorded} not recorded</span><span className="category-open-label">View checks &amp; evidence</span></summary><div className="category-expanded"><p>Weight {CATEGORY_WEIGHTS[key]}%. Finding states shown: {confirmedFindings} confirmed, {reviewFindings} need review. Check states: {stats.pass} passed, {stats.issue} issues, {stats.review} review, {stats.unknown} unknown, {stats.not_recorded} not recorded, {stats.not_applicable} not applicable, {stats.measured} informational measurements. Finding and check states are separate.</p>{key === "design_brand" && scan.designReview?.state === "checked" && scan.designReview.dimensions && <div className="design-dimensions">{([["Hierarchy", "visualHierarchy"], ["Typography", "typography"], ["Spacing", "spacingRhythm"], ["Contrast", "paletteContrast"], ["Brand", "brandConsistency"], ["Generic signals", "genericSignals"]] as const).map(([label, dimension]) => <div key={dimension}><span>{label}</span><strong>{scan.designReview?.dimensions?.[dimension] ?? "Unavailable"}</strong></div>)}</div>}{!findingsForCategory.length && <p>No finding recorded in this category. Check results below show what was and was not confirmed.</p>}<details className="category-check-list"><summary>Show {rows.length} check results</summary><div className="check-evidence">{rows.map((row) => <div className="check-ledger-row" key={row.key}><span className="check-ledger-label"><span className={`mono check-ledger-status check-ledger-status--${row.status.replaceAll("_", "-")}`}>{row.status.replaceAll("_", " ")}</span><span>{row.label}</span></span><strong className="mono">{row.value ?? row.note ?? "Not recorded"}</strong></div>)}</div></details></div></details>; })}</div>
        <p className="coverage-note">Checks with results are separated from unknown, not recorded, not applicable, and informational checks. “Not recorded” checks were configured but did not run in this scan; they are not counted as attempted checks.</p>
      </section>
      <section className="wrap depth-section supplementary-checks" aria-label="Additional recorded evidence"><ReportOtherChecks rows={checkLedger}/></section>
      <TechnicalReportSections scan={scan} onRetryLighthouse={retryLighthouse}/>
      <section className="wrap depth-section scoring-methodology" aria-labelledby="methodology-title"><div className="report-section-title"><h2 id="methodology-title">Scoring methodology.</h2><span className="mono">DETERMINISTIC · SCORING VERSION {scan.scoringVersion ?? "UNKNOWN"}</span></div><p className="coverage-note">Category weights: {categoryOrder.map((key) => `${labels[key]} ${CATEGORY_WEIGHTS[key]}%`).join(" · ")}. {scan.scoringVersion !== undefined && scan.scoringVersion >= 4 ? "Confirmed findings apply configured rule points (critical −22, high −13, medium −7, low −3). Findings that need review or are unknown do not reduce the score." : "This saved report keeps the score recorded under its original scoring rules; it has not been recalculated."} Historical reports retain their recorded scores.</p>{scan.scoreBreakdown && <details className="score-breakdown"><summary>View exact category score inputs</summary><div className="breakdown-grid score-aggregation-grid"><div><p className="mono breakdown-label">SCORE · BASE · CEILING · DEDUCTIONS</p>{categoryOrder.map((key) => { const entry = scan.scoreBreakdown?.categories[key]; if (!entry) return null; return <div className="breakdown-row" key={key}><span className="mono">{labels[key]}</span><strong className="mono">{entry.score}/100 · base {entry.base} · ceiling {entry.ceiling} · −{entry.lost} pts / {entry.count} recorded finding{entry.count === 1 ? "" : "s"}</strong></div>; })}</div></div></details>}</section>
      <section className="wrap use-report" id="use-report" aria-labelledby="use-report-title"><div className="use-report-heading"><div><span className="mono">NEXT STEPS</span><h2 id="use-report-title">Use your report.</h2></div><p>Continue with the recorded fixes, or save and share this audit.</p></div>
      {paidPreview && paidData && <section className="wrap report-copy"><span className="mono">EXAMPLE PURCHASE EMAIL · PLAIN TEXT</span><p><strong>Subject:</strong> Ready for Real: your verified report</p><p>Your one-time Ready for Real report is ready. Open the secure purchaser link: [personal secure link]</p><p>Your purchase includes two additional re-scans of this exact URL within seven days. Each re-scan checks the current page again.</p><p>This link grants access to the paid report. Do not forward it.</p></section>}
      <ReportArtifactActions report={scan} paidData={paidData} />
      <div className="wrap share-row"><span className="mono">SHARE YOUR SCORE</span><button type="button" onClick={() => openShare("x")}>X</button><button type="button" onClick={() => openShare("linkedin")}>LinkedIn</button><button type="button" onClick={copyLink}>Copy link</button><span role="status">{shareStatus}</span></div>
      {paidStatus && <section className="wrap paid-report"><p className="mono inline-status" role="status">{paidStatus}</p></section>}
      {scan.id !== "example" && <section className="wrap email-section" id="email-report"><div><h2>Email yourself this report.</h2><p>Optional. This sends a link to the free scan report only. It does not unlock the personalized launch plan or coding prompts.</p></div><div className="email-actions"><form action={async (formData) => submitLead(formData)}><label htmlFor="lead-email" className="sr-only">Email address</label><input type="email" required maxLength={254} name="email" id="lead-email" autoComplete="email" placeholder="you@example.com"/><button type="submit">Email me this report</button><span role="status">{emailStatus}</span></form>{scan.paidAvailable && !paidData && <form action={async (formData) => requestAccess(formData)}><label htmlFor="access-email" className="sr-only">Email used at checkout</label><input type="email" required maxLength={254} name="email" id="access-email" autoComplete="email" placeholder="Email used at checkout"/><button type="submit">Resend paid report link</button><span role="status">{accessStatus}</span></form>}</div></section>}

      <details className="share-preview-disclosure"><summary>Preview your share card</summary><ReportSharePreview scan={scan} /></details>
      </section>
    </>}
    <SiteFooter navLabel="Legal and navigation"><Link href="/">Run another scan</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund">Refunds</Link></SiteFooter>
  </main>;
}
