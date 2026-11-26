"use client";

import Link from "next/link";
import { useState } from "react";
import { FindingFixPrompts } from "@/components/finding-fix-prompts";
import { LaunchPlan } from "@/components/launch-plan";
import type { Finding } from "@/lib/types";

type PaidData = {
  available: boolean;
  findings: Finding[];
  prompts: Record<string, string>;
  copyDrafts: { status: string; headlines: string[]; subheadline: string; cta: string; faq: string; metaTitle: string; metaDescription: string };
};

export function PaidReportSection({
  scan,
  paidData,
}: {
  scan: { id: string; url: string; finalUrl?: string; title?: string; paidRescanAvailable?: boolean; paidRescansRemaining?: number | null; founderPreview?: boolean };
  paidData: PaidData;
}) {
  const [tool, setTool] = useState("Cursor");
  const [copyStatus, setCopyStatus] = useState("");
  const prompt = paidData.prompts[tool] ?? "";
  const toolId = (name: string) => `prompt-tab-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(`${tool} prompt copied.`);
    } catch {
      setCopyStatus("Your browser could not copy the prompt.");
    }
  }

  function downloadPrompt() {
    if (!prompt) return;
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ready-for-real-${tool.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-launch-prompt.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCopyStatus(`${tool} prompt downloaded.`);
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const selected = tabs[next];
    if (selected?.dataset.tool) {
      setTool(selected.dataset.tool);
      selected.focus();
    }
  }

  return <section className="wrap paid-report paid-primary-continuation" id="launch-plan" aria-labelledby="paid-report-title">
    <div className="report-section-title">
      <div><h2 id="paid-report-title">Your personalized launch plan.</h2><p>Prioritized fixes, rewritten page copy, and prompts you can take to your coding agent.</p></div>
      <span className="mono paid-report-access-label">{scan.founderPreview ? "FOUNDER PREVIEW · NO PAYMENT" : "PURCHASED · UNLOCKED"}</span>
    </div>
    {scan.founderPreview && <p className="founder-preview-note">Admin-only founder preview. No Stripe payment was made.</p>}
    {scan.paidRescanAvailable && <p className="mono paid-rescan-note">{scan.paidRescansRemaining === null ? "Your purchase includes unlimited" : `${scan.paidRescansRemaining ?? 0} included`} re-scans of this URL within seven days. <Link href={`/?url=${encodeURIComponent(scan.url)}`}>Re-scan after applying fixes →</Link></p>}
    <LaunchPlan scanId={scan.id} findings={paidData.findings} />
    <FindingFixPrompts url={scan.finalUrl ?? scan.url} title={scan.title ?? ""} findings={paidData.findings} />
    <section className="report-copy paid-copy-options" aria-labelledby="copy-options-title">
      <div className="report-section-title"><div><span className="mono">DRAFTS BASED ON THE SCANNED PAGE</span><h2 id="copy-options-title">Page copy options.</h2></div><span className="mono">REVIEW BEFORE USE</span></div>
      <p>{paidData.copyDrafts.status}</p>
      <div className="copy-drafts">
        <div><span className="mono">HEADLINE OPTIONS</span>{paidData.copyDrafts.headlines.map((line, index) => <p key={index}>{line}</p>)}</div>
        <div><span className="mono">SUBHEADLINE</span><p>{paidData.copyDrafts.subheadline}</p></div>
        <div><span className="mono">PRIMARY CTA</span><p>{paidData.copyDrafts.cta}</p></div>
        <div><span className="mono">FAQ DRAFT</span><p>{paidData.copyDrafts.faq}</p></div>
        <div><span className="mono">META TITLE &amp; DESCRIPTION</span><p>{paidData.copyDrafts.metaTitle}</p><p>{paidData.copyDrafts.metaDescription}</p></div>
      </div>
    </section>
    <section className="paid-agent-prompts" aria-labelledby="agent-prompts-title">
      <div className="report-section-title"><div><span className="mono">COPY, THEN REVIEW THE DIFF</span><h2 id="agent-prompts-title">Take the full plan to your coding agent.</h2><p>Each prompt includes scan evidence, implementation guidance, and verification steps.</p></div><span className="mono">{Object.keys(paidData.prompts).length} TOOLS</span></div>
      <div className="tool-tabs" role="tablist" aria-label="Coding-agent prompt" onKeyDown={handleTabKey}>
        {Object.keys(paidData.prompts).map((name) => <button type="button" role="tab" id={toolId(name)} data-tool={name} aria-controls="prompt-content" tabIndex={tool === name ? 0 : -1} aria-selected={tool === name} className={tool === name ? "active" : ""} onClick={() => setTool(name)} key={name}>{name}</button>)}
      </div>
      <pre className="prompt-output" id="prompt-content" role="tabpanel" aria-labelledby={toolId(tool)} tabIndex={0}>{prompt}</pre>
      <div className="prompt-actions"><button className="primary-action" type="button" onClick={() => void copyPrompt()}>Copy {tool} prompt</button><button className="secondary-action" type="button" onClick={downloadPrompt}>Download prompt</button><span className="inline-status" role="status" aria-live="polite">{copyStatus}</span></div>
    </section>
  </section>;
}
