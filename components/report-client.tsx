"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { RELEASE_CODE, PRICE_FIX_PROMPT_USD, PRODUCT_NAME } from "@/config/release";
import { track } from "@/lib/analytics-client";
import type { Finding, MetricCheck, ScanRecord } from "@/lib/types";

type FreeReport = ReturnType<typeof import("@/lib/store").publicScan>;
const labels: Record<string, string> = { clarity: "Clarity", conversion: "Conversion", trust: "Trust", technical: "Technical" };
const scoreDisplay = (score: number) => String(score).padStart(2, "0");

export function ReportClient({ initial }: { initial: FreeReport }) {
  const [scan, setScan] = useState(initial as FreeReport & { findings?: Finding[]; lockedTitles?: string[]; lockedCount?: number });
  const [paidData, setPaidData] = useState<{ available: boolean; findings: Finding[]; prompts: Record<string, string>; copyDrafts: { status: string; headlines: string[]; subheadline: string; cta: string; faq: string; metaTitle: string; metaDescription: string } } | undefined>();
  const [tool, setTool] = useState("Cursor"); const [copyStatus, setCopyStatus] = useState(""); const [shareStatus, setShareStatus] = useState(""); const [emailStatus, setEmailStatus] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [accessStatus, setAccessStatus] = useState("");
  const [animatedScore, setAnimatedScore] = useState<number | null>(null);
  const params = useParams<{ id: string }>(); const searchParams = useSearchParams();
  const id = params.id;
  useEffect(() => {
    if (["queued", "scanning"].includes(scan.status)) {
      const timer = setInterval(async () => {
        try { const response = await fetch(`/api/scans/${encodeURIComponent(id)}`, { cache: "no-store" }); if (response.ok) { const next = await response.json(); setScan(next); } } catch { /* transient polling error; next interval will retry */ }
      }, 1100);
      return () => clearInterval(timer);
    }
  }, [id, scan.status]);
  useEffect(() => {
    if (scan.status === "complete" && typeof window !== "undefined") {
      let cancelled = false;
      void fetch(`/api/scans/${encodeURIComponent(id)}/paid`, { cache: "no-store" }).then(async (response) => {
        if (response.ok && !cancelled) setPaidData(await response.json());
      }).catch(() => undefined);
      return () => { cancelled = true; };
    }
  }, [id, scan.status]);
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
  const speedUnavailable = scan.checks?.pageSpeedMobile?.state !== "checked" || scan.checks?.pageSpeedDesktop?.state !== "checked";
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
  async function checkout() {
    setCheckoutPending(true); setEmailStatus("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: id }) });
      const result = await response.json(); if (!response.ok || !result.url) throw new Error(result.error ?? "Checkout could not be started.");
      track("checkout_started");
      window.location.href = result.url;
    } catch (error) { setEmailStatus(error instanceof Error ? error.message : "Checkout could not be started."); setCheckoutPending(false); }
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

  return <main className="report-page">
    <header className="wrap masthead"><Link className="brand" href="/"><span className="brand-mark">{RELEASE_CODE}</span><span>{PRODUCT_NAME}</span></Link><span className="mast-meta">{scan.domain ?? "PAGE REVIEW"}</span></header>
    {!completed && scan.status !== "failed" && <section className="wrap scan-progress" aria-live="polite"><h1>{scan.phase}</h1><p>Rendering the live page and checking the details we can verify.</p><ol className="progress-log">{(scan.phaseHistory ?? []).map((phase, index) => <li className="done mono" key={`${phase}-${index}`}>{phase}</li>)}<li className="active mono"><span className="live-dot" aria-hidden="true"/>{scan.phase}</li></ol></section>}
    {scan.status === "failed" && <section className="wrap scan-progress"><h1>This page could not be reviewed.</h1><p>{scan.error ?? "It may be unavailable or taking too long to respond."}</p><Link className="text-link" href="/">Try another page →</Link></section>}
    {completed && <>
      <section className="wrap report-hero">
        <div className="report-domain">{scan.domain} <span>·</span> {scan.id === "example" ? "EXAMPLE REPORT · 31 OCT 2026" : "LAUNCH SCORE"}</div>
        {scan.id === "example" && <p className="example-report-note">A real scan of the studio site. PageSpeed and language-model checks were unavailable when it ran.</p>}
        <div className="score-overview">
        <div className="score-line" role="img" aria-label={`${PRODUCT_NAME}: ${scan.score ?? 0} out of 100`}><span className="score-number" aria-hidden="true">{scoreDisplay(animatedScore ?? scan.score ?? 0)}</span><span className="score-denom" aria-hidden="true">/100</span><span className="score-tick" aria-hidden="true"/></div>
        <p className="coverage-note score-coverage">{partial ? "Partial assessment" : "Assessment complete"} · {contentUnavailable ? "AI review unavailable" : "AI review complete"} · {speedUnavailable ? "PageSpeed unavailable" : "PageSpeed checked"}. Unknown checks do not add points.</p>
        {searchParams.get("checkout") === "complete" && <p className="inline-status" role="status">Your checkout returned to this report. Once the payment is verified, we’ll email a secure purchaser link for the full report.</p>}
        {searchParams.get("checkout") === "cancelled" && <p className="inline-status" role="status">Checkout was cancelled. Your free report is still available here.</p>}
        </div>
        <div className="score-summary"><h1>{scan.title ? `A first look at ${scan.title}` : "Your launch page, at a glance."}</h1><p>Four angles on whether a new visitor can understand, trust, and act on your page.</p></div>
        <div className="score-categories">{Object.entries(labels).map(([key, label]) => <div className="category-row" key={key}><span>{label}</span><div className="category-track" aria-hidden="true"><i style={{ width: `${scan.categoryScores?.[key as keyof NonNullable<ScanRecord["categoryScores"]>] ?? 0}%` }}/></div><span className="mono category-score">{scan.categoryScores?.[key as keyof NonNullable<ScanRecord["categoryScores"]>] ?? "—"}</span></div>)}</div>
        <div className="share-row"><span className="mono">SHARE THIS SCORE</span><button type="button" onClick={() => openShare("x")}>X</button><button type="button" onClick={() => openShare("linkedin")}>LinkedIn</button><button type="button" onClick={copyLink}>Copy link</button><span role="status">{shareStatus}</span></div>
      </section>
      <section className="wrap capture-section" aria-label="Rendered page previews">
        <div className="report-section-title"><h2>Your page, rendered.</h2><span className="mono">DESKTOP 1440 × 900 / MOBILE 390 × 844</span></div>
        <div className="capture-grid">{scan.desktopImage && <figure><Image src={scan.desktopImage} alt={`Desktop rendering of ${scan.domain}`} width={1440} height={900} unoptimized loading="eager"/><figcaption className="mono">DESKTOP · 1440 × 900</figcaption></figure>}{scan.mobileImage && <figure><Image src={scan.mobileImage} alt={`Mobile rendering of ${scan.domain}`} width={390} height={844} unoptimized loading="eager"/><figcaption className="mono">MOBILE · 390 × 844</figcaption></figure>}</div>
      </section>
      <section className="wrap findings-section"><div className="report-section-title"><h2>The clearest opportunities.</h2><span className="mono">{findings.length} FREE FINDINGS</span></div>
        <div className="finding-list">{findings.map((item, index) => <article className="finding" key={item.id}><span className="mono finding-index">0{index + 1}</span><div><span className="mono finding-meta">{labels[item.category]} · {item.severity.toUpperCase()} IMPACT</span><h3>{item.title}</h3><p>{item.why_it_matters}</p></div></article>)}</div>
        {Boolean(scan.lockedCount) && !paidData && <div className="locked-findings"><p className="mono">{scan.lockedCount} MORE FINDINGS IN THE FULL REPORT</p>{scan.lockedTitles?.slice(0, 3).map((title) => <p className="locked-title" key={title}>{title}</p>)}{scan.paidAvailable ? <><button className="primary-action" onClick={checkout} disabled={checkoutPending}>{checkoutPending ? "Opening checkout…" : `Unlock Full Report & Fix Prompt — $${PRICE_FIX_PROMPT_USD}`}</button><span className="microcopy">ONE-TIME PAYMENT · FOR THIS URL · SECURE ACCESS BY EMAIL</span></> : <p className="inline-status">The Fix Prompt is temporarily unavailable because no language model service is configured. Your free score and findings are ready.</p>}{emailStatus && <p className="inline-status" role="status">{emailStatus}</p>}</div>}
      </section>
      <section className="wrap metrics-section"><div className="report-section-title"><h2>What we could verify.</h2><span className="mono">UNKNOWN CHECKS STAY UNKNOWN</span></div><dl className="metric-list">{Object.entries(scan.checks ?? {}).map(([key, item]) => <div className="metric-row" key={key}><dt>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^[a-z]/, (letter) => letter.toUpperCase())}</dt><dd>{(item as MetricCheck).state === "unknown" ? <span title={(item as MetricCheck).note}>Couldn’t check</span> : String((item as MetricCheck).value ?? "Checked")}</dd></div>)}</dl><p className="coverage-note">This is a partial assessment. The categories include deterministic page checks; language model and PageSpeed checks are unknown where the report says “Couldn’t check”. Unknown checks do not add points. Verified coverage limits the maximum category score.</p></section>
      {scan.id !== "example" && <section className="wrap email-section"><div><h2>Keep your report close.</h2><p>Optional. Save your email with this report; a report link will be sent if email delivery is available.</p></div><div className="email-actions"><form action={async (formData) => submitLead(formData)}><label htmlFor="lead-email" className="sr-only">Email address</label><input type="email" required maxLength={254} name="email" id="lead-email" autoComplete="email" placeholder="you@example.com"/><button type="submit">Save email & send</button><span role="status">{emailStatus}</span></form>{scan.paidAvailable && !paidData && <form action={async (formData) => requestAccess(formData)}><label htmlFor="access-email" className="sr-only">Email used at checkout</label><input type="email" required maxLength={254} name="email" id="access-email" autoComplete="email" placeholder="Email used at checkout"/><button type="submit">Resend paid report link</button><span role="status">{accessStatus}</span></form>}</div></section>}
      {paidData && <section className="wrap paid-report"><div className="report-section-title"><h2>Fix your highest-impact issues.</h2><span className="mono">FIX PROMPT · UNLOCKED</span></div><div className="report-copy"><span className="mono">COPY DRAFT STATUS</span><p>{paidData.copyDrafts.status}</p><div className="copy-drafts"><div><span className="mono">HEADLINE OPTIONS</span>{paidData.copyDrafts.headlines.map((line, i) => <p key={i}>{line}</p>)}</div><div><span className="mono">SUBHEADLINE</span><p>{paidData.copyDrafts.subheadline}</p></div><div><span className="mono">PRIMARY CTA</span><p>{paidData.copyDrafts.cta}</p></div><div><span className="mono">FAQ DRAFT</span><p>{paidData.copyDrafts.faq}</p></div><div><span className="mono">META TITLE & DESCRIPTION</span><p>{paidData.copyDrafts.metaTitle}</p><p>{paidData.copyDrafts.metaDescription}</p></div></div></div><div className="tool-tabs" role="tablist" aria-label="Fix prompt by tool" onKeyDown={(event) => {
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
