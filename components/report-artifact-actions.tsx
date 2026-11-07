"use client";

import { useState } from "react";
import type { PaidAuditArtifacts, PublicAuditReport } from "@/lib/report-artifacts";
import { createReportArtifacts } from "@/lib/report-artifacts";
import { PRICE_FIX_PROMPT_USD } from "@/config/release";

function saveText(filename: string, mimeType: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportArtifactActions({ report, paidData }: { report: PublicAuditReport; paidData?: PaidAuditArtifacts }) {
  const [status, setStatus] = useState("");
  const artifacts = createReportArtifacts(report, paidData);
  const fileBase = (report.domain || "launch-score").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-|-$/g, "") || "launch-score";

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(artifacts.quickSummary);
      setStatus("Quick summary copied.");
    } catch {
      setStatus("Clipboard unavailable. Download the Markdown report instead.");
    }
  }

  return <section className="wrap depth-section report-artifacts" aria-labelledby="report-artifacts-title">
    <div className="report-section-title"><h2 id="report-artifacts-title">Take the audit with you.</h2><span className="mono">AGENT-READY EXPORTS</span></div>
    <p className="report-artifacts-copy">Share a concise summary or export the measured checks, evidence, and score breakdown. Full fixes and tool-specific prompts are included only in a purchased report.</p>
    <div className="report-artifact-actions">
      <button type="button" onClick={() => void copySummary()}>Copy quick summary</button>
      <button type="button" onClick={() => saveText(`${fileBase}-launch-score.md`, "text/markdown;charset=utf-8", artifacts.markdown)}>Download Markdown</button>
      <button type="button" onClick={() => saveText(`${fileBase}-launch-score.json`, "application/json;charset=utf-8", artifacts.json)}>Download JSON</button>
      {artifacts.promptText && <button type="button" onClick={() => saveText(`${fileBase}-fix-prompts.md`, "text/markdown;charset=utf-8", artifacts.promptText!)}>Download fix prompts</button>}
      {!paidData && report.id !== "example" && <a href="#unlock">Full report + tool-specific prompts · ${PRICE_FIX_PROMPT_USD}</a>}
    </div>
    <p className="report-artifact-status mono" role="status" aria-live="polite">{status}</p>
  </section>;
}
