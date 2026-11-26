import { cookies } from "next/headers";
import { ADMIN_COOKIE, validAdminCookie } from "@/lib/admin-auth";
import { enhancePaidPrompt } from "@/lib/paid-prompt";
import { isOwnerScanTarget } from "@/lib/owner-scan-access";
import { readScan, updateScan } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/admin/api/scans/[id]/founder-preview">) {
  const cookieStore = await cookies();
  if (!validAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return Response.json({ error: "Admin access could not be verified." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "This request could not be verified." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await context.params;
  let scan = await readScan(id);
  if (!scan || scan.status !== "complete") return Response.json({ error: "Choose a completed scan." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    if (!isOwnerScanTarget(new URL(scan.url))) {
      return Response.json({ error: "Founder previews are limited to the configured owner websites." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  } catch {
    return Response.json({ error: "The scan URL is invalid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!scan.paidPayload) return Response.json({ error: "This older report has no saved data to prepare a founder preview. Run a new scan." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  if (!scan.paidPayload.available) {
    try {
      if (!await enhancePaidPrompt(id)) return Response.json({ error: "The launch plan could not be generated from this scan. Run a new scan and try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "The launch plan could not be generated right now. Try again later." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    scan = await readScan(id);
    if (!scan?.paidPayload?.available) return Response.json({ error: "The launch plan is still incomplete. Run a new scan and try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const updated = await updateScan(id, (current) => ({ ...current, founderPreview: true, updatedAt: new Date().toISOString() }), scan.leaseToken);
  if (!updated) return Response.json({ error: "This report changed while the preview was being prepared. Reload the report and try again." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, reportUrl: `/r/${encodeURIComponent(id)}` }, { headers: { "Cache-Control": "no-store" } });
}
