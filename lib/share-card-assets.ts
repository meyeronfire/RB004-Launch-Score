import { readFile } from "node:fs/promises";
import path from "node:path";
import { SHARE_CARD_CACHE_CONTROL, SHARE_CARD_VERSION } from "@/lib/share-card";

export async function loadShareCardAssets() {
  const [interDisplay, geistMono, logo, chrome] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/inter-display-medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/geist-mono.ttf")),
    readFile(path.join(process.cwd(), "public/r4r-logo.jpg")),
    readFile(path.join(process.cwd(), "public/hero-chrome.png")),
  ]);
  return {
    fonts: [
      { name: "Inter Display", data: interDisplay, style: "normal" as const, weight: 500 as const },
      { name: "Geist Mono", data: geistMono, style: "normal" as const, weight: 400 as const },
    ],
    logoSrc: `data:image/jpeg;base64,${logo.toString("base64")}`,
    chromeSrc: `data:image/png;base64,${chrome.toString("base64")}`,
  };
}

export function shareCardHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "Cache-Control": SHARE_CARD_CACHE_CONTROL, "X-Share-Card-Version": SHARE_CARD_VERSION, ...extra };
}
