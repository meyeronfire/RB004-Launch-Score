import { ACCESS_COOKIE, verifyClaimToken } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/scans/[id]/claim">) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-zA-Z0-9_-]{40,60}$/.test(token) || !(await verifyClaimToken(id, token))) {
    return Response.json({ error: "This purchaser link is invalid or no longer active." }, { status: 403, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${ACCESS_COOKIE}${id}=${encodeURIComponent(token)}; Path=/api/scans/${id}/paid; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`;
  return new Response(null, { status: 303, headers: { Location: `/r/${encodeURIComponent(id)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": cookie } });
}
