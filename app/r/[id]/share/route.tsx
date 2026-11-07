import { ImageResponse } from "next/og";
import { publicScan, readScan } from "@/lib/store";
import { exampleReport } from "@/lib/example";
import { buildShareCardData, SHARE_FORMATS, isShareVariant, isShareFormat } from "@/lib/share-card";
import { renderShareCard } from "@/lib/share-card-render";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  const [interDisplay, geistMono, wordmark] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/inter-display-medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/geist-mono.ttf")),
    readFile(path.join(process.cwd(), "public/verdkt-wordmark.png")),
  ]);
  const data = buildShareCardData(publicScan(scan));
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString("base64")}`;
  const { width, height } = SHARE_FORMATS[format];
  return new ImageResponse(renderShareCard({ data, variant, width, height, wordmarkSrc }), {
    width, height,
    fonts: [{ name: "Inter Display", data: interDisplay, style: "normal", weight: 500 }, { name: "Geist Mono", data: geistMono, style: "normal", weight: 400 }],
    headers: download ? { "Content-Disposition": `attachment; filename="verdkt-${variant}-${format}.png"` } : undefined,
  });
}
