import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_TAGLINE, RELEASE_CODE, SITE_URL } from "@/config/release";
import { PlausibleScript } from "@/components/plausible";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE} for vibe-coded apps`,
  description: "Find out if your launch page can convert a stranger. A rendered, evidence-based review of clarity, conversion, design, trust, technical readiness, and security.",
  openGraph: { title: `${PRODUCT_NAME} — ${RELEASE_CODE}`, description: "The launch score for vibe-coded apps.", siteName: "Regular Basis", type: "website" },
  twitter: { card: "summary_large_image", title: `${PRODUCT_NAME} — ${RELEASE_CODE}`, description: "The launch score for vibe-coded apps." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PlausibleScript /></body></html>;
}
