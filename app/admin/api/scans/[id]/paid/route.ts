import { cookies } from "next/headers";
import { ADMIN_COOKIE, validAdminCookie } from "@/lib/admin-auth";
import { readScan } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/admin/api/scans/[id]/paid">) {
  const cookieStore = await cookies();
  if (!validAdminCookie(cookieStore.get(ADMIN_COOKIE)?.value)) {
    return Response.json({ error: "Admin access could not be verified." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { id } = await context.params;
  const scan = await readScan(id);
  if (!scan || scan.status !== "complete") return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!scan.founderPreview || !scan.paidPayload?.available) {
    return Response.json({ error: "A founder preview has not been prepared for this report." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(scan.paidPayload, { headers: { "Cache-Control": "no-store" } });
}
