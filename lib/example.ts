import type { ScanRecord } from "./types";

// Sanitized copy of a live studio-site scan made with this release's scan engine on 2026-10-31.
// The IDs, internal payload, email, and paid content are deliberately omitted.
export const exampleReport: ScanRecord & { lockedCount: number; lockedTitles: string[]; paidAvailable: boolean } = {
  id: "example", url: "https://regularbasis.studio/", status: "complete", phase: "Example report", createdAt: "2026-10-31T22:49:32.701Z", updatedAt: "2026-10-31T22:49:41.278Z",
  phaseHistory: ["Checking scan permissions…", "Rendering the desktop page…", "Rendering the mobile page…", "Checking links and page signals…", "Preparing the evidence-led report…"],
  score: 88, categoryScores: { clarity: 80, conversion: 93, trust: 91, technical: 93 }, categoryCoverage: { clarity: 0.6, conversion: 0.85, trust: 1, technical: 0.9 },
  findings: [
    { id: "example-image-alt", category: "technical", severity: "medium", title: "Some images have no descriptive alt text", why_it_matters: "Screen reader users can miss information carried by images without alt text.", evidence: "1 of 4 rendered images have no non-empty alt attribute.", fix: "Add concise alt text to informative images; use empty alt text for decorative images." },
    { id: "example-mobile-tap-target", category: "conversion", severity: "low", title: "The first mobile action has a small tap target", why_it_matters: "Small controls can be harder to activate accurately on a touch screen.", evidence: "The first visible mobile action measures 163 × 30px; the target is at least 44 × 44px.", fix: "Increase the primary action's touch area to at least 44 × 44px without crowding nearby controls." },
    { id: "example-faq", category: "trust", severity: "low", title: "No FAQ or objection handling was detected", why_it_matters: "Brief answers can resolve common uncertainties before a visitor commits.", evidence: "No FAQ heading, common questions heading, or details element was detected.", fix: "Answer the questions that matter before signup, such as setup time, compatibility, or cancellation." },
    { id: "example-proof", category: "trust", severity: "low", title: "No recognizable proof signal was detected", why_it_matters: "A first-time visitor may look for a reason to trust a product before taking the next step.", evidence: "The rendered text and image descriptions did not include common review, customer story, or logo language.", fix: "If you have real customer proof, add a concise quotation, case study, or customer logo with permission." },
    { id: "example-pricing", category: "trust", severity: "low", title: "Pricing details were not detected", why_it_matters: "Visitors may hesitate when cost, plans, or a free option are difficult to find.", evidence: "No currency amount, pricing section, free plan, or free trial language was detected in rendered page text.", fix: "If the product is paid, show the starting price and what it includes; if not, explain the free path." },
  ],
  lockedCount: 2,
  lockedTitles: ["No recognizable proof signal was detected", "Pricing details were not detected"],
  paidAvailable: false,
  checks: {
    status: { state: "checked", value: 200 }, redirects: { state: "checked", value: 0 }, https: { state: "checked", value: "Secure" },
    title: { state: "checked", value: "Regular Basis — Software Label for Digital Culture" }, description: { state: "checked", value: "Regular Basis is an independent software label from Berlin, building software for artists, creators and culture. Home of Klare, Epkay and URTYPE." },
    ogTitle: { state: "checked", value: "Regular Basis — Software Label for Digital Culture" }, ogDescription: { state: "checked", value: "Independent software for people between projects, cities, stages and screens." }, ogImage: { state: "checked", value: "2400 × 1260px · 2172140 bytes" },
    favicon: { state: "checked", value: "https://regularbasis.studio/assets/mark-v3-32.png" }, appleTouchIcon: { state: "checked", value: "https://regularbasis.studio/assets/mark-v3-192.png" }, canonical: { state: "checked", value: "https://regularbasis.studio/" },
    robots: { state: "checked", value: "Rules found" }, sitemap: { state: "checked", value: 200 }, imageAltCoverage: { state: "checked", value: "3/4" }, sameOriginLinks: { state: "checked", value: "4 checked · 0 HTTP errors · 0 couldn't check" },
    proofSignals: { state: "checked", value: "Not detected by text and image-label checks" }, pricing: { state: "checked", value: "Not detected in page text" }, faq: { state: "checked", value: "Not detected" }, contact: { state: "checked", value: "Detected" }, mobileOverflow: { state: "checked", value: "None detected" },
    pageSpeedMobile: { state: "unknown", note: "PageSpeed Insights is not configured." }, pageSpeedDesktop: { state: "unknown", note: "PageSpeed Insights is not configured." }, lcp: { state: "unknown", note: "PageSpeed Insights is not configured." }, cls: { state: "unknown", note: "PageSpeed Insights is not configured." }, inpMobile: { state: "unknown", note: "PageSpeed Insights is not configured." }, lcpDesktop: { state: "unknown", note: "PageSpeed Insights is not configured." }, clsDesktop: { state: "unknown", note: "PageSpeed Insights is not configured." }, inpDesktop: { state: "unknown", note: "PageSpeed Insights is not configured." },
  },
  desktopImage: "/example/live-studio-desktop.jpg", mobileImage: "/example/live-studio-mobile.jpg", domain: "regularbasis.studio", title: "Regular Basis — Software Label for Digital Culture",
  description: "Regular Basis is an independent software label from Berlin, building software for artists, creators and culture. Home of Klare, Epkay and URTYPE.", finalUrl: "https://regularbasis.studio/", redirects: [], stackHints: [], contentReview: "Content review is unavailable because no language model service is configured.",
};
