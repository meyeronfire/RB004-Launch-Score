"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ScanForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: data.get("url") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "This page could not be scanned.");
      router.push(`/r/${encodeURIComponent(result.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This page could not be scanned. Please try again.");
      setPending(false);
    }
  }
  return <form className="scan-form" onSubmit={submit}>
    <label className="sr-only" htmlFor="scan-url">Page URL</label>
    <input id="scan-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="Paste your page URL" required aria-describedby="scan-error" />
    <button type="submit" disabled={pending}>{pending ? "Starting…" : "Get my score"}</button>
    <span id="scan-error" className="sr-only" role="alert">{error}</span>
    {error && <span className="form-error" role="alert">{error}</span>}
  </form>;
}
