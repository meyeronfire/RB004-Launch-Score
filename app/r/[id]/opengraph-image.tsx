import { ImageResponse } from "next/og";
import { publicScan, readScan } from "@/lib/store";
import { exampleReport } from "@/lib/example";
import { buildShareCardData } from "@/lib/share-card";
import { renderShareCard } from "@/lib/share-card-render";
import { loadShareCardAssets, shareCardHeaders } from "@/lib/share-card-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Ready for Real launch score card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const scan = id === "example" ? exampleReport : await readScan(id);
  if (!scan || scan.status !== "complete" || typeof scan.score !== "number") return new Response("Report not found", { status: 404 });
  const { fonts, logoSrc, chromeSrc } = await loadShareCardAssets();
  const data = buildShareCardData(publicScan(scan));
  return new ImageResponse(renderShareCard({ data, variant: "score", width: size.width, height: size.height, logoSrc, chromeSrc }), {
    ...size,
    fonts,
    headers: shareCardHeaders(),
  });
}
