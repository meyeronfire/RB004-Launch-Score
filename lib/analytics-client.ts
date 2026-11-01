declare global {
  interface Window { plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void }
}

export function track(event: "scan_started" | "scan_done" | "share_clicked" | "checkout_started" | "purchased", props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  try { window.plausible?.(event, props ? { props } : undefined); }
  catch { /* Optional analytics must not interrupt the user action. */ }
}
