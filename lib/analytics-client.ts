declare global {
  interface Window { plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void }
}

export type ScanAttribution = { path: string; source?: string; medium?: string; campaign?: string };
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) : undefined;
export function readScanAttribution(value: unknown): ScanAttribution | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const path = typeof data.path === "string" && /^\/(?!\/)[a-zA-Z0-9/_-]{0,120}$/.test(data.path) && !data.path.startsWith("/r/") ? data.path : undefined;
  if (!path) return undefined;
  return { path, source: clean(data.source), medium: clean(data.medium), campaign: clean(data.campaign) };
}

export function track(event: "scan_started" | "scan_done" | "share_clicked" | "checkout_started" | "purchased" | "free_tool_started" | "free_tool_completed" | "landing_cta_clicked", props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  try { window.plausible?.(event, props ? { props } : undefined); }
  catch { /* Optional analytics must not interrupt the user action. */ }
}
