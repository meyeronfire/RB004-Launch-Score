import { z } from "zod";
import { clientIpHash, rateLimit } from "@/lib/rate-limit";
import { addFreeWaitlist, cookieValue, deviceHash, DEVICE_COOKIE, freeBudgetStatus, freeStatus, FREE_SESSION_COOKIE, newOpaqueToken, PAID_RESCAN_COOKIE, requestFreeMagicLink } from "@/lib/free-tier";
import { isOwnerScanTarget } from "@/lib/owner-scan-access";
import { verifyPaidRescanToken } from "@/lib/payments";
import { readBoundedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ email: z.string().trim().email().max(254), website: z.string().max(200).optional(), purpose: z.enum(["magic", "waitlist"]).default("magic") });

function device(request: Request) {
  const oldToken = cookieValue(request, DEVICE_COOKIE);
  const token = /^[a-zA-Z0-9_-]{30,60}$/.test(oldToken) ? oldToken : newOpaqueToken();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return { token, hash: deviceHash(token), cookie: oldToken ? "" : `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` };
}

export async function GET(request: Request) {
  const ip = clientIpHash(request);
  if (!ip) return Response.json({ error: "Free scan access is temporarily unavailable. Please try again later." }, { status: 503 });
  const client = device(request);
  const requestedTarget = new URL(request.url).searchParams.get("url");
  let hostAccess = false;
  if (requestedTarget) { try { hostAccess = isOwnerScanTarget(new URL(requestedTarget)); } catch { /* Invalid targets are checked again when submitted. */ } }
  const paidToken = cookieValue(request, PAID_RESCAN_COOKIE);
  const [status, budget, paidAccess] = await Promise.all([freeStatus({ device: client.hash, ip, sessionToken: cookieValue(request, FREE_SESSION_COOKIE) }), freeBudgetStatus(), paidToken ? verifyPaidRescanToken(paidToken) : undefined]);
  const response = Response.json({ ...status, ...(hostAccess ? { allowed: !budget.paused, remaining: budget.paused ? 0 : null, requiresEmail: false } : {}), budgetPaused: budget.paused, paidRescanAvailable: Boolean(paidAccess), hostAccess }, { headers: { "Cache-Control": "no-store" } });
  if (client.cookie) response.headers.append("Set-Cookie", client.cookie);
  return response;
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, "free-access");
  if (!limit.allowed || limit.misconfigured) return Response.json({ error: "Please wait before requesting another email." }, { status: limit.misconfigured ? 503 : 429 });
  const body = await readBoundedBody(request, 2048);
  let input: unknown; try { input = JSON.parse(body.body ?? ""); } catch { return Response.json({ error: "Enter a valid email address." }, { status: 400 }); }
  const parsed = Body.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (parsed.data.website) return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  if (parsed.data.purpose === "waitlist") {
    try {
      const saved = await addFreeWaitlist(parsed.data.email);
      if (!saved) return Response.json({ error: "The waitlist could not save your email. Please try again later." }, { status: 503 });
      return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "That email could not be saved." }, { status: 503 }); }
  }
  const ip = clientIpHash(request); if (!ip) return Response.json({ error: "Free scan access is temporarily unavailable. Please try again later." }, { status: 503 });
  const client = device(request);
  const result = await requestFreeMagicLink({ email: parsed.data.email, device: client.hash, ip, origin: new URL(request.url).origin });
  const response = Response.json(result.ok ? { accepted: true } : { error: result.error }, { status: result.ok ? 202 : 503, headers: { "Cache-Control": "no-store" } });
  if (client.cookie) response.headers.append("Set-Cookie", client.cookie);
  return response;
}
