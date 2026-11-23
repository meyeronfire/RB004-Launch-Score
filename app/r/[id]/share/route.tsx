import { ImageResponse } from "next/og";
import { publicScan, readScan } from "@/lib/store";
import { exampleReport } from "@/lib/example";
import { buildShareCardData, SHARE_FORMATS, isShareVariant, isShareFormat } from "@/lib/share-card";
import { renderShareCard } from "@/lib/share-card-render";
import { loadShareCardAssets, shareCardHeaders } from "@/lib/share-card-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const variantParam = url.searchParams.get("variant");
  const formatParam = url.searchParams.get("format");
  const variant = isShareVariant(variantParam) ? variantParam : "score";
  const format = isShareFormat(formatParam) ? formatParam : "og";
  const download = url.searchParams.get("download") === "1";
  const scan = id === "example" ? exampleReport : await readScan(id);
  if (!scan || scan.status !== "complete" || typeof scan.score !== "number") return new Response("Report not found", { status: 404 });
  const { fonts, logoSrc, chromeSrc } = await loadShareCardAssets();
  const data = buildShareCardData(publicScan(scan));
  const { width, height } = SHARE_FORMATS[format];
  const headers = download
    ? shareCardHeaders({ "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="ready-for-real-${variant}-${format}.png"` })
    : shareCardHeaders();
  return new ImageResponse(renderShareCard({ data, variant, width, height, logoSrc, chromeSrc }), { width, height, fonts, headers });
}
