"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics-client";

export function ScanForm({ initialUrl = "", submitLabel = "Get my score" }: { initialUrl?: string; submitLabel?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);
  const [waitlistMode, setWaitlistMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paidRescan, setPaidRescan] = useState(false);
  const [ownerAccess, setOwnerAccess] = useState(false);
  const [scanAvailable, setScanAvailable] = useState<boolean | null>(null);
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const query = targetUrl ? `?url=${encodeURIComponent(targetUrl)}` : "";
      fetch(`/api/free-access${query}`, { cache: "no-store", signal: controller.signal }).then(async (response) => response.ok ? response.json() as Promise<{ remaining?: number | null; requiresEmail?: boolean; budgetPaused?: boolean; paidRescanAvailable?: boolean; hostAccess?: boolean; scanAvailable?: boolean }> : undefined).then((result) => {
        if (!result) return;
        if (typeof result.scanAvailable === "boolean") setScanAvailable(result.scanAvailable);
        const hostTarget = Boolean(result.hostAccess);
        const hostEnabled = hostTarget && !Boolean(result.budgetPaused);
        const paid = Boolean(result.paidRescanAvailable);
        setOwnerAccess(hostEnabled);
        setPaidRescan(paid);
        if (hostTarget) {
          setRemaining(result.remaining ?? null);
          setNeedsEmail(false);
          setWaitlistMode(!paid && Boolean(result.budgetPaused));
        } else {
          if (result.remaining !== undefined) setRemaining(result.remaining);
          setNeedsEmail(Boolean(result.requiresEmail));
          setWaitlistMode(!paid && Boolean(result.budgetPaused));
        }
      }).catch(() => undefined);
    }, 200);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [targetUrl]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const mode = String(data.get("mode") ?? "scan");
    const url = String(data.get("url") ?? "").trim();
    try {
      if (mode === "email" || (!url && (needsEmail || waitlistMode))) {
        if (!email.trim()) throw new Error("Enter your email address first.");
        const response = await fetch("/api/free-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, purpose: waitlistMode ? "waitlist" : "magic", website: data.get("website") }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "That email could not be saved.");
        setNotice(waitlistMode ? "You’re on the waitlist. We’ll email when free scans return." : "Check your inbox for a sign-in link. It expires in one hour."); setPending(false); return;
      }
      if (scanAvailable === false) throw new Error("Scanning is temporarily unavailable. Please try again shortly.");
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, website: data.get("website") }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "email_required") setNeedsEmail(true);
        if (result.code === "free_paused") setWaitlistMode(true);
        throw new Error(result.error ?? "This page could not be scanned.");
      }
      if (typeof result.remaining === "number") setRemaining(result.remaining);
      track("scan_started");
      try { sessionStorage.setItem(`rb004-pending-scan:${result.id}`, "1"); } catch { /* Analytics are optional. */ }
      router.push(`/r/${encodeURIComponent(result.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This page could not be scanned. Please try again.");
      setPending(false);
    }
  }
  return <>
    <form className={`scan-form${needsEmail ? " scan-form--access" : ""}${waitlistMode ? " scan-form--waitlist" : ""}`} onSubmit={submit}>
    <label className="sr-only" htmlFor="scan-url">Page URL</label>
    <input id="scan-url" name="url" type="text" inputMode="url" autoComplete="url" placeholder="Paste your page URL" value={targetUrl} onChange={(event) => setTargetUrl(event.currentTarget.value)} required={!(needsEmail || waitlistMode)} aria-describedby="scan-error" />
    {!(needsEmail || waitlistMode) && <input className="scan-honeypot" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />}
    <button type="submit" name="mode" value="scan" disabled={pending || scanAvailable === false}>{pending ? "Starting…" : waitlistMode ? "Join waitlist" : scanAvailable === false ? "Scan temporarily unavailable" : submitLabel}</button>
    {(needsEmail && !waitlistMode) && <>
      <label className="sr-only" htmlFor="scan-email">Email address</label>
      <input id="scan-email" className="free-email-input" name="email" type="email" autoComplete="email" placeholder="Your email" value={email} onChange={(event) => { setEmail(event.target.value); setNotice(""); setError(""); }} />
      <button type="submit" name="mode" value="email" className="free-email-button" disabled={pending}>Email me a link</button>
      <input className="scan-honeypot" name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    </>}
    <span id="scan-error" className="sr-only" role="alert">{error}</span>
    {error && <span className="form-error" role="alert">{error}</span>}
    </form>
    {scanAvailable === false && <p className="microcopy form-error" role="status">Scanning is temporarily unavailable. Please try again shortly.</p>}
    {(ownerAccess && !paidRescan) && <p className="microcopy free-scan-remaining">Free scanning enabled for this site</p>}
    {(remaining !== null && !needsEmail && !waitlistMode && !paidRescan && !ownerAccess) && <p className="microcopy free-scan-remaining">{remaining} free scan{remaining === 1 ? "" : "s"} left</p>}
    {(needsEmail || waitlistMode) && <p className="microcopy free-access-copy">{waitlistMode ? "Free scans are paused for today, back tomorrow." : "{email.trim() ? "Click “Email me a link” to verify this address and unlock two more free scans." : "Add your email to unlock two more free scans. One free scan is available without an account."}"}</p>}
    {notice && <p className="microcopy free-access-notice" role="status">{notice}</p>}
  </>;
}
