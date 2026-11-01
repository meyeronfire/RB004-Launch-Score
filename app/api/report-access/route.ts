import { requestClaimEmail } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = await rateLimit(request, "report-access");
  if (limit.misconfigured) return Response.json({ error: "Access email rate limiting is not configured." }, { status: 503 });
  if (!limit.allowed) return Response.json({ error: "Please wait before requesting another report email." }, { status: 429, headers: { "Retry-After": "86400" } });
  const body = await readBoundedBody(request, 2048);
  if (body.error) return Response.json({ error: "The request could not be read." }, { status: body.error === "too_large" ? 413 : 400 });
  let payload: unknown;
  try { payload = JSON.parse(body.body ?? ""); } catch { return Response.json({ error: "The request was not valid JSON." }, { status: 400 }); }
  const scanId = payload && typeof payload === "object" && typeof (payload as { scanId?: unknown }).scanId === "string" ? (payload as { scanId: string }).scanId : "";
  const email = payload && typeof payload === "object" && typeof (payload as { email?: unknown }).email === "string" ? (payload as { email: string }).email : "";
  if (!/^[a-f0-9-]{36}$/.test(scanId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter the email used at checkout." }, { status: 400 });
  try { await requestClaimEmail(scanId, email); }
  catch (error) { console.error("Report claim email recovery failed", { errorName: error instanceof Error ? error.name : "UnknownError" }); }
  return Response.json({ message: "If that email belongs to an active purchase, a secure report link will be sent." }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
