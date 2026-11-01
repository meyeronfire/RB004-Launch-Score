export type Category = "clarity" | "conversion" | "trust" | "technical";
export type Severity = "critical" | "high" | "medium" | "low";
export type Finding = { id: string; category: Category; severity: Severity; title: string; why_it_matters: string; evidence: string; fix: string };
export type CheckState = "checked" | "unknown";
export type MetricCheck = { state: CheckState; value?: string | number; note?: string };
export type ScanStatus = "queued" | "scanning" | "complete" | "failed";
export type ScanRecord = {
  id: string; url: string; status: ScanStatus; phase: string; createdAt: string; updatedAt: string;
  phaseHistory?: string[];
  leaseToken?: string;
  cacheKey?: string;
  error?: string; score?: number; categoryScores?: Record<Category, number>; findings?: Finding[];
  categoryCoverage?: Record<Category, number>;
  checks?: Record<string, MetricCheck>; desktopImage?: string; mobileImage?: string;
  domain?: string; title?: string; description?: string; finalUrl?: string; redirects?: string[];
  stackHints?: string[]; contentReview?: string; leadEmail?: string; paid?: boolean;
  paidPayload?: PaidPayload;
};
export type PaidPayload = { available: boolean; findings: Finding[]; prompts: Record<string, string>; copyDrafts: { status: string; headlines: string[]; subheadline: string; cta: string; faq: string; metaTitle: string; metaDescription: string } };
