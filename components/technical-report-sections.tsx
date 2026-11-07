"use client";

import Image from "next/image";
import { useState } from "react";
import type { Finding, LighthouseStrategy, LighthouseReport, MetricCheck } from "@/lib/types";
import { GlassCard } from "@/components/glass-card";
import { PRICE_FIX_PROMPT_USD } from "@/config/release";

type SectionCount = { total: number; critical: number; high: number; medium: number; low: number };
type ReportView = { id: string; url: string; title?: string; description?: string; lighthouse?: LighthouseReport; sharePreview?: { title: string; description: string }; findingCounts?: Record<string, SectionCount>; shareImageAvailable?: boolean; checks?: Record<string, MetricCheck>; checkoutAvailable?: boolean; findings?: Finding[]; designReview?: { state: "checked" | "unknown"; dimensions?: Record<string, number>; score?: number }; categoryScores?: Record<string, number | undefined> };
const strategies = [["performance", "Performance"], ["accessibility", "Accessibility"], ["bestPractices", "Best Practices"], ["seo", "SEO"]] as const;
const sections = [["design", "Design & Brand"], ["security", "Security"], ["seo", "SEO"], ["leftovers", "Vibe-coded leftovers"], ["forms", "Forms & CTA"], ["technical", "Technical"], ["other", "Additional findings"]] as const;
const displayCheck = (value?: { state?: string; value?: number | string }) => value?.state === "checked" && value.value !== undefined ? value.value : "Unavailable";
const countLabel = (counts?: SectionCount) => {
  if (!counts?.total) return "";
  const parts = (["critical", "high", "medium", "low"] as const).filter((level) => counts[level]).map((level) => `${counts[level]} ${level}`);
  return `${counts.total} finding${counts.total === 1 ? "" : "s"} · ${parts.join(" · ")}`;
};
const checkLabels: Record<string, string> = {
  https: "HTTPS enforced", tlsCertificate: "Valid TLS certificate", httpToHttps: "HTTP redirects to HTTPS", contentSecurityPolicy: "CSP", strictTransportSecurity: "HSTS", frameProtection: "Frame protection", contentTypeOptions: "Content type protection", referrerPolicy: "Referrer policy", permissionsPolicy: "Permissions policy",
  exposedFiles: "No exposed files", frontendSecrets: "No secrets in bundles", title: "Page title", description: "Meta description", h1Count: "Single H1", headingOrder: "Heading order", canonical: "Canonical URL", metaRobots: "Robots meta", sitemap: "Sitemap", jsonLd: "JSON-LD", imageAltCoverage: "Image alt coverage", ogTitle: "Open Graph title", ogDescription: "Open Graph description", twitterCard: "Twitter card", formCount: "Forms inspected", primaryCtaTargets: "Primary CTA targets", consoleErrors: "No console errors",
};
const passValue = (key: string, check?: MetricCheck) => {
  if (!check || check.state !== "checked") return false;
  if (["exposedFiles", "frontendSecrets", "consoleErrors"].includes(key)) return Number(check.value) === 0;
  if (key === "h1Count") return Number(check.value) === 1;
  if (key === "headingOrder") return check.value === "In order";
  if (key === "httpToHttps") return check.value === "Redirects to HTTPS";
  if (key === "tlsCertificate") return check.value === "Valid";
  if (key === "https") return check.value === "Secure";
  if (key === "metaRobots") return !/\bnoindex\b/i.test(String(check.value));
  if (key === "sitemap") return Number(check.value) >= 200 && Number(check.value) < 400;
  if (key === "jsonLd") return !String(check.value).includes("invalid");
  if (key === "imageAltCoverage") { const [good, all] = String(check.value).split("/").map(Number); return good === all; }
  if (["title", "description", "canonical", "metaRobots", "ogTitle", "ogDescription", "twitterCard"].includes(key)) return Boolean(check.value) && !["Missing", "Not detected"].includes(String(check.value));
  return typeof check.value === "string" && /present|secure|in order|redirects to https/i.test(check.value);
};

