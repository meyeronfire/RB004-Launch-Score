"use client";

import { FormEvent, useState } from "react";

export function AdminFounderPreview() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const scanId = String(new FormData(event.currentTarget).get("scanId") ?? "").trim();
    try {
      const response = await fetch(`/admin/api/scans/${encodeURIComponent(scanId)}/founder-preview`, { method: "POST", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Founder preview could not be prepared.");
      window.location.assign(body.reportUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Founder preview could not be prepared.");
      setPending(false);
    }
  }

  return <section className="admin-founder-preview">
    <h2>Founder report preview</h2>
    <p>Prepare the paid report for one of your configured owner websites. This grants access only to an admin session and does not create a Stripe payment. Generating a missing plan uses model tokens.</p>
    <form className="scan-form admin-founder-preview-form" onSubmit={submit}>
      <label htmlFor="founder-scan-id">Report ID</label>
      <input id="founder-scan-id" name="scanId" type="text" required maxLength={36} pattern="[a-fA-F0-9-]{36}" placeholder="Paste the UUID from the report URL" autoComplete="off" />
      <button type="submit" disabled={pending}>{pending ? "Preparing preview…" : "Open founder preview"}</button>
      {message && <p role="alert">{message}</p>}
    </form>
  </section>;
}
