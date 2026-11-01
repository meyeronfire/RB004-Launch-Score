import { imageSize } from "image-size";
import { rateLimit } from "@/lib/rate-limit";
import { readScan } from "@/lib/store";
import { assertRobotsAllows } from "@/lib/scanner";
import { SafeFetchError, safeFetch } from "@/lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CachedImage = { expiresAt: number; contentType: string; body: Buffer };
const imageCache = new Map<string, CachedImage>();
const inflight = new Map<string, Promise<CachedImage>>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHED_IMAGES = 32;

function publicHeaders(contentType: string): HeadersInit {
  return { "Content-Type": contentType, "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-if-error=3600", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
}

function getCachedImage(id: string) {
  const cached = imageCache.get(id);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) { imageCache.delete(id); return undefined; }
  return cached;
}

async function loadImage(id: string, url: string): Promise<CachedImage> {
  const existing = getCachedImage(id);
  if (existing) return existing;
  const pending = inflight.get(id);
  if (pending) return pending;

  const request = (async () => {
    await assertRobotsAllows(new URL(url));
    const response = await safeFetch(url, { timeoutMs: 5000, maxBytes: 1_500_000, maxRedirects: 3, beforeRedirect: assertRobotsAllows });
    const contentType = String(response.headers["content-type"] ?? "").split(";", 1)[0].toLowerCase();
    if (response.status < 200 || response.status >= 300 || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(contentType) || !imageSize(response.body)) throw new SafeFetchError("The shared image did not pass validation.");
    const cached = { expiresAt: Date.now() + CACHE_TTL_MS, contentType, body: response.body };
    for (const [key, value] of imageCache) if (value.expiresAt <= Date.now()) imageCache.delete(key);
    if (!imageCache.has(id) && imageCache.size >= MAX_CACHED_IMAGES) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(id, cached);
    return cached;
  })();
  inflight.set(id, request);
  try { return await request; } finally { inflight.delete(id); }
}

export async function GET(request: Request, context: RouteContext<"/api/scans/[id]/share-image">) {
  const { id } = await context.params;
  const scan = await readScan(id);
  if (!scan || scan.status !== "complete" || !scan.shareImageUrl) return new Response("Image not found", { status: 404 });
  try {
    let cached = getCachedImage(id);
    if (!cached) {
      const limit = await rateLimit(request, "share-image");
      if (limit.misconfigured) return new Response("Rate limiting is not configured", { status: 503 });
      if (!limit.allowed) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "86400" } });
      cached = await loadImage(id, scan.shareImageUrl);
    }
    return new Response(new Uint8Array(cached.body), { status: 200, headers: publicHeaders(cached.contentType) });
  } catch {
    return new Response("Image unavailable", { status: 404 });
  }
}
