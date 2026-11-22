export const BROWSER_ASSET_REQUEST_CAP = 48;
export const BROWSER_DOCUMENT_REQUEST_CAP = 4;
const BROWSER_BYTE_CAP = 16_000_000;

export type BrowserRequestKind = "document" | "prefetch" | "media" | "asset";

export function classifyBrowserRequest(input: { url: string; resourceType: string; method: string; headers?: Record<string, string>; isNavigation: boolean }): BrowserRequestKind {
  const headers = input.headers ?? {};
  const purpose = `${headers.purpose ?? ""} ${headers["sec-purpose"] ?? ""}`.toLowerCase();
  if (input.resourceType === "document" && input.isNavigation) return "document";
  if (input.resourceType === "media" || /\.(?:mp4|webm|m4v|mov|mp3|wav|ogg)(?:$|[?#])/i.test(input.url)) return "media";
  if (/[?&]_rsc=/.test(input.url) || headers["next-router-prefetch"] === "1" || purpose.includes("prefetch")) return "prefetch";
  return "asset";
}

export function admitBrowserRequest(input: { kind: BrowserRequestKind; method: string; documentRequests: number; assetRequests: number; bytes: number; budgetRemaining: number }): "fetch" | "skip" {
  if (input.method !== "GET") return "skip";
  if (input.kind === "prefetch" || input.kind === "media") return "skip";
  if (input.kind === "document") return input.documentRequests >= BROWSER_DOCUMENT_REQUEST_CAP ? "skip" : "fetch";
  if (input.assetRequests >= BROWSER_ASSET_REQUEST_CAP || input.bytes >= BROWSER_BYTE_CAP || input.budgetRemaining <= 6) return "skip";
  return "fetch";
}

export function htmlWithoutExecutableScripts(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

export function isScannerBlockedConsoleMessage(text: string) {
  return /ERR_BLOCKED_BY_CLIENT|net::ERR_ABORTED/i.test(text);
}

export function recoverableRenderFailure(error: unknown) {
  const detail = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /timeout|timed out|ERR_BLOCKED_BY_CLIENT|ERR_ABORTED|ERR_FAILED|ERR_CONNECTION|ERR_TIMED_OUT|net::ERR_|Navigation (?:interrupted|failed)|frame was detached|Target (?:closed|page, context or browser has been closed)/i.test(detail);
}

export function recentScanFailure(scan: { status: string; error?: string | null; url: string; id: string }) {
  if (scan.status !== "failed") return undefined;
  const reason = scan.error?.replace(/\s+/g, " ").trim() || "This page could not be scanned. Check the URL and try again.";
  return { reason, reportHref: `/r/${encodeURIComponent(scan.id)}`, retryHref: `/?url=${encodeURIComponent(scan.url)}` };
}
