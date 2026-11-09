"use client";

import Image from "next/image";
import { useState } from "react";
import type { AiCrawlerReport, LighthouseStrategy, LighthouseReport, LinkedPageAudit, MetricCheck } from "@/lib/types";
import { GlassCard } from "@/components/glass-card";
import { SHARE_FORMATS, type ShareFormat, type ShareVariant } from "@/lib/share-card";

type ReportView = { id: string; url: string; finalUrl?: string; title?: string; description?: string; lighthouse?: LighthouseReport; aiCrawlerReport?: AiCrawlerReport; linkedPages?: LinkedPageAudit[]; sharePreview?: { title: string; description: string }; shareImageAvailable?: boolean; checks?: Record<string, MetricCheck>; createdAt?: string };
const strategies = [["performance", "Performance"], ["accessibility", "Accessibility"], ["bestPractices", "Best Practices"], ["seo", "SEO"]] as const;
const displayCheck = (value?: { state?: string; value?: number | string }, unit = "") => value?.state === "checked" && value.value !== undefined ? `${value.value}${unit}` : "Unavailable";
const displayMetric = (value?: MetricCheck, unit = "") => value?.state === "checked" && value.value !== undefined ? `${value.value}${typeof value.value === "number" ? unit : ""}` : "Unavailable";
const browserTiming = (value?: MetricCheck, positive = true) => {
  if (!value || value.state !== "checked" || value.value === undefined) return "Unavailable";
  if (positive && (!Number.isFinite(parseFloat(String(value.value))) || parseFloat(String(value.value)) <= 0)) return "Unavailable";
  return String(value.value);
};
const crawlerPolicyLabels: Record<AiCrawlerReport["policies"][number]["policy"], string> = { blocked: "Blocked by matching rule", allowed: "Allowed by matching rule", no_matching_rule: "No matching rule", unknown: "Unknown" };
const preferenceLabels: Record<AiCrawlerReport["preferences"][number]["status"], string> = { blocked: "Disallowed for this path", allowed: "Allowed for this path", not_declared: "No matching declaration", unknown: "Unknown" };
export function TechnicalReportSections({ scan, onRetryLighthouse }: { scan: ReportView; onRetryLighthouse: (strategy: "mobile" | "desktop") => Promise<string | null> }) {
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const lighthouse = scan.lighthouse?.[strategy];
  const lighthouseUnavailable = !lighthouse || [...Object.values(lighthouse)].every((metric) => metric.state === "unknown");
  const lighthouseHasUnknown = !lighthouse || Object.values(lighthouse).some((metric) => metric.state === "unknown");
  const lighthouseNote = Object.values(lighthouse ?? {}).find((metric) => metric.state === "unknown" && metric.note)?.note;
  const crawlerCounts = scan.aiCrawlerReport?.policies.reduce((counts, bot) => ({ ...counts, [bot.policy]: counts[bot.policy] + 1 }), { allowed: 0, blocked: 0, no_matching_rule: 0, unknown: 0 });
  async function retryLighthouse() { setRetrying(true); setRetryFailed(false); setRetryMessage(""); const message = await onRetryLighthouse(strategy); setRetryMessage(message ?? ""); setRetrying(false); setRetryFailed(Boolean(message)); }

  return <>
    <section className="wrap depth-section lighthouse-section" data-category="technical" aria-labelledby="lighthouse-title">
      <div className="report-section-title"><h2 id="lighthouse-title">Performance evidence.</h2><span className="mono">{scan.lighthouse?.source ?? "Google PageSpeed Insights"} · lab run · {scan.createdAt ? new Date(scan.createdAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "time unavailable"}</span></div><p className="coverage-note">Lighthouse scores are out of 100 for the selected device. One lab run cannot predict every visitor experience.</p>
      <div className="lighthouse-toggle" role="group" aria-label="Lighthouse device strategy">{(["mobile", "desktop"] as const).map((name) => <button type="button" key={name} aria-pressed={strategy === name} className={strategy === name ? "active" : ""} onClick={() => setStrategy(name)}>{name}</button>)}</div>
      <GlassCard className="lighthouse-glass" shellClassName="lighthouse-glass-shell">
      {lighthouseUnavailable ? <div className="lighthouse-unavailable"><div><p className="mono">{strategy} PageSpeed metrics are unavailable.</p><p>{lighthouseNote ?? "No result was recorded for this strategy. Retry to request fresh measurements."}</p></div><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">{retryMessage || "PageSpeed could not return results. Try again later."}</span>}</div> : <>
        <div className="lighthouse-scores" aria-label={`${strategy} Lighthouse scores`}>{strategies.map(([key, label]) => <div className="lighthouse-score" key={key}><span className="mono">{label}</span><strong className="mono">{displayCheck(lighthouse?.[key])}</strong></div>)}</div>
        <div className="vitals-row"><div><span className="mono">LCP</span><strong className="mono">{displayMetric(lighthouse?.lcp, " ms")}</strong></div><div><span className="mono">CLS</span><strong className="mono">{displayMetric(lighthouse?.cls)}</strong></div><div><span className="mono">INP / TBT</span><strong className="mono">{displayMetric(lighthouse?.inpTbt, " ms")}</strong></div></div>
        {lighthouseHasUnknown && <div className="lighthouse-metric-retry"><span className="mono">Some Lighthouse metrics are unavailable.</span><button className="inline-unlock" type="button" onClick={() => void retryLighthouse()} disabled={retrying}>{retrying ? "Retrying…" : "Retry Lighthouse"}</button>{retryFailed && <span className="mono" role="status">{retryMessage || "PageSpeed could not return results. Try again later."}</span>}</div>}
      </>}
      </GlassCard>
      <div className="browser-timing"><h3>Browser timing · desktop capture</h3><p className="coverage-note">Playwright navigation and paint observations for the audited page. These are a separate lab source from PageSpeed. An unavailable timing means the browser did not record a positive event time; zero is not treated as a fast result.</p><div className="check-evidence">{([ ["DOMContentLoaded", "speedDcl"], ["Load complete", "speedLoad"], ["First contentful paint", "speedFcp"], ["Largest contentful paint", "speedLcp"], ["Layout shift", "speedCls"] ] as const).map(([label, key]) => <div key={key}><span>{label}</span><strong>{browserTiming(scan.checks?.[key], key !== "speedCls")}</strong></div>)}</div></div>
    </section>

    {Boolean(scan.linkedPages?.length) && <section className="wrap depth-section linked-pages-section" aria-labelledby="linked-pages-title">
      <div className="report-section-title"><div><h2 id="linked-pages-title">Linked pages sampled.</h2><p>Lightweight checks on up to four important same-site links.</p></div><span className="mono">HTML SIGNALS · NOT A FULL SITE CRAWL</span></div>
      <p className="coverage-note">The entry page receives the full desktop and mobile audit above. These linked pages are checked for HTTP availability and basic HTML signals only.</p>
      <div className="linked-pages-list">{scan.linkedPages?.map((page) => {
        let href: string | undefined;
        try { href = new URL(page.path, scan.finalUrl ?? scan.url).toString(); } catch { href = undefined; }
        return <article className="linked-page-row" key={page.path}>
          <div className="linked-page-heading"><a href={href} target="_blank" rel="noreferrer">{page.path}</a><span className={`linked-page-state linked-page-state--${page.state}`}>{page.state === "unknown" ? "Unknown" : `HTTP ${page.status ?? "—"}`}</span></div>
          <p className="linked-page-title">{page.title || page.note || "No page title detected."}</p>
          {page.state === "checked" && !page.note && <div className="linked-page-signals">
            <span>{page.descriptionPresent ? "Meta description present" : "Meta description missing"}</span>
            <span>{page.h1Count === 1 ? "1 H1" : `${page.h1Count ?? 0} H1 headings`}</span>
            <span>{page.imageCount ? `${page.imagesMissingAlt ?? 0}/${page.imageCount} images have no alt attribute` : "No images detected"}</span>
            <span>{page.noindex ? "Noindex set" : "No noindex detected"}</span>
          </div>}
          {page.state === "checked" && page.note && <p className="linked-page-note">{page.note}</p>}
          {page.state === "unknown" && <p className="linked-page-note">{page.note ?? "Could not confirm this page."}</p>}
        </article>;
      })}</div>
    </section>}

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
      <details className="ai-crawler-detail"><summary>Crawler policies ({scan.aiCrawlerReport.policies.length})</summary><div className="ai-crawler-list">{scan.aiCrawlerReport.policies.map((bot) => <article className={`ai-crawler-row ai-crawler-row--${bot.policy}`} key={bot.userAgent}><div className="ai-crawler-title"><strong>{bot.name}</strong><span className="mono">{crawlerPolicyLabels[bot.policy]}</span></div><p className="mono">{bot.userAgent} · {bot.purpose}</p><p>{bot.matchedRules.length ? bot.matchedRules.map((rule) => `${rule.directive}: ${rule.path}`).join(" · ") : "No matching robots.txt directive for this path."}</p></article>)}</div></details>
      <details className="ai-crawler-detail ai-data-use"><summary>Training and data-use preference signals ({scan.aiCrawlerReport.preferences.length})</summary><p>Shown separately from the score. A robots.txt declaration is a preference signal, not proof that a provider honors it or how it uses data.</p><div className="ai-crawler-list">{scan.aiCrawlerReport.preferences.map((preference) => <article className="ai-crawler-row" key={preference.signal}><div className="ai-crawler-title"><strong>{preference.label}</strong><span className="mono">{preferenceLabels[preference.status]}</span></div><p className="mono">{preference.signal}{preference.matchedRules.length ? ` · ${preference.matchedRules.map((rule) => `${rule.directive}: ${rule.path}`).join(" · ")}` : " · no matching declaration"}</p></article>)}</div></details>
      <p className="coverage-note">{scan.aiCrawlerReport.note}</p>
    </section>}

    <section className="wrap depth-section owner-checks-section" aria-labelledby="owner-checks-title">
      <div className="report-section-title"><div><h2 id="owner-checks-title">Code and operations checks.</h2><p>Important launch checks this public scan cannot verify.</p></div><span className="mono">OWNER CONFIRMATION · NOT SCORED</span></div>
      <details className="owner-checks">
        <summary>Open owner checklist <span>7 checks</span></summary>
        <p className="coverage-note">These require repository, account, or infrastructure access. This report has not verified them. Skip anything that does not apply to your app.</p>
        <div className="owner-check-grid">
          <article><span className="mono">DATA &amp; ACCESS</span><strong>Access controls and rate limits</strong><p>Review server endpoints, not only the visible interface. Confirm sensitive routes require the right access and public endpoints are rate limited.</p></article>
          <article><span className="mono">DATA &amp; ACCESS</span><strong>Backups and restore</strong><p>Confirm production data is backed up and that a restore has been tested.</p></article>
          <article><span className="mono">SECRETS</span><strong>Repository history</strong><p>Check current files and commit history for exposed credentials. Rotate any key that was exposed.</p></article>
          <article><span className="mono">BILLING</span><strong>Spend limits and alerts</strong><p>For paid APIs, including AI providers, set a budget limit and alerts before launch.</p></article>
          <article><span className="mono">RELEASE</span><strong>Rollback path</strong><p>Know how to restore the last working version if a deployment causes problems.</p></article>
          <article><span className="mono">TESTING</span><strong>Automated checks</strong><p>Run unit or regression tests and a launch smoke check in CI before publishing.</p></article>
          <article><span className="mono">AI APPS · IF APPLICABLE</span><strong>Model failure handling</strong><p>Test slow or unavailable model responses, prompt injection, and token or context limits.</p></article>
        </div>
        <p className="owner-check-attribution">Checklist inspired by the <a href="https://github.com/pepperworks/vibe-coders-checklist" target="_blank" rel="noreferrer">Vibe Coder’s Production Ready Checklist</a>.</p>
      </details>
    </section>

  </>;
}


export function ReportSharePreview({ scan }: { scan: Pick<ReportView, "id"> }) {
  const [shareVariant, setShareVariant] = useState<ShareVariant>("score");
  const [shareFormat, setShareFormat] = useState<ShareFormat>("og");
  return <>
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
      <div className="share-preview-card share-preview-card-single">
        <div className="share-card-preview-image" style={{ aspectRatio: `${SHARE_FORMATS[shareFormat].width} / ${SHARE_FORMATS[shareFormat].height}` }}>
          <Image src={`/r/${encodeURIComponent(scan.id)}/share?variant=${shareVariant}&format=${shareFormat}`} alt={`VERDKT ${shareVariant} card preview`} width={SHARE_FORMATS[shareFormat].width} height={SHARE_FORMATS[shareFormat].height} unoptimized />
        </div>
      </div>
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
