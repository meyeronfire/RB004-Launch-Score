"use client";

function focusScanInput() {
  const input = document.getElementById("scan-url") as HTMLInputElement | null;
  document.getElementById("hero-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => input?.focus({ preventScroll: true }), 450);
}

export function PricingActions({ kind }: { kind: "free" | "paid" }) {
  return <div className="pricing-actions">
    {kind === "free"
      ? <button className="pricing-primary" onClick={focusScanInput}>Get my score</button>
      : <button className="pricing-secondary" onClick={focusScanInput}>Unlock after your scan <span aria-hidden="true">→</span></button>}
  </div>;
}
