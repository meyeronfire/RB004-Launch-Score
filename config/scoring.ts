import type { Category } from "@/lib/types";

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  clarity: 15,
  conversion: 25,
  design_brand: 15,
  trust: 10,
  technical: 15,
  security: 10,
  seo_aeo: 10,
};

export const CATEGORY_CHECKS: Record<Category, string[]> = {
  clarity: ["contentReview"],
  conversion: ["primaryCtaTargets", "mobileOverflow", "formCount"],
  design_brand: ["designReview", "designContrastFailures", "designFontFamilies", "designDistinctColors"],
  trust: ["proofSignals", "pricing", "faq", "contact"],
  technical: ["status", "redirects", "redirectChain", "ttfb", "requestCount", "assetWeights", "largestAssets", "sameOriginLinks", "brokenLinkDetails", "pageSpeedMobile", "pageSpeedDesktop", "lighthouseMobileAccessibility", "lighthouseDesktopAccessibility", "lighthouseMobileBestPractices", "lighthouseDesktopBestPractices", "consoleErrors", "consoleErrorDetails", "wholeSitePages"],
  security: ["https", "tlsCertificate", "httpToHttps", "contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy", "exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes"],
  seo_aeo: ["title", "titleLength", "description", "descriptionLength", "h1Count", "headingOrder", "canonical", "metaRobots", "robots", "sitemap", "jsonLd", "hreflang", "imageAltCoverage", "ogTitle", "ogDescription", "ogImage", "twitterCard", "lighthouseMobileSeo", "lighthouseDesktopSeo"],
};

// Lighthouse SEO is scored in SEO/AEO; technical uses performance, accessibility, and best practices.
export const LIGHTHOUSE_TECHNICAL_SHARE = 0.35;
