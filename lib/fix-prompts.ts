import type { Finding, PaidPayload } from "./types";

export type CopyDrafts = PaidPayload["copyDrafts"];
export function promptVariants(input: { url: string; title: string; stack: string[]; findings: Finding[]; copyDrafts: CopyDrafts }) {
  const fixes = input.findings.map((item, index) => `${index + 1}. ${item.title}\n   Evidence: ${item.evidence}\n   Why it matters: ${item.why_it_matters}\n   Fix: ${item.fix}`).join("\n\n");
  const copy = input.copyDrafts.headlines.length === 3
    ? `\nSuggested copy (use only where it fits the product truth):\n- Headline options: ${input.copyDrafts.headlines.map((x) => `“${x}”`).join(" / ")}\n- Subheadline: ${input.copyDrafts.subheadline}\n- Primary CTA: ${input.copyDrafts.cta}\n- FAQ draft: ${input.copyDrafts.faq}\n- Meta title: ${input.copyDrafts.metaTitle}\n- Meta description: ${input.copyDrafts.metaDescription}\n`
    : "\nCopy rewrite drafts are unavailable because a language model service is not configured. Do not fabricate product claims; write copy only after confirming the true audience, offer, and proof with the owner.\n";
  const shared = `Improve this launch page: ${input.url}\n\nDetected stack hints: ${input.stack.length ? input.stack.join(", ") : "None detected"}.\n\nContext: Keep the existing brand, visual identity, working layout, and product behavior. Do not redesign the page or change its core offer. Make the smallest useful changes, preserve responsive behavior, and do not invent prices, metrics, testimonials, integrations, guarantees, or product capabilities. If evidence is unclear, leave a TODO for the owner.\n\nFixes, ranked by impact:\n${fixes || "No verifiable issues were found in the available checks."}\n${copy}\nAcceptance checklist:\n- Fix only the listed issues and preserve unrelated sections.\n- Keep the primary action clear and functional.\n- Verify at 390px mobile and 1440px desktop.\n- Confirm visible copy is accurate and no placeholder text remains.\n- Summarize files changed and checks run.`;
  return {
    Cursor: `${shared}\n\nWork directly in the existing project. Inspect the relevant components and styles first, implement the fixes, then run the project's existing checks.`,
    Lovable: `${shared}\n\nMake these changes in the existing Lovable project. Preserve its current components and styling tokens; make the smallest targeted edits and preview mobile and desktop before finishing.`,
    Bolt: `${shared}\n\nModify the current Bolt project in place. Keep its existing framework and dependencies. Implement each item in order, verify the page at mobile and desktop sizes, and report any item you cannot verify.`,
    v0: `${shared}\n\nUpdate the existing v0 project rather than generating a new design. Keep the current visual system and component structure. Make targeted changes and preserve accessibility and responsive layouts.`,
    Codex: `${shared}\n\nInspect the current repository before editing. Implement each fix as a small change in the existing architecture, run the relevant checks, inspect the final diff, and report verified outcomes.`,
  };
}

export function emptyDrafts(): CopyDrafts {
  return { status: "Copy rewrites are unavailable because no language model service is configured.", headlines: [], subheadline: "", cta: "", faq: "", metaTitle: "", metaDescription: "" };
}
