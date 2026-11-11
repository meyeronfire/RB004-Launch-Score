import { getPaidReport, isPaidReportPreparing, readAccessCookies } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext<"/api/scans/[id]/paid">) {
  const { id } = await context.params;
  const tokens = readAccessCookies(request.headers.get("cookie"), id);
  if (!tokens.length) return Response.json({ error: "This browser does not have access to the purchased report." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  for (const token of tokens) {
    const report = await getPaidReport(id, token);
    if (report) return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  }
  for (const token of tokens) {
    if (await isPaidReportPreparing(id, token)) return Response.json({ status: "preparing" }, { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "3" } });
  }
  return Response.json({ error: "Purchase has not been verified for this report." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
