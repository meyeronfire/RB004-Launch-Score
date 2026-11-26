declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;
    clarity?: (command: "event" | "set", ...values: string[]) => void;
  }
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

export function landingPathEventProps(value: unknown): { landing_path: string } | undefined {
  const attribution = readScanAttribution(value);
  return attribution ? { landing_path: attribution.path } : undefined;
}

export type AnalyticsEvent = "scan_started" | "scan_done" | "share_clicked" | "checkout_started" | "purchased" | "free_tool_started" | "free_tool_completed" | "landing_cta_clicked";

export function trackClarity(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const landingPath = typeof props?.landing_path === "string" ? props.landing_path : undefined;
  try {
    if (landingPath) window.clarity?.("set", "landing_path", landingPath);
    window.clarity?.("event", event);
  } catch { /* Optional analytics must not interrupt the user action. */ }
}

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  trackClarity(event, props);
  try { window.plausible?.(event, props ? { props } : undefined); }
  catch { /* Optional analytics must not interrupt the user action. */ }
}
