import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import type { Metadata } from "next";
import { PRODUCT_NAME, SITE_URL } from "@/config/release";
import { PlausibleScript } from "@/components/plausible";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME} — Launch Readiness Check for AI-Built Apps`,
  description: "Run a free launch readiness check for your AI-built app. Get an evidence-based review of your landing page, conversion, accessibility, security, and technical setup.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${PRODUCT_NAME} — Launch Readiness Check for AI-Built Apps`,
    description: "A free, evidence-based launch readiness check for AI-built apps.",
    siteName: PRODUCT_NAME,
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — Launch Readiness Check for AI-Built Apps`,
    description: "A free, evidence-based launch readiness check for AI-built apps.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<PlausibleScript /></body></html>;
}
