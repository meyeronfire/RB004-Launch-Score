import { publicScan, readScan } from "@/lib/store";
import { cookieValue, PAID_RESCAN_COOKIE } from "@/lib/free-tier";
import { verifyPaidRescanToken } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/scans/[id]">) {
  const { id } = await context.params;
  const scan = await readScan(id);
  if (!scan) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const token = cookieValue(_request, PAID_RESCAN_COOKIE);
  const access = token ? await verifyPaidRescanToken(token, undefined, scan.url) : undefined;
  const safe = publicScan(scan);
  const paidRescansRemaining = access ? access.rescansRemaining : 0;
  return Response.json({ ...safe, paidRescanAvailable: paidRescansRemaining === null || paidRescansRemaining > 0, paidRescansRemaining, paidRescanExpiresAt: access?.expires_at.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
