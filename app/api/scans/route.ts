import { createScan } from "@/lib/scanner";
import { rateLimit } from "@/lib/rate-limit";
import { UnsafeTargetError } from "@/lib/ssrf";
import { hasLiveWorker } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) return Response.json({ error: "Scanning is temporarily unavailable because the scan database is not configured." }, { status: 503 });
  if (process.env.NODE_ENV === "production" && !(await hasLiveWorker())) return Response.json({ error: "Scanning is temporarily unavailable because the scan worker is not connected." }, { status: 503 });
  const limit = await rateLimit(request);
  if (limit.misconfigured) return Response.json({ error: "Scan rate limiting needs a trusted client IP header. Configure TRUSTED_PROXY_IP_HEADER or use Vercel." }, { status: 503 });
  if (!limit.allowed) return Response.json({ error: "You’ve used the five free scans available from this network today. Try again tomorrow." }, { status: 429, headers: { "Retry-After": "86400" } });
  let payload: unknown;
  try {
    if (!request.body) return Response.json({ error: "Enter a valid page URL." }, { status: 400 });
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); return Response.json({ error: "Enter a page URL under 4 KB." }, { status: 413 }); } chunks.push(part.value); }
    payload = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
  } catch { return Response.json({ error: "Enter a valid page URL." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || typeof (payload as { url?: unknown }).url !== "string" || (payload as { url: string }).url.length > 2048) return Response.json({ error: "Enter a complete page URL, including https://." }, { status: 400 });
  try {
    const scan = await createScan((payload as { url: string }).url);
    return Response.json({ id: scan.id, status: scan.status }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnsafeTargetError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "A scan could not be started. Please try again." }, { status: 503 });
  }
}
