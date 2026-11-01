import { getPaidReport, readAccessCookie } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/scans/[id]/paid">) {
  const { id } = await context.params;
  const token = readAccessCookie(request.headers.get("cookie"), id);
  if (!token) return Response.json({ error: "This browser does not have access to the purchased report." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const report = await getPaidReport(id, token);
  if (!report) return Response.json({ error: "Purchase has not been verified for this report." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