const sectionCategory: Record<string, string> = { design: "design_brand", security: "security", seo: "technical", leftovers: "technical", forms: "conversion", technical: "technical" };
const categoryCheckKeys: Record<string, string[]> = {
  clarity: ["title", "description", "h1Count", "headingOrder"],
  conversion: ["primaryCtaTargets", "mobileOverflow", "formCount"],
  design_brand: ["designContrastFailures"],
  trust: ["proofSignals", "pricing", "faq", "contact", "ogTitle", "ogDescription", "twitterCard"],
  technical: ["status", "redirects", "sitemap", "imageAltCoverage", "pageSpeedMobile", "pageSpeedDesktop", "lighthouseMobileAccessibility", "lighthouseDesktopAccessibility", "lighthouseMobileBestPractices", "lighthouseDesktopBestPractices", "lighthouseMobileSeo", "lighthouseDesktopSeo", "consoleErrors"],
  security: ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes"],
};
const unknownCheckNames: Record<string, string> = { pageSpeedMobile: "mobile Lighthouse performance", pageSpeedDesktop: "desktop Lighthouse performance", lighthouseMobileAccessibility: "mobile accessibility", lighthouseDesktopAccessibility: "desktop accessibility", lighthouseMobileBestPractices: "mobile best practices", lighthouseDesktopBestPractices: "desktop best practices", lighthouseMobileSeo: "mobile Lighthouse SEO", lighthouseDesktopSeo: "desktop Lighthouse SEO", designContrastFailures: "text contrast review", primaryCtaTargets: "primary action destinations", mobileOverflow: "mobile fit", title: "page title", description: "meta description", h1Count: "heading structure", headingOrder: "heading order", proofSignals: "proof signals", pricing: "pricing information", faq: "FAQ", contact: "contact path", ogTitle: "share title", ogDescription: "share description", twitterCard: "X card metadata", status: "page response", redirects: "redirect chain", sitemap: "sitemap.xml", imageAltCoverage: "image descriptions", consoleErrors: "browser errors", https: "HTTPS", tlsCertificate: "TLS certificate", httpToHttps: "HTTPS redirect", contentSecurityPolicy: "CSP", strictTransportSecurity: "HSTS", frameProtection: "frame protection", contentTypeOptions: "content type protection", referrerPolicy: "referrer policy", permissionsPolicy: "permissions policy", exposedFiles: "exposed files", frontendSecrets: "frontend secrets", mixedContent: "mixed content", cookieIssues: "cookie attributes", corsWildcardRoutes: "CORS policy", formCount: "forms" };
const securityCodes: Record<string, string> = { https: "SEC-01", tlsCertificate: "SEC-02", httpToHttps: "SEC-03", contentSecurityPolicy: "SEC-04", strictTransportSecurity: "SEC-05", frameProtection: "SEC-06", contentTypeOptions: "SEC-07", referrerPolicy: "SEC-08", permissionsPolicy: "SEC-09", exposedFiles: "SEC-10", frontendSecrets: "SEC-11", mixedContent: "SEC-12", cookieIssues: "SEC-13", corsWildcardRoutes: "SEC-14" };
const securityOrder = ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes"];
const recommendedHeaders = "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: camera=(), microphone=(), geolocation=()\nX-Frame-Options: DENY";

function EvidenceRows({ rows }: { rows: Array<{ label: string; value?: string | number; ok?: boolean }> }) {
  return <div className="check-evidence">{rows.map((row) => <div key={row.label}><span className="mono">{row.label}</span><strong className={`mono${row.ok === true ? " ok" : row.ok === false ? " bad" : ""}`}>{row.value === undefined || row.value === "" ? "Unavailable" : String(row.value)}</strong></div>)}</div>;
}

