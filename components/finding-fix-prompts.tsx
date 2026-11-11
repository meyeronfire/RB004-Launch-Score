"use client";

import { useState } from "react";
import { findingFixPrompt } from "@/lib/fix-prompts";
import { findingResult } from "@/lib/finding-result";
import type { Finding } from "@/lib/types";

const categoryLabel: Record<Finding["category"], string> = {
  clarity: "Clarity", conversion: "Conversion", design_brand: "Design & Brand", trust: "Trust",
  technical: "Technical", security: "Security", seo_aeo: "SEO / AEO",
};

export function FindingFixPrompts({ url, title, findings }: { url: string; title: string; findings: Finding[] }) {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyPrompt(prompt: string, findingTitle: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(`Prompt for “${findingTitle}” copied.`);
    } catch {
      setCopyStatus("Your browser could not copy the prompt.");
    }
  }

  if (!findings.length) return null;

  return <section className="paid-finding-prompts" aria-labelledby="finding-prompts-title">
    <div className="report-section-title"><div><span className="mono">ONE TARGETED TASK PER FINDING</span><h2 id="finding-prompts-title">Finding-specific fix prompts.</h2><p>Each prompt carries this scan’s evidence, a focused task, and checks for confirming the result.</p></div><span className="mono">{findings.length} PROMPTS</span></div>
    <div className="paid-finding-prompt-list">{findings.map((finding, index) => {
      const prompt = findingFixPrompt({ url, title, finding });
      const result = findingResult(finding);
      return <details className="paid-finding-prompt" key={finding.id}>
        <summary><span className="paid-finding-prompt-number mono">{String(index + 1).padStart(2, "0")}</span><span className="paid-finding-prompt-title"><strong>{finding.title}</strong><small>{categoryLabel[finding.category]} · {finding.severity} · {result}</small></span><span className="paid-finding-prompt-toggle"><span className="paid-finding-prompt-show">Show prompt</span><span className="paid-finding-prompt-hide">Hide prompt</span></span></summary>
        <div className="paid-finding-prompt-body"><pre className="prompt-output">{prompt}</pre><div className="prompt-actions"><button className="primary-action" type="button" onClick={() => void copyPrompt(prompt, finding.title)}>Copy this finding’s prompt</button></div></div>
      </details>;
    })}</div>
    <span className="inline-status" role="status" aria-live="polite">{copyStatus}</span>
  </section>;
}
