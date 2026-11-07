import { ImageResponse } from "next/og";
import { publicScan, readScan } from "@/lib/store";
import { exampleReport } from "@/lib/example";
import { buildShareCardData } from "@/lib/share-card";
import { renderShareCard } from "@/lib/share-card-render";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "VERDKT report card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params; const scan = id === "example" ? exampleReport : await readScan(id);
  if (!scan || scan.status !== "complete" || typeof scan.score !== "number") return new Response("Report not found", { status: 404 });
  const [interDisplay, geistMono, wordmark] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/inter-display-medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/geist-mono.ttf")),
    readFile(path.join(process.cwd(), "public/verdkt-wordmark.png")),
  ]);
  const data = buildShareCardData(publicScan(scan));
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString("base64")}`;
  return new ImageResponse(renderShareCard({ data, variant: "score", width: size.width, height: size.height, wordmarkSrc }), { ...size, fonts: [{ name: "Inter Display", data: interDisplay, style: "normal", weight: 500 }, { name: "Geist Mono", data: geistMono, style: "normal", weight: 400 }] });
}
