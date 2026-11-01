import { makeCheckout } from "@/lib/payments";
import { readBoundedBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input: unknown;
  const body = await readBoundedBody(request, 2048);
  if (body.error === "too_large") return Response.json({ error: "Checkout request was too large." }, { status: 413 });
  try { input = JSON.parse(body.body ?? ""); }
  catch { return Response.json({ error: "Checkout request was not valid JSON." }, { status: 400 }); }
  const scanId = input && typeof input === "object" && typeof (input as { scanId?: unknown }).scanId === "string" ? (input as { scanId: string }).scanId : "";
  if (!/^[a-f0-9-]{36}$/.test(scanId)) return Response.json({ error: "Report not found." }, { status: 404 });
  const limit = await rateLimit(request, "checkout");
  if (limit.misconfigured) return Response.json({ error: "Checkout rate limiting needs a trusted client IP header." }, { status: 503 });
  if (!limit.allowed) return Response.json({ error: "Checkout attempts are limited to five per network per day." }, { status: 429, headers: { "Retry-After": "86400" } });
  try {
    const { session } = await makeCheckout(scanId);
    return Response.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    const unavailable = /not configured|not available|database/.test(message);
    return Response.json({ error: unavailable ? message : "Checkout could not be started. Please try again." }, { status: unavailable ? 503 : 400 });
  }
}
