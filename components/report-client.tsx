"use client";

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
import { FindingFixPrompts } from "@/components/finding-fix-prompts";
import { exampleReport } from "@/lib/example";
import { ReportArtifactActions } from "@/components/report-artifact-actions";
import { ReportFinding } from "@/components/report-finding";
import { ReportOtherChecks } from "@/components/report-other-checks";
import { LaunchPlan } from "@/components/launch-plan";

type FreeReport = ReturnType<typeof import("@/lib/store").publicScan>;
const labels: Record<Category, string> = { clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust", technical: "Technical", security: "Security", seo_aeo: "SEO / AEO" };
const categoryOrder = Object.keys(CATEGORY_WEIGHTS) as Category[];
const toolId = (name: string) => `prompt-tab-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const scoreDisplay = (score?: number) => typeof score === "number" ? String(score).padStart(2, "0") : "—";
const formatUtc = (value?: string, options?: Intl.DateTimeFormatOptions) => value ? `${new Date(value).toLocaleString("en-GB", { ...options, timeZone: "UTC" })} UTC` : "Time unavailable";
const scanSteps = ["Checking scan permissions…", "Rendering the desktop page…", "Rendering the mobile page…", "Checking links and page signals…", "Preparing the evidence-led report…", "Reviewing visual design…"];
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
  const [tool, setTool] = useState("Cursor"); const [copyStatus, setCopyStatus] = useState(""); const [shareStatus, setShareStatus] = useState(""); const [emailStatus, setEmailStatus] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false); const [checkoutMessage, setCheckoutMessage] = useState(""); const [checkoutSection, setCheckoutSection] = useState("");
  const [accessStatus, setAccessStatus] = useState("");
  const [notifyStatus, setNotifyStatus] = useState("");
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const checkoutAvailable = Boolean(scan.checkoutAvailable && !scan.paidRescanAvailable);
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
          const response = await fetch(`/api/scans/${encodeURIComponent(id)}/paid`, { cache: "no-store" });
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
  }, [id, scan.createdAt, scan.finalUrl, scan.id, scan.paidAvailable, scan.paidReportPending, scan.scoringVersion, scan.stackHints, scan.status, scan.title, scan.url]);
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
  const speedUnavailable = !scan.lighthouse || [...Object.values(scan.lighthouse.mobile), ...Object.values(scan.lighthouse.desktop)].every((metric) => metric.state === "unknown");
  const partial = contentUnavailable || speedUnavailable || Object.values(scan.categoryCoverage ?? {}).some((coverage) => coverage < 1);
  const prompt = paidData?.prompts[tool] ?? "";
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href.split("?")[0]); setShareStatus("Link copied."); track("share_clicked", { destination: "copy" }); } catch { setShareStatus("Your browser could not copy the link."); }
  }
  function openShare(kind: "x" | "linkedin") {
    track("share_clicked", { destination: kind });
    const url = window.location.href.split("?")[0];
    const target = kind === "x" ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${scan.score}/100 ${PRODUCT_NAME} for ${scan.domain} · ${RELEASE_CODE}`)}&url=${encodeURIComponent(url)}` : `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopyStatus("Prompt copied."); } catch { setCopyStatus("Your browser could not copy the prompt."); }
  }
  function downloadPrompt() {
    if (!prompt) return;
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `ready-for-real-${tool.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-launch-prompt.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function checkout(section = "") {
    setCheckoutSection(section); setCheckoutMessage(""); setCheckoutPending(true);
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id }) });
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
    try { const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, email: form.get("email") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The email could not be saved."); setEmailStatus(result.emailed ? "Saved, and a link to this report is on its way." : "Saved. Email delivery is not configured, so keep this report link."); }
    catch (error) { setEmailStatus(error instanceof Error ? error.message : "The email could not be saved."); }
  }
  async function submitNotify(form: FormData) {
    setNotifyStatus("");
    try { const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, email: form.get("email") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The email could not be saved."); setNotifyStatus("Saved. We'll email you the moment checkout opens."); }
    catch (error) { setNotifyStatus(error instanceof Error ? error.message : "The email could not be saved."); }
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
  const topRecommendations = visibleRecommendations.slice(0, 3);
  const remainingRecommendations = visibleRecommendations.slice(3);
  const reportCounts = { checksRun: checkCounts.pass + checkCounts.issue, passed: checkCounts.pass, issues: checkCounts.issue };
  const unscoredCategories = categoryOrder.filter((key) => typeof scan.categoryScores?.[key] !== "number");
  const currentStep = scanSteps.indexOf(scan.phase);

  return <main className="report-page">
    <ScrollReveal selectors=".depth-section, .categories-section, .findings-section, .capture-section, .category-row, .check-evidence > div, .finding-glass-shell, .speed-insights > div" />
    <header className="wrap masthead"><Link className="brand" href="/" aria-label="Ready for Real home"><Image className="brand-icon" src="/r4r-logo.jpg" alt="" width={40} height={40} priority /><span className="brand-name">Ready for Real<span className="brand-dot">.</span></span><span className="brand-sub">Launch Readiness</span></Link><span className="mast-meta">{scan.domain ?? "PAGE REVIEW"}</span></header>
    {paidPreview && <p className="wrap coverage-note"><strong>NO-CHARGE PAID-PAGE PREVIEW · HISTORICAL REGULARBASIS.STUDIO SCAN</strong><br/>Demo based on a scan from 31 October 2026. No real purchase or report access is changed.</p>}
    {!completed && scan.status !== "failed" && <section className="wrap scan-progress" aria-live="polite"><div className="scan-progress-ring" role="img" aria-label={`Scan step ${currentStep < 0 ? 0 : currentStep + 1} of ${scanSteps.length}`}><svg viewBox="0 0 72 72" aria-hidden="true"><circle className="progress-ring-track" cx="36" cy="36" r="31"/><circle className="progress-ring-value" cx="36" cy="36" r="31" strokeDasharray="195 195" strokeDashoffset={195 * (1 - (currentStep + 1) / scanSteps.length)}/></svg><span className="mono">{currentStep < 0 ? 0 : currentStep + 1}<small>/{scanSteps.length}</small></span></div><h1>{scan.phase}</h1><p>Rendering the live page and checking the details we can verify.</p><ol className="progress-log">{scanSteps.map((phase, index) => <li className={`${index < currentStep ? "done" : ""} ${index === currentStep ? "active" : ""} mono`} key={phase}>{index === currentStep && <span className="live-dot" aria-hidden="true"/>}{phase}</li>)}</ol></section>}
    {scan.status === "failed" && <section className="wrap scan-progress scan-failed"><span className="mono progress-label">SCAN STOPPED</span><h1>This page could not be reviewed.</h1><p>{scan.error ?? "The page could not be reached. Check the URL and try again."}</p><ScanForm initialUrl={scan.url} submitLabel="Retry scan" /><Link className="text-link" href="/">Try a different page →</Link></section>}
    {completed && <>
      <section className="wrap report-hero">
        <div className="report-domain">{scan.domain} <span>·</span> {scan.id === "example" ? "EXAMPLE REPORT · 31 OCT 2026" : scan.createdAt ? `SCANNED ${formatUtc(scan.createdAt, { dateStyle: "medium", timeStyle: "short" })}` : "SCAN DATE UNAVAILABLE"}</div>
        <h1 className="report-heading">Launch page audit</h1>
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
            <p>The three highest-priority findings are listed below. Review the evidence before changing your page.</p>
          </div>
          <details className="summary-scan-details"><summary>Scan details and coverage</summary><div><p>{reportCounts.checksRun} checks with a pass/fail result · {checkCounts.review} need review · {checkCounts.unknown} unknown · {checkCounts.not_recorded} not recorded · {checkCounts.not_applicable} not applicable · {checkCounts.measured} informational.</p><p>“Not recorded” means the scan did not capture that configured check. “Unknown” means it attempted the check but could not confirm a result. A measured value is informational and does not imply a pass.</p><p>HTTP response: {scan.checks?.status?.value ?? "Unavailable"} · Redirects: {scan.checks?.redirects?.value ?? "Unavailable"}</p></div></details>
          {searchParams.get("checkout") === "complete" && <p className="inline-status" role="status">Your checkout returned to this report. Once the payment is verified, we’ll email a secure purchaser link for the full report.</p>}
          {searchParams.get("checkout") === "cancelled" && <p className="inline-status" role="status">Checkout was cancelled. Your free report is still available here.</p>}
        </GlassCard>
        <div className="overview-categories" aria-label="Seven category scores">{categoryOrder.map((key) => { const score = scan.categoryScores?.[key]; const stats = categoryStats[key]; return <div className="overview-category" key={key}><div className="overview-category-label"><span>{labels[key]}</span><strong className="mono">{typeof score === "number" ? `${score}/100` : "Unavailable"}</strong></div><span className={`overview-category-track${typeof score === "number" ? "" : " is-unavailable"}`} aria-hidden="true"><i style={{ width: `${typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0}%` }}/></span><small>{stats.issue} issue{stats.issue === 1 ? "" : "s"} · {stats.review} review · {stats.unknown} unknown · {stats.not_recorded} not recorded</small></div>; })}</div>
        </div>
        <div className="overview-verdict"><div><span className="mono">EVIDENCE-BASED SUMMARY</span><p>{findings.length ? <>{firstNeedsReview ? "First recorded finding needs verification: " : "First recorded priority: "}<strong>{findings[0].title}</strong>{firstNeedsReview ? ". Confirm the behavior before changing the page." : ". Its recorded evidence and next step are below."}</> : partial ? "Some evidence is unavailable or needs review. Open the category results to see what was recorded." : "No score-losing finding was recorded. The result reflects this scan’s checks only."}</p></div><a className="primary-action summary-next-action" href={findings.length ? "#top-fixes" : "#categories"}>{findings.length ? "Review top recommendations" : "Explore category checks"}</a></div>
        {unscoredCategories.length > 0 && <p className="coverage-note category-legacy-note">Scores not recorded for this saved report: {unscoredCategories.map((category) => labels[category]).join(", ")}. Historical reports are not rescored automatically.</p>}
      </section>
      {recommendationFindings.length > 0 && <section className="wrap findings-section" id="top-fixes">
        <div className="report-section-title"><div><h2>Top recommendations.</h2><p>Evidence recorded for this page, ordered by scan priority.</p></div><span className="mono">{Math.min(3, recommendationFindings.length)} TOP PRIORITIES</span></div>
        <div className="recommendation-tabs" role="group" aria-label="Filter recommendations">
          {([ ["all", "All findings", recommendationFindings.length], ["confirmed", "Confirmed", recommendationCounts.confirmed], ["review", "Needs review", recommendationCounts.review] ] as const).map(([filter, label, count]) => <button type="button" key={filter} className={recommendationFilter === filter ? "is-active" : ""} aria-pressed={recommendationFilter === filter} onClick={() => setRecommendationFilter(filter)}>{label}<span>{count}</span></button>)}
        </div>
        <div className="finding-list top-recommendation-list">{topRecommendations.map((item, index) => <ReportFinding key={item.id} finding={item} index={index} scoringVersion={scan.scoringVersion} evidenceAvailable={Boolean(captureLink(item))} evidenceHref={captureLink(item)}/>)}</div>
        {remainingRecommendations.length > 0 && <details className="all-findings"><summary>All findings <span>{remainingRecommendations.length} more</span></summary><div className="finding-list">{remainingRecommendations.map((item, index) => <ReportFinding key={item.id} finding={item} index={index + 3} scoringVersion={scan.scoringVersion} compact evidenceAvailable={Boolean(captureLink(item))} evidenceHref={captureLink(item)}/>)}</div></details>}
        {!paidData && recommendationFindings.length > 3 && <p className="coverage-note all-findings-note">All {recommendationFindings.length} findings and their recorded evidence are shown here. The full report adds tailored fixes and tool-specific prompts.</p>}
      </section>}
      <section className="wrap capture-section" id="page-evidence" aria-label="Rendered page previews">
        <div className="report-section-title"><h2>Page evidence.</h2><span className="mono">CAPTURED RENDERS · NOT PROOF OF INVISIBLE BEHAVIOR</span></div>
        {scan.desktopImage || scan.mobileImage ? <div className="capture-grid">{scan.desktopImage && <figure id="desktop-evidence"><a className="capture-open" href={scan.desktopImage} target="_blank" rel="noreferrer" aria-label={`Open full desktop capture of ${scan.domain}`}><Image src={scan.desktopImage} alt={`Desktop rendering of ${scan.domain}`} width={1440} height={900} unoptimized loading="eager"/></a><figcaption className="mono">DESKTOP · 1440 × 900 · scan time {formatUtc(scan.createdAt)} <a className="capture-return" href={scan.desktopImage} target="_blank" rel="noreferrer">Open full capture ↗</a></figcaption></figure>}{scan.mobileImage && <figure id="mobile-evidence"><a className="capture-open capture-open-mobile" href={scan.mobileImage} target="_blank" rel="noreferrer" aria-label={`Open full mobile capture of ${scan.domain}`}><Image src={scan.mobileImage} alt={`Mobile rendering of ${scan.domain}`} width={390} height={844} unoptimized loading="eager"/></a><figcaption className="mono">MOBILE · 390 × 844 · scan time {formatUtc(scan.createdAt)} <a className="capture-return" href={scan.mobileImage} target="_blank" rel="noreferrer">Open full capture ↗</a></figcaption></figure>}</div> : <p className="coverage-note">No screenshot was recorded for this scan. Findings retain their textual evidence; no marker locations were recorded.</p>}
      </section>
      <section className="wrap categories-section" id="categories"><div className="report-section-title"><h2>Category overview.</h2><span className="mono">OPEN A CATEGORY FOR FINDINGS AND CHECK RESULTS</span></div>
        <div className="score-categories">{categoryOrder.map((key) => { const stats = categoryStats[key]; const findingsForCategory = recommendationFindings.filter((item) => item.category === key); const rows = checkLedger.filter((row) => row.category === labels[key]); const confirmedFindings = findingsForCategory.filter((item) => findingResult(item) === "Confirmed issue").length; const reviewFindings = findingsForCategory.length - confirmedFindings; return <details className="category-row" data-category={key} id={`category-${key}`} key={key}><summary><span className="category-row-name">{labels[key]}</span><span className="mono category-row-context">{confirmedFindings} confirmed · {reviewFindings} review shown · {stats.unknown} unknown · {stats.not_recorded} not recorded</span><span className="category-open-label">View checks &amp; evidence</span></summary><div className="category-expanded"><p>Weight {CATEGORY_WEIGHTS[key]}%. Finding states shown: {confirmedFindings} confirmed, {reviewFindings} need review. Check states: {stats.pass} passed, {stats.issue} issues, {stats.review} review, {stats.unknown} unknown, {stats.not_recorded} not recorded, {stats.not_applicable} not applicable, {stats.measured} informational measurements. Finding and check states are separate.</p>{key === "design_brand" && scan.designReview?.state === "checked" && scan.designReview.dimensions && <div className="design-dimensions">{([["Hierarchy", "visualHierarchy"], ["Typography", "typography"], ["Spacing", "spacingRhythm"], ["Contrast", "paletteContrast"], ["Brand", "brandConsistency"], ["Generic signals", "genericSignals"]] as const).map(([label, dimension]) => <div key={dimension}><span>{label}</span><strong>{scan.designReview?.dimensions?.[dimension] ?? "Unavailable"}</strong></div>)}</div>}{!findingsForCategory.length && <p>No finding recorded in this category. Check results below show what was and was not confirmed.</p>}<details className="category-check-list"><summary>Show {rows.length} check results</summary><div className="check-evidence">{rows.map((row) => <div className="check-ledger-row" key={row.key}><span className="check-ledger-label"><span className={`mono check-ledger-status check-ledger-status--${row.status.replaceAll("_", "-")}`}>{row.status.replaceAll("_", " ")}</span><span>{row.label}</span></span><strong className="mono">{row.value ?? row.note ?? "Not recorded"}</strong></div>)}</div></details></div></details>; })}</div>
        <p className="coverage-note">Checks with results are separated from unknown, not recorded, not applicable, and informational checks. “Not recorded” checks were configured but did not run in this scan; they are not counted as attempted checks.</p>
      </section>
      <section className="wrap depth-section supplementary-checks" aria-label="Additional recorded evidence"><ReportOtherChecks rows={checkLedger}/></section>
      <TechnicalReportSections scan={scan} onRetryLighthouse={retryLighthouse}/>
      <section className="wrap depth-section scoring-methodology" aria-labelledby="methodology-title"><div className="report-section-title"><h2 id="methodology-title">Scoring methodology.</h2><span className="mono">DETERMINISTIC · SCORING VERSION {scan.scoringVersion ?? "UNKNOWN"}</span></div><p className="coverage-note">Category weights: {categoryOrder.map((key) => `${labels[key]} ${CATEGORY_WEIGHTS[key]}%`).join(" · ")}. {scan.scoringVersion !== undefined && scan.scoringVersion >= 4 ? "Confirmed findings apply configured rule points (critical −22, high −13, medium −7, low −3). Findings that need review or are unknown do not reduce the score." : "This saved report keeps the score recorded under its original scoring rules; it has not been recalculated."} Historical reports retain their recorded scores.</p>{scan.scoreBreakdown && <details className="score-breakdown"><summary>View exact category score inputs</summary><div className="breakdown-grid score-aggregation-grid"><div><p className="mono breakdown-label">SCORE · BASE · CEILING · DEDUCTIONS</p>{categoryOrder.map((key) => { const entry = scan.scoreBreakdown?.categories[key]; if (!entry) return null; return <div className="breakdown-row" key={key}><span className="mono">{labels[key]}</span><strong className="mono">{entry.score}/100 · base {entry.base} · ceiling {entry.ceiling} · −{entry.lost} pts / {entry.count} recorded finding{entry.count === 1 ? "" : "s"}</strong></div>; })}</div></div></details>}</section>
      <section className="wrap use-report" id="use-report" aria-labelledby="use-report-title"><div className="use-report-heading"><div><span className="mono">NEXT STEPS</span><h2 id="use-report-title">Use your report.</h2></div><p>Continue with the recorded fixes, or save and share this audit.</p></div>
      {scan.id !== "example" && !paidData && <section className="wrap report-unlock-offer" id="unlock" aria-label="Unlock the launch plan and full report">
        <div>
          <p className="mono report-unlock-label">PERSONALIZED LAUNCH PLAN + FULL AGENT PROMPT · ${PRICE_FIX_PROMPT_USD} · ONE-TIME</p>
          <p>Get a launch checklist, page-copy drafts, one focused coding-agent prompt for every finding, and a complete prompt that brings the fixes together.</p>
          <p className="mono report-unlock-note">ONE URL · TWO FRESH RE-SCANS IN SEVEN DAYS · NO SUBSCRIPTION · CURSOR, CLAUDE CODE, CODEX &amp; MORE</p>
        </div>
        <div className="report-unlock-action">
          {checkoutAvailable ? <button className="inline-unlock" type="button" onClick={() => void checkout("report")} disabled={checkoutPending}>{checkoutPending && checkoutSection === "report" ? "Opening checkout…" : `Unlock full report — $${PRICE_FIX_PROMPT_USD}`}</button>
            : <form className="unlock-notify" action={async (formData) => submitNotify(formData)}><input type="email" required maxLength={254} name="email" autoComplete="email" placeholder="you@yourapp.com" aria-label="Email address"/><button type="submit" className="inline-unlock">Notify me at launch</button></form>}
          {checkoutMessage && checkoutSection === "report" && <p className="inline-status" role="status">{checkoutMessage}</p>}
          {notifyStatus && <p className="inline-status" role="status">{notifyStatus}</p>}
        </div>
      </section>}
      {paidData && <section className="wrap paid-report paid-primary-continuation"><div className="report-section-title"><h2>Your launch plan.</h2><span className="mono">PERSONALIZED · UNLOCKED</span></div>{scan.paidRescanAvailable && <p className="mono paid-rescan-note">{scan.paidRescansRemaining === null ? "Your existing purchase includes unlimited" : `${scan.paidRescansRemaining ?? 0} included`} re-scan{scan.paidRescansRemaining === 1 ? "" : "s"} of this URL within seven days of purchase. Re-scan after applying fixes to check what changed. <Link href={`/?url=${encodeURIComponent(scan.url)}`}>Re-scan this URL →</Link></p>}<LaunchPlan scanId={scan.id} findings={paidData.findings} /><FindingFixPrompts url={scan.finalUrl ?? scan.url} title={scan.title ?? ""} findings={paidData.findings} /><div className="report-copy"><span className="mono">PAGE COPY OPTIONS</span><p>{paidData.copyDrafts.status}</p><div className="copy-drafts"><div><span className="mono">HEADLINE OPTIONS</span>{paidData.copyDrafts.headlines.map((line, i) => <p key={i}>{line}</p>)}</div><div><span className="mono">SUBHEADLINE</span><p>{paidData.copyDrafts.subheadline}</p></div><div><span className="mono">PRIMARY CTA</span><p>{paidData.copyDrafts.cta}</p></div><div><span className="mono">FAQ DRAFT</span><p>{paidData.copyDrafts.faq}</p></div><div><span className="mono">META TITLE & DESCRIPTION</span><p>{paidData.copyDrafts.metaTitle}</p><p>{paidData.copyDrafts.metaDescription}</p></div></div></div><h2 className="prompt-section-heading">Take the full plan to your coding agent.</h2><p className="coverage-note prompt-section-copy">Each tool version includes the full evidence-led launch plan, owner checks, acceptance criteria, and verification instructions.</p><div className="tool-tabs" role="tablist" aria-label="Fix prompt by tool" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
        const current = tabs.findIndex((tab) => tab === document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        const selected = tabs[next];
        if (selected?.dataset.tool) { setTool(selected.dataset.tool); selected.focus(); }
      }}>{Object.keys(paidData.prompts).map((name) => <button type="button" role="tab" id={toolId(name)} data-tool={name} aria-controls="prompt-content" tabIndex={tool === name ? 0 : -1} aria-selected={tool === name} className={tool === name ? "active" : ""} onClick={() => setTool(name)} key={name}>{name}</button>)}</div><pre className="prompt-output" id="prompt-content" role="tabpanel" aria-labelledby={toolId(tool)} tabIndex={0}>{prompt}</pre><div className="prompt-actions"><button className="primary-action" onClick={copyPrompt}>Copy {tool} prompt</button><button className="secondary-action" onClick={downloadPrompt}>Download prompt</button></div><span role="status">{copyStatus}</span></section>}
      {paidPreview && paidData && <section className="wrap report-copy"><span className="mono">EXAMPLE PURCHASE EMAIL · PLAIN TEXT</span><p><strong>Subject:</strong> Ready for Real: your verified report</p><p>Your one-time Ready for Real report is ready. Open the secure purchaser link: [personal secure link]</p><p>Your purchase includes two additional re-scans of this exact URL within seven days. Each re-scan checks the current page again.</p><p>This link grants access to the paid report. Do not forward it.</p></section>}
      <ReportArtifactActions report={scan} paidData={paidData} />
      <div className="wrap share-row"><span className="mono">SHARE YOUR SCORE</span><button type="button" onClick={() => openShare("x")}>X</button><button type="button" onClick={() => openShare("linkedin")}>LinkedIn</button><button type="button" onClick={copyLink}>Copy link</button><span role="status">{shareStatus}</span></div>
      {paidStatus && <section className="wrap paid-report"><p className="mono inline-status" role="status">{paidStatus}</p></section>}
      {scan.id !== "example" && <section className="wrap email-section"><div><h2>Keep your report close.</h2><p>Optional. Save your email with this report; a report link will be sent if email delivery is available.</p></div><div className="email-actions"><form action={async (formData) => submitLead(formData)}><label htmlFor="lead-email" className="sr-only">Email address</label><input type="email" required maxLength={254} name="email" id="lead-email" autoComplete="email" placeholder="you@example.com"/><button type="submit">Save email & send</button><span role="status">{emailStatus}</span></form>{scan.paidAvailable && !paidData && <form action={async (formData) => requestAccess(formData)}><label htmlFor="access-email" className="sr-only">Email used at checkout</label><input type="email" required maxLength={254} name="email" id="access-email" autoComplete="email" placeholder="Email used at checkout"/><button type="submit">Resend paid report link</button><span role="status">{accessStatus}</span></form>}</div></section>}

      <details className="share-preview-disclosure"><summary>Preview your share card</summary><ReportSharePreview scan={scan} /></details>
      </section>
    </>}
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Legal and navigation"><Link href="/">Run another scan</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund">Refunds</Link></nav></footer>
  </main>;
}
