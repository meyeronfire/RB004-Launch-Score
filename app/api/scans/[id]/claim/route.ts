import { ACCESS_COOKIE, PURCHASE_ACCESS_COOKIE, verifyClaimToken, verifyPaidRescanToken } from "@/lib/payments";
import { PAID_RESCAN_COOKIE } from "@/lib/free-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/scans/[id]/claim">) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const rescanToken = new URL(request.url).searchParams.get("rescan") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-zA-Z0-9_-]{40,60}$/.test(token) || !(await verifyClaimToken(id, token))) {
    return Response.json({ error: "This purchaser link is invalid or no longer active." }, { status: 403, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${ACCESS_COOKIE}${id}=${encodeURIComponent(token)}; Path=/api/scans/${id}/paid; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`;
  const headers = new Headers({ Location: `/r/${encodeURIComponent(id)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", `${PURCHASE_ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/api/scans; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`);
  const rescanAccess = rescanToken && /^[a-zA-Z0-9_-]{40,60}$/.test(rescanToken) ? await verifyPaidRescanToken(rescanToken, id) : undefined;
  if (rescanToken && rescanAccess && (rescanAccess.rescansRemaining === null || rescanAccess.rescansRemaining > 0)) headers.append("Set-Cookie", `${PAID_RESCAN_COOKIE}=${encodeURIComponent(rescanToken)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
  return new Response(null, { status: 303, headers });
}
