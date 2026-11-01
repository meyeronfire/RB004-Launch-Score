import type { Finding, MetricCheck } from "./types";

export function checkOutcome(key: string, metric: MetricCheck, findings: Finding[] = []): boolean | undefined {
  if (metric.state !== "checked" || metric.value === undefined) return undefined;
  const value = metric.value;
  const text = String(value);
  if (["https"].includes(key)) return value === "Secure";
  if (["tlsCertificate"].includes(key)) return value === "Valid";
  if (["httpToHttps"].includes(key)) return value === "Redirects to HTTPS";
  if (["contentSecurityPolicy", "strictTransportSecurity", "frameProtection", "contentTypeOptions", "referrerPolicy", "permissionsPolicy"].includes(key)) return value === "Present";
  if (["exposedFiles", "frontendSecrets", "mixedContent", "cookieIssues", "corsWildcardRoutes", "consoleErrors", "designContrastFailures"].includes(key)) return Number(value) === 0;
  if (key === "status") return Number(value) >= 200 && Number(value) < 400;
  if (key === "title" || key === "description" || key === "canonical" || key === "favicon" || key === "appleTouchIcon" || key === "ogTitle" || key === "ogDescription") return Boolean(text) && !["Missing", "Not detected"].includes(text);
  if (key === "titleLength") return Number(value) >= 30 && Number(value) <= 60;
  if (key === "descriptionLength") return Number(value) >= 70 && Number(value) <= 160;
  if (key === "h1Count") return Number(value) === 1;
  if (key === "headingOrder") return value === "In order";
  if (key === "metaRobots") return !/\bnoindex\b/i.test(text);
  if (key === "sitemap") return Number(value) >= 200 && Number(value) < 400;
  if (key === "imageAltCoverage") { const [good, all] = text.split("/").map(Number); return Number.isFinite(good) && Number.isFinite(all) && good === all; }
  if (key === "jsonLd") return !/\d+ invalid/.test(text);
  if (key === "twitterCard") return Boolean(text) && text !== "Missing";
  if (["proofSignals", "pricing", "faq", "contact"].includes(key)) return text === "Detected";
  if (key === "hreflang") return !findings.some((item) => item.section === "seo" && /hreflang/i.test(item.title));
  if (key === "primaryCtaTargets") return !findings.some((item) => item.section === "forms" && /CTA target|primary action/i.test(item.title));
  if (key === "mobileOverflow") return value === "None detected";
  if (key === "formCount") return Number.isFinite(Number(value));
  if (["pageSpeedMobile", "pageSpeedDesktop", "lighthouseMobileAccessibility", "lighthouseDesktopAccessibility", "lighthouseMobileBestPractices", "lighthouseDesktopBestPractices", "lighthouseMobileSeo", "lighthouseDesktopSeo"].includes(key)) return Number(value) >= 90;
  return undefined;
}

export function calculateAuditCounts(checks: Record<string, MetricCheck>, findings: Finding[]) {
  const outcomes = Object.entries(checks).map(([key, metric]) => checkOutcome(key, metric, findings)).filter((outcome): outcome is boolean => outcome !== undefined);
  const issues = outcomes.filter((passed) => !passed).length;
  return { checksRun: outcomes.length, passed: outcomes.length - issues, issues };
}