export function TechnicalReportSections({ scan, paidFindings, onRetryLighthouse, onUnlock, checkoutPending, checkoutMessage, checkoutSection }: { scan: ReportView; paidFindings?: Finding[]; onRetryLighthouse: () => Promise<boolean>; onUnlock: (section: string) => void; checkoutPending: boolean; checkoutMessage: string; checkoutSection: string }) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const lighthouse = scan.lighthouse?.[strategy];
  const lighthouseUnavailable = !lighthouse || [...Object.values(lighthouse)].every((metric) => metric.state === "unknown");
  const lighthouseHasUnknown = !lighthouse || Object.values(lighthouse).some((metric) => metric.state === "unknown");
  const shareImage = `/r/${encodeURIComponent(scan.id)}/opengraph-image`;
  const shareUrl = scan.url.replace(/[?#].*$/, "");
  async function retryLighthouse() { setRetrying(true); setRetryFailed(false); const ok = await onRetryLighthouse(); setRetrying(false); setRetryFailed(!ok); }

  return <>
    <section className="wrap depth-section lighthouse-section" aria-labelledby="lighthouse-title">
      <div className="report-section-title"><h2 id="lighthouse-title">Lighthouse.</h2><div className="report-aside"><span className="mono">TECHNICAL · {countLabel(scan.findingCounts?.technical).toUpperCase()}</span><span className="mono">{scan.lighthouse?.source ?? "via Google PageSpeed Insights"}</span></div></div>
      <div className="lighthouse-toggle" role="group" aria-label="Lighthouse device strategy">{(["mobile", "desktop"] as const).map((name) => <button type="button" key={name} aria-pressed={strategy === name} className={strategy === name ? "active" : ""} onClick={() => setStrategy(name)}>{name}</button>)}</div>
      <GlassCard className="lighthouse-glass" shellClassName="lighthouse-glass-shell">
      {lighthouseUnavailable ? <div className="lighthouse-unavailable"><p className="mono">Lighthouse unavailable — retry</p><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">Still unavailable. Try again later.</span>}</div> : <>
        <div className="lighthouse-scores" aria-label={`${strategy} Lighthouse scores`}>{strategies.map(([key, label]) => <div className="lighthouse-score" key={key}><span className="mono">{label}</span><strong className="mono">{displayCheck(lighthouse?.[key])}</strong></div>)}</div>
        <div className="vitals-row"><div><span className="mono">LCP</span><strong className="mono">{displayCheck(lighthouse?.lcp)}</strong></div><div><span className="mono">CLS</span><strong className="mono">{displayCheck(lighthouse?.cls)}</strong></div><div><span className="mono">INP / TBT</span><strong className="mono">{displayCheck(lighthouse?.inpTbt)}</strong></div></div>
        {lighthouseHasUnknown && <div className="lighthouse-metric-retry"><span className="mono">Some Lighthouse metrics are unavailable.</span><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">Still unavailable. Try again later.</span>}</div>}
      </>}
      </GlassCard>
    </section>

    {sections.map(([key, title]) => {
      const allFindings = scan.findings?.filter((finding) => finding.section === key) ?? [];
      const fullFindings = paidFindings?.filter((finding) => (finding.section ?? "other") === key) ?? [];
      const hasPaid = Boolean(paidFindings);
      const passed = key === "security" ? Object.entries(scan.checks ?? {}).filter(([name, check]) => passValue(name, check) && checkLabels[name] && ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets"].includes(name)).map(([name]) => checkLabels[name]) : [];
      const hasDesignMetrics = key === "design" && Boolean(scan.checks?.designFontFamilies || scan.checks?.designDistinctColors || scan.checks?.designContrastFailures);
      if (!allFindings.length && !passed.length && !hasDesignMetrics) return null;
      const counts = scan.findingCounts?.[key];
      const category = sectionCategory[key];
      const unknownChecks = category ? (categoryCheckKeys[category] ?? []).filter((name) => { const check = scan.checks?.[name]; return !check || check.state !== "checked"; }).map((name) => unknownCheckNames[name] ?? name) : [];
      const categoryScore = category ? scan.categoryScores?.[category] : undefined;
      const scoreCapped = !allFindings.length && unknownChecks.length > 0 && typeof categoryScore === "number" && categoryScore < 100;
      return <section className="wrap depth-section" aria-labelledby={`${key}-title`} key={key}>
        <div className="report-section-title"><h2 id={`${key}-title`}>{title}.</h2><span className="mono">{counts?.total ? countLabel(counts).toUpperCase() : "PASSED CHECKS"}</span></div>
        {scoreCapped && <p className="coverage-note section-coverage">No issues found here — the score sits at {categoryScore} because {unknownChecks.length === 1 ? "one check could" : `${unknownChecks.length} checks could`} not be confirmed: {unknownChecks.join(", ")}. Unconfirmed checks don&apos;t earn points.</p>}
        {key === "design" && scan.designReview?.state === "checked" && scan.designReview.dimensions && <div className="design-dimensions">{[["Hierarchy", "visualHierarchy"], ["Type", "typography"], ["Spacing", "spacingRhythm"], ["Palette", "paletteContrast"], ["Brand", "brandConsistency"], ["Generic signals", "genericSignals"]].map(([label, dimension]) => <div key={dimension}><span className="mono">{label}</span><strong className="mono">{scan.designReview?.dimensions?.[dimension] ?? "—"}</strong></div>)}</div>}
        {key === "design" && <div className="design-dimensions"><div><span className="mono">Font families</span><strong className="mono">{displayCheck(scan.checks?.designFontFamilies)}</strong></div><div><span className="mono">Distinct colors</span><strong className="mono">{displayCheck(scan.checks?.designDistinctColors)}</strong></div><div><span className="mono">WCAG failures</span><strong className="mono">{displayCheck(scan.checks?.designContrastFailures)}</strong></div></div>}
        {key === "security" && <EvidenceRows rows={securityOrder.map((name) => ({ label: `${securityCodes[name]} · ${checkLabels[name] ?? name}`, value: displayCheck(scan.checks?.[name]), ok: passValue(name, scan.checks?.[name]) }))} />}
        {key === "security" && <details className="category-passed-group section-passed-group"><summary className="mono">Recommended baseline headers — copy and adapt</summary><pre className="fix-snippet">{recommendedHeaders}</pre></details>}
        {key === "leftovers" && <EvidenceRows rows={[{ label: "Console error count", value: displayCheck(scan.checks?.consoleErrors) }, { label: "Console messages (first)", value: displayCheck(scan.checks?.consoleErrorDetails) }]} />}
        {key === "technical" && <EvidenceRows rows={[{ label: "TTFB (first byte)", value: displayCheck(scan.checks?.ttfb) }, { label: "Requests rendered", value: displayCheck(scan.checks?.requestCount) }, { label: "Transfer by type", value: displayCheck(scan.checks?.assetWeights) }, { label: "Largest assets", value: displayCheck(scan.checks?.largestAssets) }, { label: "Redirect chain", value: displayCheck(scan.checks?.redirectChain) }, { label: "Link checks", value: displayCheck(scan.checks?.sameOriginLinks) }, { label: "Broken link URLs", value: displayCheck(scan.checks?.brokenLinkDetails) }, { label: "Mobile fit", value: displayCheck(scan.checks?.mobileOverflow) }]} />}
        {key === "seo" && <EvidenceRows rows={[{ label: "Title", value: displayCheck(scan.checks?.title) }, { label: "Title length", value: displayCheck(scan.checks?.titleLength) }, { label: "Meta description", value: displayCheck(scan.checks?.description) }, { label: "Description length", value: displayCheck(scan.checks?.descriptionLength) }, { label: "Canonical", value: displayCheck(scan.checks?.canonical) }, { label: "Robots meta", value: displayCheck(scan.checks?.metaRobots) }, { label: "Sitemap", value: displayCheck(scan.checks?.sitemap) }, { label: "JSON-LD", value: displayCheck(scan.checks?.jsonLd) }, { label: "Hreflang entries", value: displayCheck(scan.checks?.hreflang) }, { label: "Redirect chain", value: displayCheck(scan.checks?.redirectChain) }]} />}
        {passed.length > 0 && <details className="category-passed-group section-passed-group"><summary className="mono">{passed.length} checks passed</summary><ul className="passed-checks">{passed.map((label) => <li className="mono" key={label}><span aria-hidden="true">✓</span>{label}</li>)}</ul></details>}
        {allFindings.map((summary) => {
          const markerNumber = (scan.findings ?? []).findIndex((item) => item.id === summary.id) + 1;
          const full = fullFindings.find((finding) => finding.id === summary.id);
          const finding = full ?? summary;
          const anchorId = (scan.findings ?? []).slice(0, 3).some((item) => item.id === finding.id) ? undefined : `finding-${finding.id}`;
          return <GlassCard as="article" id={anchorId} className={`depth-finding severity-card severity-${finding.severity}`} shellClassName="locked-finding-glass-shell" glow={false} key={summary.id}><span className="mono finding-index">{finding.code ?? String(markerNumber).padStart(2, "0")}</span><span className={`mono finding-meta severity-${finding.severity}`}>{finding.severity.toUpperCase()} · {finding.category.toUpperCase()}</span><h3>{finding.title}</h3><p>{finding.why_it_matters}</p>
            {hasPaid ? <><p><strong>Evidence:</strong> {full?.evidence}</p><p><strong>Fix:</strong> {full?.fix}</p></> : <div className="locked-detail"><p><strong>Evidence:</strong> {finding.evidence}</p><p className="locked-fix"><strong>Fix:</strong> <a href="#unlock">Included in the full report — ${PRICE_FIX_PROMPT_USD}</a></p></div>}
          </GlassCard>;
        })}
        {allFindings.length > 0 && !hasPaid && scan.checkoutAvailable && <><button className="inline-unlock" type="button" onClick={() => onUnlock(key)} disabled={checkoutPending}>{checkoutPending && checkoutSection === key ? "Opening checkout…" : `Unlock full report — $${PRICE_FIX_PROMPT_USD}`}</button>{checkoutMessage && checkoutSection === key && <p className="inline-status" role="status">{checkoutMessage}</p>}</>}
      </section>;
    })}

    <section className="wrap depth-section share-preview-section" aria-labelledby="share-preview-title">
      <div className="report-section-title"><h2 id="share-preview-title">Share preview.</h2><span className="mono">LINK CARD · NEUTRAL PREVIEW</span></div>
      <GlassCard className={`share-preview-card${shareImage ? "" : " share-preview-card-no-image"}`} shellClassName="share-preview-glass-shell">{shareImage && <div className="share-preview-image"><Image src={shareImage} alt="Open Graph image preview" fill unoptimized/></div>}<div className="share-preview-copy"><p className="mono">{new URL(shareUrl).hostname.toUpperCase()}</p><h3>{scan.sharePreview?.title || scan.title || "No share title was found"}</h3><p>{scan.sharePreview?.description || scan.description || "No share description was found."}</p><span className="share-preview-url mono">{shareUrl}</span></div></GlassCard>
    </section>
  </>;
}

export function LighthouseNumbers({ metrics }: { metrics?: LighthouseStrategy }) {
  return <div className="lighthouse-inline">{strategies.map(([key, label]) => <span key={key}><span className="mono">{label}</span><strong className="mono">{displayCheck(metrics?.[key])}</strong></span>)}</div>;
}
