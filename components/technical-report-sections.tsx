"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import type { AiCrawlerReport, Category, Finding, LighthouseStrategy, LighthouseReport, MetricCheck } from "@/lib/types";
import { CATEGORY_CHECKS } from "@/config/scoring";
import { GlassCard } from "@/components/glass-card";
import { PRICE_FIX_PROMPT_USD } from "@/config/release";
import { SHARE_FORMATS, type ShareFormat, type ShareVariant } from "@/lib/share-card";
import { getCheckLedger, type CheckStatus } from "@/lib/report-artifacts";
import { SEVERITY_PENALTY } from "@/lib/score";
import { categoryAccent } from "@/lib/report-visuals";

type SectionCount = { total: number; critical: number; high: number; medium: number; low: number };
type ReportView = { id: string; url: string; title?: string; description?: string; lighthouse?: LighthouseReport; aiCrawlerReport?: AiCrawlerReport; sharePreview?: { title: string; description: string }; findingCounts?: Record<string, SectionCount>; shareImageAvailable?: boolean; checks?: Record<string, MetricCheck>; checkoutAvailable?: boolean; findings?: Finding[]; designReview?: { state: "checked" | "unknown"; dimensions?: Record<string, number>; score?: number }; categoryScores?: Record<string, number | undefined>; categoryCoverage?: Partial<Record<Category, number>>; scoringVersion?: number };
const strategies = [["performance", "Performance"], ["accessibility", "Accessibility"], ["bestPractices", "Best Practices"], ["seo", "SEO"]] as const;
const sections = [["design", "Design & Brand"], ["security", "Security"], ["seo", "SEO"], ["leftovers", "Vibe-coded leftovers"], ["forms", "Forms & CTA"], ["technical", "Technical"], ["other", "Additional findings"]] as const;
const displayCheck = (value?: { state?: string; value?: number | string }) => value?.state === "checked" && value.value !== undefined ? value.value : "Unavailable";
const countLabel = (counts?: SectionCount) => {
  if (!counts?.total) return "";
  const parts = (["critical", "high", "medium", "low"] as const).filter((level) => counts[level]).map((level) => `${counts[level]} ${level}`);
  return `${counts.total} finding${counts.total === 1 ? "" : "s"} · ${parts.join(" · ")}`;
};
const crawlerPolicyLabels: Record<AiCrawlerReport["policies"][number]["policy"], string> = { blocked: "Blocked by matching rule", allowed: "Allowed by matching rule", no_matching_rule: "No matching rule", unknown: "Unknown" };
const preferenceLabels: Record<AiCrawlerReport["preferences"][number]["status"], string> = { blocked: "Disallowed for this path", allowed: "Allowed for this path", not_declared: "No matching declaration", unknown: "Unknown" };
const priorityLabels: Record<Finding["severity"], string> = { critical: "P1", high: "P2", medium: "P3", low: "P4" };
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

