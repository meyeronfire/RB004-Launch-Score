import type { Category, ScanStatus, Severity } from "./types";

export type ShareVariant = "score" | "findings";
export type ShareFormat = "og" | "portrait" | "story";

export const SHARE_FORMATS: Record<ShareFormat, { width: number; height: number; label: string }> = {
  og: { width: 1200, height: 630, label: "1200 × 630 · X / OG" },
  portrait: { width: 1080, height: 1350, label: "1080 × 1350 · Post" },
  story: { width: 1080, height: 1920, label: "1080 × 1920 · Story" },
};

// Bump when the card artwork changes. Social apps cache og:image by URL, so the
// version has to be part of the address Next advertises. updatedAt covers a
// later rescore of the same report.
export const SHARE_CARD_VERSION = "4";

export function shareCardImagePath(id: string, updatedAt?: string) {
  const stamp = updatedAt ? `${SHARE_CARD_VERSION}-${updatedAt}` : SHARE_CARD_VERSION;
  return `/r/${encodeURIComponent(id)}/opengraph-image?v=${encodeURIComponent(stamp)}`;
}

// Revalidate on every request. A long max-age would keep the previous artwork
// at the unversioned image route after a redesign.
export const SHARE_CARD_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export const isShareVariant = (value: unknown): value is ShareVariant => value === "score" || value === "findings";
export const isShareFormat = (value: unknown): value is ShareFormat => typeof value === "string" && Object.hasOwn(SHARE_FORMATS, value);

export type ShareCardInput = {
  score?: number;
  domain?: string;
  categoryScores?: Partial<Record<Category, number>>;
  findings?: Array<{ severity: Severity }>;
  status: ScanStatus;
};

export type ShareCardData = {
  hasData: boolean;
  score: number | null;
  statusLabel: string;
  domain: string;
  categories: Array<{ label: string; value: number | null }>;
  issueCount: number;
  severityCounts: { critical: number; high: number; medium: number; low: number };
};

const CATEGORY_LABELS: Array<[string, Category]> = [
  ["Clarity", "clarity"],
  ["Conversion", "conversion"],
  ["Design & Brand", "design_brand"],
  ["Trust", "trust"],
  ["Technical", "technical"],
  ["Security", "security"],
  ["SEO / AEO", "seo_aeo"],
];

function categoryValue(scores: Partial<Record<Category, number>>, key: Category) {
  const value = scores[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Pure data shaping for share cards. Deterministic; safe for missing scores,
// missing category scores, missing findings, and overlong domains.
// Design & Brand is categoryScores.design_brand — the same field the report
// page renders. A recorded 0 stays 0. A missing key stays null, which the card
// draws as an em dash rather than a fake zero.
export function buildShareCardData(scan: ShareCardInput): ShareCardData {
  const score = typeof scan.score === "number" ? scan.score : null;
  const categoryScores = scan.categoryScores ?? {};
  const categories = CATEGORY_LABELS.map(([label, key]) => ({ label, value: categoryValue(categoryScores, key) }));
  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of scan.findings ?? []) severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;
  const domain = (scan.domain ?? "").trim();
  const truncatedDomain = domain.length > 42 ? `${domain.slice(0, 39)}…` : domain;
  const statusLabel = score === null ? "Assessment incomplete." : score >= 90 ? "Launch ready." : score >= 75 ? "Strong launch shape." : score >= 50 ? "Getting there." : "Early build.";
  return { hasData: score !== null && scan.status === "complete", score, statusLabel, domain: truncatedDomain, categories, issueCount: (scan.findings ?? []).length, severityCounts };
}
