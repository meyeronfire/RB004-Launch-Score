import { ImageResponse } from "next/og";
import { readScan } from "@/lib/store";
import { PRODUCT_NAME, RELEASE_CODE } from "@/config/release";
import { exampleReport } from "@/lib/example";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = `${PRODUCT_NAME} report card`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const categories: Array<[string, Category]> = [["Clarity", "clarity"], ["Conversion", "conversion"], ["Design", "design_brand"], ["Trust", "trust"], ["Technical", "technical"], ["Security", "security"]];

export default async function OpenGraphImage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params; const scan = id === "example" ? exampleReport : await readScan(id);
  if (!scan || scan.status !== "complete" || typeof scan.score !== "number") return new Response("Report not found", { status: 404 });
  const [interDisplay, geistMono] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/inter-display-medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/geist-mono.ttf")),
  ]);
  const scores = scan.categoryScores ?? {};
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#fff", padding: "56px 72px", fontFamily: "Inter Display", position: "relative" }}>
    <div style={{ position: "absolute", top: 0, right: 0, width: 420, height: "100%", background: "linear-gradient(250deg, rgba(255,45,139,0.16) 0%, rgba(255,45,139,0) 55%)", display: "flex" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, letterSpacing: 1, fontFamily: "Geist Mono" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}><span style={{ color: "#ff2d8b" }}>{RELEASE_CODE}</span><span style={{ fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>{PRODUCT_NAME}</span><span style={{ color: "#8a8a8a" }}>Launch Score</span></div>
      <span style={{ color: "#8a8a8a" }}>{id === "example" ? "EXAMPLE · MEASURED 31 OCT 2026" : "A REGULAR BASIS RELEASE · BERLIN"}</span>
    </div>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <span style={{ fontSize: 230, lineHeight: .78, letterSpacing: -9, background: "linear-gradient(174deg,#fff 0%,#d4d4d4 20%,#fff 31%,#acacac 45%,#888 48%,#fff 50%,#f5f5f5 54%,#919191 57%,#c4c4c4 76%,#fff 94%)", backgroundClip: "text", color: "transparent" }}>{scan.score}</span>
        <span style={{ fontSize: 25, color: "#a8a8a8", margin: "5px 0 0 16px", fontFamily: "Geist Mono" }}>/100</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 330, marginRight: 8 }}>
        {categories.map(([label, key]) => { const value = typeof scores[key] === "number" ? scores[key] : 0; return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 92, fontSize: 14, color: "#a8a8a8" }}>{label}</span>
            <div style={{ flex: 1, height: 3, background: "#2a2a2a", display: "flex", borderRadius: 2 }}><div style={{ width: `${value}%`, height: "100%", background: "#ff2d8b", borderRadius: 2, display: "flex" }} /></div>
            <span style={{ width: 30, fontSize: 14, fontFamily: "Geist Mono", color: "#e5e5e5", textAlign: "right" }}>{value}</span>
          </div>
        ); })}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 20, color: "#e5e5e5" }}>{scan.domain}</span>
        </div>
        <span style={{ fontSize: 15, color: "#8a8a8a" }}>Will a stranger understand, trust, and act?</span>
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #292929", paddingTop: 18, fontSize: 17 }}>
      <span>{PRODUCT_NAME} · {RELEASE_CODE}</span>
      <span style={{ color: "#a8a8a8" }}>THE LAUNCH SCORE FOR VIBE-CODED APPS</span>
    </div>
  </div>, { ...size, fonts: [{ name: "Inter Display", data: interDisplay, style: "normal", weight: 500 }, { name: "Geist Mono", data: geistMono, style: "normal", weight: 400 }] });
}