const sectionCategory: Record<string, Category> = { design: "design_brand", security: "security", seo: "seo_aeo", leftovers: "technical", forms: "conversion", technical: "technical" };
const categoryCheckKeys = CATEGORY_CHECKS;
const unknownCheckNames: Record<string, string> = { pageSpeedMobile: "mobile Lighthouse performance", pageSpeedDesktop: "desktop Lighthouse performance", lighthouseMobileAccessibility: "mobile accessibility", lighthouseDesktopAccessibility: "desktop accessibility", lighthouseMobileBestPractices: "mobile best practices", lighthouseDesktopBestPractices: "desktop best practices", lighthouseMobileSeo: "mobile Lighthouse SEO", lighthouseDesktopSeo: "desktop Lighthouse SEO", designContrastFailures: "text contrast review", primaryCtaTargets: "primary action destinations", mobileOverflow: "mobile fit", title: "page title", description: "meta description", h1Count: "heading structure", headingOrder: "heading order", proofSignals: "proof signals", pricing: "pricing information", faq: "FAQ", contact: "contact path", ogTitle: "share title", ogDescription: "share description", twitterCard: "X card metadata", status: "page response", redirects: "redirect chain", sitemap: "sitemap.xml", imageAltCoverage: "image descriptions", consoleErrors: "browser errors", https: "HTTPS", tlsCertificate: "TLS certificate", httpToHttps: "HTTPS redirect", contentSecurityPolicy: "CSP", strictTransportSecurity: "HSTS", frameProtection: "frame protection", contentTypeOptions: "content type protection", referrerPolicy: "referrer policy", permissionsPolicy: "permissions policy", exposedFiles: "exposed files", frontendSecrets: "frontend secrets", mixedContent: "mixed content", cookieIssues: "cookie attributes", corsWildcardRoutes: "CORS policy", formCount: "forms", contentReview: "content and clarity review", designReview: "visual design review" };
const securityCodes: Record<string, string> = { https: "SEC-01", tlsCertificate: "SEC-02", httpToHttps: "SEC-03", contentSecurityPolicy: "SEC-04", strictTransportSecurity: "SEC-05", frameProtection: "SEC-06", contentTypeOptions: "SEC-07", referrerPolicy: "SEC-08", permissionsPolicy: "SEC-09", exposedFiles: "SEC-10", frontendSecrets: "SEC-11", mixedContent: "SEC-12", cookieIssues: "SEC-13", corsWildcardRoutes: "SEC-14" };
const securityOrder = ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes"];
const categoryLabels: Record<Category, string> = { clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust", technical: "Technical", security: "Security", seo_aeo: "SEO / AEO" };

function EvidenceRows({ rows }: { rows: Array<{ label: string; value?: string | number; ok?: boolean }> }) {
  return <div className="check-evidence">{rows.map((row) => <div key={row.label}><span className="mono">{row.label}</span><strong className={`mono${row.ok === true ? " ok" : row.ok === false ? " bad" : ""}`}>{row.value === undefined || row.value === "" ? "Unavailable" : String(row.value)}</strong></div>)}</div>;
}

export function TechnicalReportSections({ scan, paidFindings, onRetryLighthouse, onUnlock, checkoutPending, checkoutMessage, checkoutSection }: { scan: ReportView; paidFindings?: Finding[]; onRetryLighthouse: () => Promise<boolean>; onUnlock: (section: string) => void; checkoutPending: boolean; checkoutMessage: string; checkoutSection: string }) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [shareVariant, setShareVariant] = useState<ShareVariant>("score");
  const [shareFormat, setShareFormat] = useState<ShareFormat>("og");
  const lighthouse = scan.lighthouse?.[strategy];
  const lighthouseUnavailable = !lighthouse || [...Object.values(lighthouse)].every((metric) => metric.state === "unknown");
  const lighthouseHasUnknown = !lighthouse || Object.values(lighthouse).some((metric) => metric.state === "unknown");
  const lighthouseNote = Object.values(lighthouse ?? {}).find((metric) => metric.state === "unknown" && metric.note)?.note;
  const checkLedger = getCheckLedger(scan.checks, scan.findings);
  const ledgerCounts = checkLedger.reduce<Record<CheckStatus, number>>((counts, row) => ({ ...counts, [row.status]: counts[row.status] + 1 }), { pass: 0, issue: 0, review: 0, unknown: 0, not_applicable: 0, measured: 0 });
  const aeoRows = checkLedger.filter((row) => row.category === "SEO / AEO");
  const aeoCounts = aeoRows.reduce<Record<CheckStatus, number>>((counts, row) => ({ ...counts, [row.status]: counts[row.status] + 1 }), { pass: 0, issue: 0, review: 0, unknown: 0, not_applicable: 0, measured: 0 });
  const crawlerCounts = scan.aiCrawlerReport?.policies.reduce((counts, bot) => ({ ...counts, [bot.policy]: counts[bot.policy] + 1 }), { allowed: 0, blocked: 0, no_matching_rule: 0, unknown: 0 });
  async function retryLighthouse() { setRetrying(true); setRetryFailed(false); const ok = await onRetryLighthouse(); setRetrying(false); setRetryFailed(!ok); }

  return <>
    <section className="wrap depth-section lighthouse-section" data-category="technical" style={{ "--category-accent": categoryAccent("technical") } as CSSProperties} aria-labelledby="lighthouse-title">
      <div className="report-section-title"><h2 id="lighthouse-title">Lighthouse.</h2><div className="report-aside"><span className="mono">TECHNICAL · {countLabel(scan.findingCounts?.technical).toUpperCase()}</span><span className="mono">{scan.lighthouse?.source ?? "via Google PageSpeed Insights"}</span></div></div>
      <div className="lighthouse-toggle" role="group" aria-label="Lighthouse device strategy">{(["mobile", "desktop"] as const).map((name) => <button type="button" key={name} aria-pressed={strategy === name} className={strategy === name ? "active" : ""} onClick={() => setStrategy(name)}>{name}</button>)}</div>
      <GlassCard className="lighthouse-glass" shellClassName="lighthouse-glass-shell">
      {lighthouseUnavailable ? <div className="lighthouse-unavailable"><div><p className="mono">{strategy} PageSpeed metrics are unavailable.</p><p>{lighthouseNote ?? "No result was recorded for this strategy. Retry to request fresh measurements."}</p></div><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">Still unavailable. Try again later.</span>}</div> : <>
        <div className="lighthouse-scores" aria-label={`${strategy} Lighthouse scores`}>{strategies.map(([key, label]) => <div className="lighthouse-score" key={key}><span className="mono">{label}</span><strong className="mono">{displayCheck(lighthouse?.[key])}</strong></div>)}</div>
        <div className="vitals-row"><div><span className="mono">LCP</span><strong className="mono">{displayCheck(lighthouse?.lcp)}</strong></div><div><span className="mono">CLS</span><strong className="mono">{displayCheck(lighthouse?.cls)}</strong></div><div><span className="mono">INP / TBT</span><strong className="mono">{displayCheck(lighthouse?.inpTbt)}</strong></div></div>
        {lighthouseHasUnknown && <div className="lighthouse-metric-retry"><span className="mono">Some Lighthouse metrics are unavailable.</span><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">Still unavailable. Try again later.</span>}</div>}
      </>}
      </GlassCard>
    </section>

    {scan.aiCrawlerReport && <section className="wrap depth-section ai-crawler-section" aria-labelledby="ai-crawler-title">
      <div className="report-section-title"><h2 id="ai-crawler-title">AI crawlers.</h2><span className="mono">ROBOTS.TXT · NOT SCORED</span></div>
      <p className="coverage-note">Policy read for <strong>{scan.aiCrawlerReport.robotsUrl ?? "robots.txt"}</strong> and the scanned path. This is not a request made as any listed bot.</p>
      {scan.aiCrawlerReport.state === "unknown" && <p className="coverage-note">robots.txt could not be confirmed; crawler policies remain unknown.</p>}
      <div className="ai-crawler-summary" aria-label="robots.txt policy summary">
        <div><span className="mono">Allowed by robots</span><strong className="mono">{crawlerCounts?.allowed ?? 0}</strong></div>
        <div><span className="mono">Blocked by robots</span><strong className="mono">{crawlerCounts?.blocked ?? 0}</strong></div>
        <div><span className="mono">No matching rule</span><strong className="mono">{crawlerCounts?.no_matching_rule ?? 0}</strong></div>
        <div><span className="mono">Unknown</span><strong className="mono">{crawlerCounts?.unknown ?? 0}</strong></div>
        <div><span className="mono">Data-use preferences</span><strong className="mono">{scan.aiCrawlerReport.preferences.length}</strong></div>
      </div>
      <div className="ai-crawler-list">{scan.aiCrawlerReport.policies.map((bot) => <article className={`ai-crawler-row ai-crawler-row--${bot.policy}`} key={bot.userAgent}><div className="ai-crawler-title"><strong>{bot.name}</strong><span className="mono">{crawlerPolicyLabels[bot.policy]}</span></div><p className="mono">{bot.userAgent} · {bot.purpose}</p><p>{bot.matchedRules.length ? bot.matchedRules.map((rule) => `${rule.directive}: ${rule.path}`).join(" · ") : "No matching robots.txt directive for this path."}</p></article>)}</div>
      <div className="ai-data-use"><h3>Training and data-use preference signals</h3><p>Shown separately from the score. A robots.txt declaration is a preference signal, not proof that a provider honors it or how it uses data.</p><div className="ai-crawler-list">{scan.aiCrawlerReport.preferences.map((preference) => <article className="ai-crawler-row" key={preference.signal}><div className="ai-crawler-title"><strong>{preference.label}</strong><span className="mono">{preferenceLabels[preference.status]}</span></div><p className="mono">{preference.signal}{preference.matchedRules.length ? ` · ${preference.matchedRules.map((rule) => `${rule.directive}: ${rule.path}`).join(" · ")}` : " · no matching declaration"}</p></article>)}</div></div>
      <p className="coverage-note">{scan.aiCrawlerReport.note}</p>
    </section>}

    {sections.map(([key, title]) => {
      const allFindings = scan.findings?.filter((finding) => finding.section === key) ?? [];
      const fullFindings = paidFindings?.filter((finding) => (finding.section ?? "other") === key) ?? [];
      const hasPaid = Boolean(paidFindings);
      const passed = key === "security" ? Object.entries(scan.checks ?? {}).filter(([name, check]) => passValue(name, check) && checkLabels[name] && ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets"].includes(name)).map(([name]) => checkLabels[name]) : [];
      const hasDesignMetrics = key === "design" && Boolean(scan.checks?.designFontFamilies || scan.checks?.designDistinctColors || scan.checks?.designContrastFailures);
      const hasSeoReadiness = key === "seo" && Boolean(scan.checks && Object.keys(scan.checks).length > 0) && aeoRows.length > 0;
      if (!allFindings.length && !passed.length && !hasDesignMetrics && !hasSeoReadiness) return null;
      const counts = scan.findingCounts?.[key];
      const category = sectionCategory[key];
      const unknownChecks = category ? categoryCheckKeys[category].filter((name) => !scan.checks?.[name] || scan.checks[name].state === "unknown").map((name) => unknownCheckNames[name] ?? name) : [];
      const notApplicableChecks = category ? categoryCheckKeys[category].filter((name) => scan.checks?.[name]?.state === "not_applicable").map((name) => unknownCheckNames[name] ?? name) : [];
      const categoryScore = category ? scan.categoryScores?.[category] : undefined;
      const categoryCoverage = category ? scan.categoryCoverage?.[category] : undefined;
      const scoreCapped = !allFindings.length && typeof categoryScore === "number" && categoryScore < 100 && (categoryCoverage !== undefined ? categoryCoverage < 1 : unknownChecks.length > 0);
      return <section className="wrap depth-section" data-category={category} style={category ? { "--category-accent": categoryAccent(category) } as CSSProperties : undefined} aria-labelledby={`${key}-title`} key={key}>
        <div className="report-section-title"><h2 id={`${key}-title`}>{title}.</h2><span className="mono">{counts?.total ? countLabel(counts).toUpperCase() : "PASSED CHECKS"}</span></div>
        {scoreCapped && <p className="coverage-note section-coverage">No issues found here — the score sits at {categoryScore}. {unknownChecks.length > 0 && <>Unconfirmed checks: {unknownChecks.join(", ")}. </>}{notApplicableChecks.length > 0 && <>Excluded as not applicable: {notApplicableChecks.join(", ")}. </>}Unconfirmed checks don&apos;t earn points.</p>}
        {key === "design" && scan.designReview?.state === "checked" && scan.designReview.dimensions && <div className="design-dimensions">{[["Hierarchy", "visualHierarchy"], ["Type", "typography"], ["Spacing", "spacingRhythm"], ["Palette", "paletteContrast"], ["Brand", "brandConsistency"], ["Generic signals", "genericSignals"]].map(([label, dimension]) => <div key={dimension}><span className="mono">{label}</span><strong className="mono">{scan.designReview?.dimensions?.[dimension] ?? "—"}</strong></div>)}</div>}
        {key === "design" && <div className="design-dimensions"><div><span className="mono">Font families</span><strong className="mono">{displayCheck(scan.checks?.designFontFamilies)}</strong></div><div><span className="mono">Distinct colors</span><strong className="mono">{displayCheck(scan.checks?.designDistinctColors)}</strong></div><div><span className="mono">WCAG failures</span><strong className="mono">{displayCheck(scan.checks?.designContrastFailures)}</strong></div></div>}
        {key === "security" && <EvidenceRows rows={securityOrder.map((name) => ({ label: `${securityCodes[name]} · ${checkLabels[name] ?? name}`, value: displayCheck(scan.checks?.[name]), ok: passValue(name, scan.checks?.[name]) }))} />}

        {key === "leftovers" && <EvidenceRows rows={[{ label: "Console error count", value: displayCheck(scan.checks?.consoleErrors) }, { label: "Console messages (first)", value: displayCheck(scan.checks?.consoleErrorDetails) }]} />}
        {key === "technical" && <EvidenceRows rows={[{ label: "Whole-site coverage", value: displayCheck(scan.checks?.wholeSitePages) }, { label: "TTFB (first byte)", value: displayCheck(scan.checks?.ttfb) }, { label: "Requests rendered", value: displayCheck(scan.checks?.requestCount) }, { label: "Transfer by type", value: displayCheck(scan.checks?.assetWeights) }, { label: "Largest assets", value: displayCheck(scan.checks?.largestAssets) }, { label: "Redirect chain", value: displayCheck(scan.checks?.redirectChain) }, { label: "Link checks", value: displayCheck(scan.checks?.sameOriginLinks) }, { label: "Broken link URLs", value: displayCheck(scan.checks?.brokenLinkDetails) }, { label: "Mobile fit", value: displayCheck(scan.checks?.mobileOverflow) }]} />}
        {key === "seo" && <section className="aeo-readiness" aria-labelledby="aeo-readiness-title"><div className="aeo-readiness-heading"><h3 id="aeo-readiness-title">Page-level SEO / AEO readiness</h3><span className="mono">{aeoCounts.pass} pass · {aeoCounts.issue} issues · {aeoCounts.review} review · {aeoCounts.unknown} unknown</span></div><div className="aeo-readiness-grid">{aeoRows.map((row) => <article className={`aeo-readiness-item aeo-readiness-item--${row.status}`} key={row.key}><div><strong>{row.label}</strong><span className={`mono check-ledger-status check-ledger-status--${row.status}`}>{row.status === "issue" ? "NEEDS ATTENTION" : row.status.replaceAll("_", " ").toUpperCase()}</span></div><p>{row.value ?? row.note ?? (row.status === "unknown" ? "Not confirmed for this scan." : "No value returned.")}</p></article>)}</div></section>}
        {passed.length > 0 && <details className="category-passed-group section-passed-group"><summary className="mono">{passed.length} checks passed</summary><ul className="passed-checks">{passed.map((label) => <li className="mono" key={label}><span aria-hidden="true">✓</span>{label}</li>)}</ul></details>}
        {allFindings.map((summary) => {
          const markerNumber = (scan.findings ?? []).findIndex((item) => item.id === summary.id) + 1;
          const full = fullFindings.find((finding) => finding.id === summary.id);
          const finding = full ?? summary;
          const unlocked = Boolean(full);
          const anchorId = (scan.findings ?? []).slice(0, 3).some((item) => item.id === finding.id) ? undefined : `finding-${finding.id}`;
          return <article id={anchorId} data-category={finding.category} style={{ "--category-accent": categoryAccent(finding.category) } as CSSProperties} className={`depth-finding severity-card severity-${finding.severity}`} key={summary.id}>
            <div className="finding-meta-row"><div className="finding-meta-tags"><span className="mono finding-index">{finding.code ?? String(markerNumber).padStart(2, "0")}</span><span className="mono finding-status">Needs attention</span><span className="mono finding-category">{categoryLabels[finding.category]}</span><span className="mono finding-priority">Priority {priorityLabels[finding.severity]}</span></div><strong className="mono finding-rule-loss">−{SEVERITY_PENALTY[finding.severity]} rule points</strong></div>
            <h3>{finding.title}</h3>
    <div className="finding-info-grid"><section><h4>Why this needs attention</h4><p>{finding.why_it_matters}</p></section><section><h4>Evidence recorded</h4><p>{summary.evidence ?? finding.evidence ?? "Evidence was not recorded for this finding."}</p></section></div>
            <div className="finding-correction-grid"><section><h4>Recommended correction</h4>{unlocked ? <p>{full?.fix ?? "No remediation was returned for this finding."}</p> : <p>Unlock the site-specific correction, implementation steps, and tool-ready prompt in the full report for ${PRICE_FIX_PROMPT_USD}.</p>}</section><section><h4>Priority</h4><p>{priorityLabels[finding.severity]} · {finding.severity.toUpperCase()} · {SEVERITY_PENALTY[finding.severity]} rule points at stake</p></section></div>
            {!unlocked && <p className="finding-unlock-link"><a href="#unlock">Unlock the site-specific correction — ${PRICE_FIX_PROMPT_USD}</a></p>}
          </article>;
        })}
        {allFindings.length > 0 && !hasPaid && scan.checkoutAvailable && <><button className="inline-unlock" type="button" onClick={() => onUnlock(key)} disabled={checkoutPending}>{checkoutPending && checkoutSection === key ? "Opening checkout…" : `Unlock full report — $${PRICE_FIX_PROMPT_USD}`}</button>{checkoutMessage && checkoutSection === key && <p className="inline-status" role="status">{checkoutMessage}</p>}</>}
      </section>;
    })}

    {checkLedger.length > 0 && <section className="wrap depth-section full-check-ledger" aria-labelledby="check-ledger-title">
      <div className="report-section-title"><h2 id="check-ledger-title">Full check list.</h2><span className="mono">{checkLedger.length} CHECKS · {ledgerCounts.issue} ISSUES · {ledgerCounts.pass} PASSED</span></div>
      <p className="coverage-note">Measured checks without a pass/fail rule stay neutral. Unknown checks are never counted as passes.</p>
      <details className="category-passed-group section-passed-group">
        <summary className="mono">Show all {checkLedger.length} check results · {ledgerCounts.unknown} unknown · {ledgerCounts.measured} measured</summary>
        <div className="check-evidence">{checkLedger.map((row) => <div className={`check-ledger-row check-ledger-row--${row.status}`} key={row.key}>
          <span className="check-ledger-label"><span className={`mono check-ledger-status check-ledger-status--${row.status}`}>{row.status === "issue" ? "NEEDS ATTENTION" : row.status.toUpperCase()} · {row.category}</span><span>{row.label}</span></span>
          <strong className="mono">{row.value ?? row.note ?? (row.status === "unknown" ? "Not confirmed" : "No value returned")}</strong>
        </div>)}</div>
      </details>
    </section>}

    <section className="wrap depth-section share-preview-section" aria-labelledby="share-preview-title">
      <div className="report-section-title"><h2 id="share-preview-title">Share your score.</h2><span className="mono">LIVE PREVIEW · PNG EXPORT</span></div>
      <div className="share-card-controls">
        <div className="share-card-group" role="group" aria-label="Card style">
          {([["score", "Score card"], ["findings", "Findings card"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={shareVariant === value} className={shareVariant === value ? "active" : ""} onClick={() => setShareVariant(value)}>{label}</button>)}
        </div>
        <div className="share-card-group" role="group" aria-label="Format">
          {(["og", "portrait", "story"] as const).map((value) => <button key={value} type="button" aria-pressed={shareFormat === value} className={shareFormat === value ? "active" : ""} onClick={() => setShareFormat(value)}>{SHARE_FORMATS[value].label}</button>)}
        </div>
      </div>
      <GlassCard className="share-preview-card share-preview-card-single" shellClassName="share-preview-glass-shell">
        <div className="share-card-preview-image" style={{ aspectRatio: `${SHARE_FORMATS[shareFormat].width} / ${SHARE_FORMATS[shareFormat].height}`, width: Math.min(720, 640 * SHARE_FORMATS[shareFormat].width / SHARE_FORMATS[shareFormat].height) }}>
          <Image src={`/r/${encodeURIComponent(scan.id)}/share?variant=${shareVariant}&format=${shareFormat}`} alt={`VERDKT ${shareVariant} card preview`} width={SHARE_FORMATS[shareFormat].width} height={SHARE_FORMATS[shareFormat].height} unoptimized />
        </div>
      </GlassCard>
      <div className="share-card-actions">
        <a className="inline-unlock" href={`/r/${encodeURIComponent(scan.id)}/share?variant=${shareVariant}&format=${shareFormat}&download=1`} download={`verdkt-${shareVariant}-${shareFormat}.png`}>Download PNG</a>
        <span className="mono">{SHARE_FORMATS[shareFormat].label} · {shareVariant === "score" ? "score card" : "findings card"}</span>
      </div>
    </section>
  </>;
}

export function LighthouseNumbers({ metrics }: { metrics?: LighthouseStrategy }) {
  return <div className="lighthouse-inline">{strategies.map(([key, label]) => <span key={key}><span className="mono">{label}</span><strong className="mono">{displayCheck(metrics?.[key])}</strong></span>)}</div>;
}
