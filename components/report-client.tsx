"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { RELEASE_CODE, PRICE_FIX_PROMPT_USD, PRODUCT_NAME } from "@/config/release";
import { track } from "@/lib/analytics-client";
import type { Finding } from "@/lib/types";
import { TechnicalReportSections } from "@/components/technical-report-sections";
import { GlassCard } from "@/components/glass-card";
import { ScanForm } from "@/components/scan-form";
import { CATEGORY_WEIGHTS } from "@/config/scoring";
import type { Category } from "@/lib/types";
import { checkOutcome } from "@/lib/audit-counts";
import { promptVariants } from "@/lib/fix-prompts";

type FreeReport = ReturnType<typeof import("@/lib/store").publicScan>;
const labels: Record<Category, string> = { clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust", technical: "Technical", security: "Security" };
const categoryOrder = Object.keys(CATEGORY_WEIGHTS) as Category[];
const scoreDisplay = (score: number) => String(score).padStart(2, "0");
const scanSteps = ["Checking scan permissions…", "Rendering the desktop page…", "Rendering the mobile page…", "Checking links and page signals…", "Preparing the evidence-led report…", "Reviewing visual design…"];
const categoryChecks: Record<Category, string[]> = {
  clarity: ["title", "description", "h1Count", "headingOrder"],
  conversion: ["primaryCtaTargets", "mobileOverflow", "formCount"],
  design_brand: ["designContrastFailures"],
  trust: ["proofSignals", "pricing", "faq", "contact", "ogTitle", "ogDescription", "twitterCard"],
  technical: ["status", "redirects", "sitemap", "imageAltCoverage", "pageSpeedMobile", "pageSpeedDesktop", "lighthouseMobileAccessibility", "lighthouseDesktopAccessibility", "lighthouseMobileBestPractices", "lighthouseDesktopBestPractices", "lighthouseMobileSeo", "lighthouseDesktopSeo", "consoleErrors"],
  security: ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes"],
};
const checkNames: Record<string, string> = { title: "Page title", description: "Meta description", h1Count: "Single H1", headingOrder: "Heading order", primaryCtaTargets: "Primary action destination", mobileOverflow: "Mobile fit", formCount: "Forms inspected", designContrastFailures: "Text contrast", proofSignals: "Proof signal", pricing: "Pricing information", faq: "FAQ", contact: "Contact path", ogTitle: "Share title", ogDescription: "Share description", twitterCard: "X card metadata", status: "Page response", redirects: "Redirect chain", sitemap: "Sitemap", imageAltCoverage: "Image descriptions", pageSpeedMobile: "Mobile Lighthouse performance", pageSpeedDesktop: "Desktop Lighthouse performance", lighthouseMobileAccessibility: "Mobile accessibility", lighthouseDesktopAccessibility: "Desktop accessibility", lighthouseMobileBestPractices: "Mobile best practices", lighthouseDesktopBestPractices: "Desktop best practices", lighthouseMobileSeo: "Mobile Lighthouse SEO", lighthouseDesktopSeo: "Desktop Lighthouse SEO", consoleErrors: "Browser errors", https: "HTTPS", tlsCertificate: "TLS certificate", httpToHttps: "HTTPS redirect", contentSecurityPolicy: "CSP", strictTransportSecurity: "HSTS", frameProtection: "Frame protection", contentTypeOptions: "Content type protection", referrerPolicy: "Referrer policy", permissionsPolicy: "Permissions policy", exposedFiles: "Exposed files", frontendSecrets: "Frontend secrets", mixedContent: "Mixed content", cookieIssues: "Cookie attributes", corsWildcardRoutes: "CORS policy" };

function CategoryRing({ category, score }: { category: Category; score?: number }) {
  const radius = 26; const circumference = 2 * Math.PI * radius; const value = typeof score === "number" ? score : undefined;
  const dash = circumference * (1 - (value ?? 0) / 100);
  const angle = -Math.PI / 2; const dotX = 32 + radius * Math.cos(angle); const dotY = 32 + radius * Math.sin(angle);
  return <div className="category-ring" aria-label={`${labels[category]}: ${value === undefined ? "not available" : `${value} out of 100`}`}>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="category-ring-ink" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ff2e7e"/><stop offset="100%" stopColor="#ff8fb4"/></linearGradient></defs>
      <circle className="category-ring-track" cx="32" cy="32" r={radius}/>
      <circle className={`category-ring-value${value === undefined ? " dim" : ""}`} cx="32" cy="32" r={radius} strokeDasharray={`${circumference - dash} ${circumference}`} strokeDashoffset={0}/>
      {value !== undefined && value > 0 && <circle className="category-ring-dot" cx={dotX} cy={dotY} r="2.4"/>}
    </svg>
    <span className="mono">{value ?? "n/a"}</span><span className="category-ring-label">{labels[category]}</span>
  </div>;
}

function AnnotatedCapture({ scan }: { scan: FreeReport & { findings?: Finding[] } }) {
  const capture = scan.annotatedCapture;
  if (!capture?.desktopImage && !capture?.mobileImage && !capture?.desktopSegments?.length && !capture?.mobileSegments?.length) return null;
  const items = scan.findings ?? [];
  const figures = (["desktop", "mobile"] as const).flatMap((device) => {
    const src = device === "desktop" ? capture.desktopImage : capture.mobileImage;
    const size = device === "desktop" ? capture.desktopSize : capture.mobileSize;
    const segments = device === "desktop" ? capture.desktopSegments : capture.mobileSegments;
    if ((!src || !size) && !segments?.length) return [];
    const renderMarkers = (segmentIndex?: number) => capture.markers.map((marker) => {
      const point = marker[device]; const item = items.find((finding) => finding.id === marker.findingId);
      if (!point || !item || point.segmentIndex !== segmentIndex) return null;
      return <button className="finding-marker" type="button" key={`${device}-${marker.findingId}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`Finding ${marker.number}: ${item.title}. Jump to finding.`} onClick={() => document.getElementById(`finding-${marker.findingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{marker.number}</button>;
    });
    return [<GlassCard as="figure" className="annotated-capture-card" shellClassName="annotated-capture-shell" key={device}>
      <div className="annotated-capture-viewport">{src && size ? <div className="annotated-capture-canvas"><Image src={src} alt={`${device} full-page rendering of ${scan.domain}`} width={size.width} height={size.height} unoptimized loading="lazy"/>{renderMarkers()}</div> : segments?.map((segment, index) => <div className="annotated-capture-canvas" key={`${device}-${index}`}><Image src={segment.image} alt={`${device} page capture ${index + 1} of ${segments.length} for ${scan.domain}`} width={segment.width} height={segment.height} unoptimized loading="lazy"/>{renderMarkers(index)}</div>)}</div><figcaption className="mono">{device.toUpperCase()} · MARKERS JUMP TO FINDINGS</figcaption>
    </GlassCard>];
  });
  return <section className="wrap capture-section annotated-capture-section" aria-label="Annotated page screenshots"><div className="report-section-title"><h2>Findings, in context.</h2><span className="mono">SELECT A PINK MARKER TO JUMP TO ITS FINDING</span></div><div className="capture-grid">{figures}</div></section>;
}

export function ReportClient({ initial }: { initial: FreeReport }) {
  const [scan, setScan] = useState(initial as FreeReport & { findings?: Finding[]; lockedTitles?: string[]; lockedCount?: number });
  const [paidData, setPaidData] = useState<{ available: boolean; findings: Finding[]; prompts: Record<string, string>; copyDrafts: { status: string; headlines: string[]; subheadline: string; cta: string; faq: string; metaTitle: string; metaDescription: string } } | undefined>();
  const [paidStatus, setPaidStatus] = useState("");
  const [tool, setTool] = useState("Cursor"); const [copyStatus, setCopyStatus] = useState(""); const [shareStatus, setShareStatus] = useState(""); const [emailStatus, setEmailStatus] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false); const [checkoutMessage, setCheckoutMessage] = useState(""); const [checkoutSection, setCheckoutSection] = useState("");
  const [accessStatus, setAccessStatus] = useState("");
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const params = useParams<{ id: string }>(); const searchParams = useSearchParams();
  const id = params.id;
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
            if (!result.prompts["Claude Code"]) {
              const generated = promptVariants({ url: scan.finalUrl ?? scan.url, title: scan.title ?? "", stack: scan.stackHints ?? [], findings: result.findings, copyDrafts: result.copyDrafts });
              result.prompts = { ...result.prompts, "Claude Code": generated["Claude Code"] };
            }
            setPaidData(result); setPaidStatus("");
          }
        } catch { /* a later retry or refresh can recover */ }
      };
      void loadPaidReport();
      return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
    }
  }, [id, scan.finalUrl, scan.id, scan.paidAvailable, scan.paidReportPending, scan.stackHints, scan.status, scan.title, scan.url]);
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
  const contentUnavailable = !scan.contentReview || /unavailable|could not/i.test(scan.contentReview);
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
  async function retryLighthouse() {
    try {
      const response = await fetch(`/api/scans/${encodeURIComponent(id)}/lighthouse`, { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (result.report) setScan(result.report);
      return response.ok && !result.unavailable;
    } catch { return false; }
  }
  async function submitLead(form: FormData) {
    setEmailStatus("");
    try { const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id, email: form.get("email") }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "The email could not be saved."); setEmailStatus(result.emailed ? "Saved, and a link to this report is on its way." : "Saved. Email delivery is not configured, so keep this report link."); }
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
  const weightLabel = `WEIGHTS · ${categoryOrder.map((key) => CATEGORY_WEIGHTS[key]).join(" / ")}`;
  const currentStep = scanSteps.indexOf(scan.phase);

  return <main className="report-page">
    <header className="wrap masthead"><Link className="brand" href="/"><span className="brand-mark">{RELEASE_CODE}</span><span className="brand-name">{PRODUCT_NAME}</span><span className="brand-sub">Launch Score</span></Link><span className="mast-meta">{scan.domain ?? "PAGE REVIEW"}</span></header>
    {!completed && scan.status !== "failed" && <section className="wrap scan-progress" aria-live="polite"><div className="scan-progress-ring" role="img" aria-label={`Scan step ${currentStep < 0 ? 0 : currentStep + 1} of ${scanSteps.length}`}><svg viewBox="0 0 72 72" aria-hidden="true"><circle className="progress-ring-track" cx="36" cy="36" r="31"/><circle className="progress-ring-value" cx="36" cy="36" r="31" strokeDasharray="195 195" strokeDashoffset={195 * (1 - (currentStep + 1) / scanSteps.length)}/></svg><span className="mono">{currentStep < 0 ? 0 : currentStep + 1}<small>/{scanSteps.length}</small></span></div><h1>{scan.phase}</h1><p>Rendering the live page and checking the details we can verify.</p><ol className="progress-log">{scanSteps.map((phase, index) => <li className={`${index < currentStep ? "done" : ""} ${index === currentStep ? "active" : ""} mono`} key={phase}>{index === currentStep && <span className="live-dot" aria-hidden="true"/>}{phase}</li>)}</ol></section>}
    {scan.status === "failed" && <section className="wrap scan-progress scan-failed"><span className="mono progress-label">SCAN STOPPED</span><h1>This page could not be reviewed.</h1><p>{scan.error ?? "The page could not be reached. Check the URL and try again."}</p><ScanForm initialUrl={scan.url} submitLabel="Retry scan" /><Link className="text-link" href="/">Try a different page →</Link></section>}
    {completed && <>
      <section className="wrap report-hero">
        <div className="report-domain">{scan.domain} <span>·</span> {scan.id === "example" ? "EXAMPLE REPORT · 31 OCT 2026" : "LAUNCH SCORE"}</div>
        <GlassCard className="score-overview" shellClassName="report-score-shell">
          <div className="score-line" role="img" aria-label={`${PRODUCT_NAME}: ${scan.score ?? 0} out of 100`}><span className="score-number" aria-hidden="true">{scoreDisplay(animatedScore ?? scan.score ?? 0)}</span><span className="score-denom" aria-hidden="true">/100</span><span className="score-tick" aria-hidden="true"/></div>
          <p className="coverage-note score-coverage">{partial ? "Some optional checks could not be confirmed." : "Assessment complete."} Unknown checks do not add points.</p>
          {scan.auditCounts && <p className="audit-counts mono">{scan.auditCounts.checksRun} checks run · {scan.auditCounts.passed} passed · {scan.auditCounts.issues} issues</p>}
          {searchParams.get("checkout") === "complete" && <p className="inline-status" role="status">Your checkout returned to this report. Once the payment is verified, we’ll email a secure purchaser link for the full report.</p>}
          {searchParams.get("checkout") === "cancelled" && <p className="inline-status" role="status">Checkout was cancelled. Your free report is still available here.</p>}
        </GlassCard>
        <div className="score-summary"><h1>{scan.title ? `A first look at ${scan.title}` : "Your launch page, at a glance."}</h1><p>Six angles on whether a new visitor can understand, trust, and act on your page.</p></div>
        <div className="category-rings">{categoryOrder.map((key) => <CategoryRing key={key} category={key} score={scan.categoryScores?.[key]}/>)}</div>
      </section>
      <section className="wrap categories-section"><div className="report-section-title"><h2>Categories.</h2><span className="mono">{weightLabel}</span></div><div className="score-categories">{categoryOrder.map((key) => <div className="category-row" key={key}><span>{labels[key]}</span><div className="category-track" aria-hidden="true"><i style={{ width: `${scan.categoryScores?.[key] ?? 0}%` }}/></div><span className="mono category-score">{scan.categoryScores?.[key] ?? "n/a"}</span></div>)}</div><div className="category-passed-groups">{categoryOrder.map((category) => { const passed = categoryChecks[category].filter((key) => scan.checks?.[key] && checkOutcome(key, scan.checks[key], findings) === true).map((key) => checkNames[key]); if (!passed.length) return null; return <details className="category-passed-group" key={category}><summary className="mono">{labels[category]} · {passed.length} passed</summary><ul className="passed-checks">{passed.map((name) => <li className="mono" key={name}><span aria-hidden="true">✓</span>{name}</li>)}</ul></details>; })}</div></section>
      {findings.length > 0 && <section className="wrap findings-section"><div className="report-section-title"><h2>Top fixes.</h2><span className="mono">TOP {Math.min(findings.length, 3)} FREE FINDINGS</span></div>
        <div className="finding-list">{findings.slice(0, 3).map((item, index) => <GlassCard as="article" id={`finding-${item.id}`} className={`finding severity-card severity-${item.severity}`} shellClassName="finding-glass-shell" key={item.id}><span className="mono finding-index">0{index + 1}</span><div><span className={`mono finding-meta severity-${item.severity}`}>{labels[item.category]} · {item.severity.toUpperCase()} IMPACT</span><h3>{item.title}</h3><p>{item.why_it_matters}</p></div></GlassCard>)}</div>
        {Boolean(scan.lockedCount) && !paidData && <div className="locked-findings"><p className="mono">{scan.lockedCount} MORE FINDINGS{checkoutAvailable ? ` · FULL REPORT + FIX PROMPT $${PRICE_FIX_PROMPT_USD} ONCE` : ""}</p></div>}
      </section>}
      {scan.id !== "example" && checkoutAvailable && !paidData && <section className="wrap report-unlock-offer" aria-label="Unlock the full report and Fix Prompt">
        <div>
          <p className="mono report-unlock-label">FULL REPORT + FIX PROMPT · ${PRICE_FIX_PROMPT_USD} · ONE-TIME</p>
          <p>Unlock every finding with its evidence and recommended fix, plus page-copy options and prompts for your tool.</p>
          <p className="mono report-unlock-note">ONE URL · UNLIMITED RE-SCANS FOR SEVEN DAYS · NO SUBSCRIPTION</p>
        </div>
        <div className="report-unlock-action">
          <button className="inline-unlock" type="button" onClick={() => void checkout("report")} disabled={checkoutPending}>{checkoutPending && checkoutSection === "report" ? "Opening checkout…" : `Unlock full report — $${PRICE_FIX_PROMPT_USD}`}</button>
          {checkoutMessage && checkoutSection === "report" && <p className="inline-status" role="status">{checkoutMessage}</p>}
        </div>
      </section>}
      <TechnicalReportSections scan={{ ...scan, checkoutAvailable } as FreeReport & { findingCounts?: Record<string, { total: number; critical: number; high: number; medium: number; low: number }>; shareImageAvailable?: boolean; checkoutAvailable?: boolean; findings?: Finding[] }} paidFindings={paidData?.findings} onRetryLighthouse={retryLighthouse} onUnlock={(section) => void checkout(section)} checkoutPending={checkoutPending} checkoutMessage={checkoutMessage} checkoutSection={checkoutSection}/>
      <div className="wrap share-row"><span className="mono">SHARE YOUR SCORE</span><button type="button" onClick={() => openShare("x")}>X</button><button type="button" onClick={() => openShare("linkedin")}>LinkedIn</button><button type="button" onClick={copyLink}>Copy link</button><span role="status">{shareStatus}</span></div>
      {scan.annotatedCapture ? <AnnotatedCapture scan={scan as FreeReport & { findings?: Finding[] }}/> : <section className="wrap capture-section" aria-label="Rendered page previews">
        <div className="report-section-title"><h2>Your page, rendered.</h2><span className="mono">DESKTOP 1440 × 900 / MOBILE 390 × 844</span></div>
        <div className="capture-grid">{scan.desktopImage && <figure><Image src={scan.desktopImage} alt={`Desktop rendering of ${scan.domain}`} width={1440} height={900} unoptimized loading="eager"/><figcaption className="mono">DESKTOP · 1440 × 900</figcaption></figure>}{scan.mobileImage && <figure><Image src={scan.mobileImage} alt={`Mobile rendering of ${scan.domain}`} width={390} height={844} unoptimized loading="eager"/><figcaption className="mono">MOBILE · 390 × 844</figcaption></figure>}</div>
      </section>}
      {paidStatus && <section className="wrap paid-report"><p className="mono inline-status" role="status">{paidStatus}</p></section>}
      {scan.id !== "example" && <section className="wrap email-section"><div><h2>Keep your report close.</h2><p>Optional. Save your email with this report; a report link will be sent if email delivery is available.</p></div><div className="email-actions"><form action={async (formData) => submitLead(formData)}><label htmlFor="lead-email" className="sr-only">Email address</label><input type="email" required maxLength={254} name="email" id="lead-email" autoComplete="email" placeholder="you@example.com"/><button type="submit">Save email & send</button><span role="status">{emailStatus}</span></form>{scan.paidAvailable && !paidData && <form action={async (formData) => requestAccess(formData)}><label htmlFor="access-email" className="sr-only">Email used at checkout</label><input type="email" required maxLength={254} name="email" id="access-email" autoComplete="email" placeholder="Email used at checkout"/><button type="submit">Resend paid report link</button><span role="status">{accessStatus}</span></form>}</div></section>}
      {paidData && <section className="wrap paid-report"><div className="report-section-title"><h2>Fix your highest-impact issues.</h2><span className="mono">FIX PROMPT · UNLOCKED</span></div>{scan.paidRescanAvailable && <p className="mono paid-rescan-note">Your purchase includes unlimited re-scans of this URL for seven days. <Link href={`/?url=${encodeURIComponent(scan.url)}`}>Rescan this URL →</Link></p>}<div className="report-copy"><span className="mono">COPY DRAFT STATUS</span><p>{paidData.copyDrafts.status}</p><div className="copy-drafts"><div><span className="mono">HEADLINE OPTIONS</span>{paidData.copyDrafts.headlines.map((line, i) => <p key={i}>{line}</p>)}</div><div><span className="mono">SUBHEADLINE</span><p>{paidData.copyDrafts.subheadline}</p></div><div><span className="mono">PRIMARY CTA</span><p>{paidData.copyDrafts.cta}</p></div><div><span className="mono">FAQ DRAFT</span><p>{paidData.copyDrafts.faq}</p></div><div><span className="mono">META TITLE & DESCRIPTION</span><p>{paidData.copyDrafts.metaTitle}</p><p>{paidData.copyDrafts.metaDescription}</p></div></div></div><div className="tool-tabs" role="tablist" aria-label="Fix prompt by tool" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
        const current = tabs.findIndex((tab) => tab === document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        const selected = tabs[next];
        if (selected?.dataset.tool) { setTool(selected.dataset.tool); selected.focus(); }
      }}>{Object.keys(paidData.prompts).map((name) => <button type="button" role="tab" id={`prompt-tab-${name}`} data-tool={name} aria-controls="prompt-content" tabIndex={tool === name ? 0 : -1} aria-selected={tool === name} className={tool === name ? "active" : ""} onClick={() => setTool(name)} key={name}>{name}</button>)}</div><pre className="prompt-output" id="prompt-content" role="tabpanel" aria-labelledby={`prompt-tab-${tool}`} tabIndex={0}>{prompt}</pre><button className="primary-action" onClick={copyPrompt}>Copy {tool} prompt</button><span role="status">{copyStatus}</span><div className="all-findings"><h3>Full ranked findings</h3>{paidData.findings.map((item) => <article className="finding" key={item.id}><div><span className="mono finding-meta">{labels[item.category]} · {item.severity.toUpperCase()} IMPACT</span><h3>{item.title}</h3><p>{item.why_it_matters}</p><p><strong>Evidence:</strong> {item.evidence}</p><p><strong>Suggested fix:</strong> {item.fix}</p></div></article>)}</div></section>}
    </>}
    <footer className="wrap footer"><span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span><nav className="footer-links" aria-label="Legal and navigation"><Link href="/">Run another scan</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refund">Refunds</Link></nav></footer>
  </main>;
}
