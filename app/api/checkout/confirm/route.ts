import { readBoundedBody } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { stripeClient, validatePaidSession } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBoundedBody(request, 1024);
  if (body.error === "too_large") return Response.json({ confirmed: false }, { status: 413, headers: { "Cache-Control": "no-store" } });

  let input: unknown;
  try { input = JSON.parse(body.body ?? ""); }
  catch { return Response.json({ confirmed: false }, { status: 400, headers: { "Cache-Control": "no-store" } }); }

  const values = input && typeof input === "object" ? input as { scanId?: unknown; sessionId?: unknown } : {};
  const scanId = typeof values.scanId === "string" ? values.scanId : "";
  const sessionId = typeof values.sessionId === "string" ? values.sessionId : "";
  if (!/^[a-f0-9-]{36}$/.test(scanId) || !/^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
    return Response.json({ confirmed: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const limit = await rateLimit(request, "checkout_confirm");
  if (limit.misconfigured) return Response.json({ confirmed: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!limit.allowed) return Response.json({ confirmed: false }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } });

  const stripe = stripeClient();
  if (!stripe) return Response.json({ confirmed: false }, { status: 503, headers: { "Cache-Control": "no-store" } });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const confirmed = validatePaidSession(session, scanId);
    return Response.json({ confirmed }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ confirmed: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
