"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const secret = String(new FormData(event.currentTarget).get("secret") ?? "");
    try { const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Access denied."); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Access denied."); setPending(false); }
  }
  return <form className="scan-form admin-login" onSubmit={submit}><label htmlFor="admin-secret">Admin key</label><input id="admin-secret" name="secret" type="password" autoComplete="current-password" required /><button type="submit" disabled={pending}>{pending ? "Checking…" : "Open dashboard"}</button>{error && <p role="alert">{error}</p>}</form>;
}
