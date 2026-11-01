import { publicScan, readScan } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/scans/[id]">) {
  const { id } = await context.params;
  const scan = await readScan(id);
  if (!scan) return Response.json({ error: "This report could not be found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(publicScan(scan), { headers: { "Cache-Control": "no-store" } });
}
