import { ImageResponse } from "next/og";
import { readScan } from "@/lib/store";
import { RELEASE_CODE, PRODUCT_NAME } from "@/config/release";
import { exampleReport } from "@/lib/example";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = `${PRODUCT_NAME} report card`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params; const scan = id === "example" ? exampleReport : await readScan(id);
  if (!scan || scan.status !== "complete" || typeof scan.score !== "number") return new Response("Report not found", { status: 404 });
  const [interDisplay, geistMono] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/inter-display-medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/geist-mono.ttf")),
  ]);
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#fff", padding: "62px 76px", fontFamily: "Inter Display" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18, letterSpacing: 1, fontFamily: "Geist Mono" }}><span style={{ color: "#ff2e7e" }}>{RELEASE_CODE}</span><span style={{ color: "#a8a8a8" }}>{id === "example" ? "EXAMPLE · MEASURED 31 OCT 2026" : "A REGULAR BASIS RELEASE · BERLIN"}</span></div>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "flex-start" }}><span style={{ fontSize: 244, lineHeight: .78, letterSpacing: -9, background: "linear-gradient(174deg,#fff 0%,#d4d4d4 20%,#fff 31%,#acacac 45%,#888 48%,#fff 50%,#f5f5f5 54%,#919191 57%,#c4c4c4 76%,#fff 94%)", backgroundClip: "text", color: "transparent" }}>{scan.score}</span><span style={{ fontSize: 26, color: "#a8a8a8", margin: "5px 0 0 16px", fontFamily: "Geist Mono" }}>/100</span></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, maxWidth: 450 }}><span style={{ width: 54, height: 4, background: "#ff2e7e" }} /><span style={{ fontSize: 28, textAlign: "right", color: "#e5e5e5" }}>{scan.domain}</span><span style={{ fontSize: 18, color: "#a8a8a8" }}>Will a stranger understand, trust, and act?</span></div></div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #292929", paddingTop: 20, fontSize: 18 }}><span>{PRODUCT_NAME} · {RELEASE_CODE}</span><span style={{ color: "#a8a8a8" }}>THE LAUNCH SCORE FOR VIBE-CODED APPS</span></div>
  </div>, { ...size, fonts: [{ name: "Inter Display", data: interDisplay, style: "normal", weight: 500 }, { name: "Geist Mono", data: geistMono, style: "normal", weight: 400 }] });
}
