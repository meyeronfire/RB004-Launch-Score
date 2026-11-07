import { makeFinding } from "./score";
import type { Finding, MetricCheck, Severity } from "./types";

export type HeaderMap = Record<string, string | string[] | undefined>;
export type AuditResponse = { status: number; headers: HeaderMap; body: Buffer };
export type ScriptSource = { url: string; source: string };
export type ExposureFetcher = (url: string, options: { timeoutMs: number; maxBytes: number; maxRedirects: number }) => Promise<AuditResponse>;

export function auditFinding(section: NonNullable<Finding["section"]>, category: Finding["category"], severityOrTitle: Severity | string, titleOrWhy: string, whyOrEvidence: string, evidenceOrFix: string, maybeFix?: string): Finding {
  const withSeverity = maybeFix !== undefined;
  return makeFinding({ section, category, severity: withSeverity ? severityOrTitle as Severity : "medium", title: withSeverity ? titleOrWhy : severityOrTitle,
    why_it_matters: withSeverity ? whyOrEvidence : titleOrWhy, evidence: withSeverity ? evidenceOrFix : whyOrEvidence, fix: withSeverity ? maybeFix : evidenceOrFix });
}
const unknown = (note: string): MetricCheck => ({ state: "unknown", note });

const headerValue = (headers: HeaderMap, name: string) => {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value.join(", ") : value ?? "";
};

export function inspectSecurityHeaders(headers: HeaderMap) {
  const csp = headerValue(headers, "content-security-policy");
  const xFrame = headerValue(headers, "x-frame-options");
  const checks: Record<string, MetricCheck> = {
    contentSecurityPolicy: csp ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
    strictTransportSecurity: /(?:^|;)\s*max-age\s*=\s*[1-9]\d*/i.test(headerValue(headers, "strict-transport-security")) ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
    frameProtection: /(?:^|;)\s*frame-ancestors\b/i.test(csp) || /^(deny|sameorigin)$/i.test(xFrame.trim()) ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
    contentTypeOptions: /^nosniff$/i.test(headerValue(headers, "x-content-type-options").trim()) ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
    referrerPolicy: headerValue(headers, "referrer-policy") ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
    permissionsPolicy: headerValue(headers, "permissions-policy") ? { state: "checked", value: "Present" } : { state: "checked", value: "Missing" },
  };
  const definitions: Array<[string, string, Severity, string]> = [
    ["contentSecurityPolicy", "Content-Security-Policy", "high", "Set a restrictive Content-Security-Policy that allows only the scripts, styles, images, and connections the site needs."],
    ["strictTransportSecurity", "Strict-Transport-Security", "high", "After confirming HTTPS works for every subdomain you use, add Strict-Transport-Security with a suitable max-age."],
    ["frameProtection", "frame-ancestors / X-Frame-Options", "medium", "Set frame-ancestors in Content-Security-Policy or set X-Frame-Options to DENY/SAMEORIGIN."],
    ["contentTypeOptions", "X-Content-Type-Options", "medium", "Set X-Content-Type-Options: nosniff."],
    ["referrerPolicy", "Referrer-Policy", "low", "Set a Referrer-Policy such as strict-origin-when-cross-origin."],
    ["permissionsPolicy", "Permissions-Policy", "low", "Set a Permissions-Policy that disables browser features the site does not use."],
  ];
  const findings = definitions.flatMap(([key, name, severity, fix]) => checks[key].value === "Missing" ? [auditFinding("security", "security", severity, `Missing ${name} security header`, "Response headers help limit browser capabilities and reduce the impact of common web attacks.", `${name} was not present in the launch page response.`, fix)] : []);
  return { checks, findings };
}

const secretPatterns: Array<{ type: string; pattern: RegExp }> = [
  { type: "API secret (sk-)", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { type: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { type: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { type: "GitHub token", pattern: /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { type: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { type: "AWS access key ID", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "JWT-like token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

function isSupabaseServiceRole(token: string) {
  const payload = token.split(".")[1];
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return decoded.role === "service_role";
  } catch { return false; }
}

export type SecretMatch = { type: string; file: string; masked: string };
export function detectFrontendSecrets(source: string, file: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  const seen = new Set<string>();
  for (const { type, pattern } of secretPatterns) {
    for (const match of source.matchAll(pattern)) {
      const token = match[0];
      const supabase = type === "JWT-like token" && isSupabaseServiceRole(token);
      if (type === "JWT-like token" && !supabase) continue;
      const actualType = supabase ? "Supabase service_role token" : type;
      const safeFile = (() => { try { return new URL(file, "https://scan.invalid").pathname.slice(0, 180); } catch { return "/bundle.js"; } })();
      const key = `${actualType}\0${safeFile}\0${token.slice(0, 4)}`;
      if (!seen.has(key)) found.push({ type: actualType, file: safeFile, masked: `${token.slice(0, 4)}••••` });
      seen.add(key);
    }
  }
  return found;
}

export function sourceMapUrls(source: string, scriptUrl: string) {
  const maps = new Set<string>();
  for (const match of source.matchAll(/(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=\s*([^\s*]+)\s*(?:\*\/)?/g)) {
    try {
      const url = new URL(match[1], scriptUrl);
      if (url.pathname.endsWith(".js.map")) { url.hash = ""; maps.add(url.toString()); }
    } catch { /* Ignore malformed references. */ }
  }
  // Some build pipelines omit the sourceMappingURL comment but still publish the adjacent map.
  try { const adjacent = new URL(`${new URL(scriptUrl).pathname}.map`, scriptUrl); if (adjacent.pathname.endsWith(".js.map")) maps.add(adjacent.toString()); } catch { /* Ignore malformed script URLs. */ }
  return [...maps].slice(0, 3);
}

function plausibleFile(path: string, response: AuditResponse) {
  if (response.status < 200 || response.status >= 300) return false;
  const body = response.body;
  const text = body.toString("utf8").slice(0, 16_384);
  if (/\.env$/i.test(path)) return /(?:^|\n)\s*[A-Z_][A-Z0-9_]{1,60}\s*=/m.test(text) && !/^\s*<!doctype html/i.test(text);
  if (/\.git\/config$/i.test(path)) return /^\s*\[(?:core|remote|branch)\s*[^\]]*\]/im.test(text);
  if (/\.DS_Store$/i.test(path)) return body.subarray(0, 4).toString("ascii") === "Bud1" || headerValue(response.headers, "content-type").includes("vnd.apple");
  if (/config\.json$/i.test(path)) {
    try { const parsed = JSON.parse(text) as unknown; return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)); } catch { return false; }
  }
  if (/backup\.zip$/i.test(path)) return body.length >= 4 && body[0] === 0x50 && body[1] === 0x4b && body[2] === 0x03 && body[3] === 0x04;
  if (/\.js\.map$/i.test(path)) {
    try { const parsed = JSON.parse(text) as { sources?: unknown; mappings?: unknown }; return Array.isArray(parsed.sources) && typeof parsed.mappings === "string"; } catch { return false; }
  }
  return false;
}

export async function inspectExposedFiles(origin: string, scripts: ScriptSource[], fetcher: ExposureFetcher, beforeFetch?: (url: URL) => Promise<void> | void) {
  const findings: Finding[] = [];
  const exposed: string[] = [];
  const checked: Array<{ file: string; exposed: boolean }> = [];
  const candidates = ["/.env", "/.git/config", "/.DS_Store", "/config.json", "/backup.zip"];
  const allowedOrigin = new URL(origin).origin;
  const mapSecrets: SecretMatch[] = [];
  const maps = new Set(scripts.flatMap((script) => sourceMapUrls(script.source, script.url)).filter((url) => new URL(url).origin === allowedOrigin));
  const urls = [...candidates.map((path) => new URL(path, origin).toString()), ...[...maps].slice(0, 3)];
  for (const url of urls) {
    let isExposed = false;
    const path = new URL(url).pathname;
    try {
      await beforeFetch?.(new URL(url));
      const response = await fetcher(url, { timeoutMs: 2500, maxBytes: 16_384, maxRedirects: 0 });
      isExposed = plausibleFile(path, response);
      if (isExposed && /\.js\.map$/i.test(path)) {
        try {
          const sourceMap = JSON.parse(response.body.toString("utf8")) as { sourcesContent?: unknown };
          if (Array.isArray(sourceMap.sourcesContent)) for (const content of sourceMap.sourcesContent) if (typeof content === "string") mapSecrets.push(...detectFrontendSecrets(content, path));
        } catch { /* Malformed maps are reported as exposed only when their shape was confirmed. */ }
      }
    } catch { /* Unknown fetches do not become exposure findings. */ }
    checked.push({ file: path, exposed: isExposed });
    if (isExposed) exposed.push(path);
    if (isExposed) {
      const critical = path === "/.env" || path === "/.git/config";
      findings.push(auditFinding("security", "security", critical ? "critical" : "high", `An exposed ${path} file is publicly readable`, "Public configuration and source artifacts can reveal implementation details or sensitive values.", `A bounded read of ${path} matched the expected file format; response contents were discarded.`, `Remove ${path} from the public site output and rotate any credentials that may have been included.`));
    }
  }
  for (const script of scripts.slice(0, 6)) {
    for (const secret of detectFrontendSecrets(script.source, script.url)) {
      findings.push(auditFinding("security", "security", "critical", `A ${secret.type} may be exposed in a frontend bundle`, "Secrets shipped to browser code can be copied by anyone who can load the page.", `Potential ${secret.type} in ${secret.file}; masked value: ${secret.masked}. The full value was not retained.`, "Remove the secret from client code, rotate it with its provider, and move privileged requests behind a server-side endpoint."));
    }
  }
  for (const secret of mapSecrets) findings.push(auditFinding("security", "security", "critical", `A ${secret.type} may be exposed in a public source map`, "Secrets included in published source maps are readable by anyone who can load the page.", `Potential ${secret.type} in ${secret.file}; masked value: ${secret.masked}. The full value was not retained.`, "Remove the secret from source code, rotate it with its provider, and stop publishing the sensitive source map."));
  const combined = scripts.map((script) => script.source).join("\n");
  if (/\.supabase\.co\b/i.test(combined) && /(?:createClient|supabaseKey|anon\s*[:=])/i.test(combined)) findings.push(auditFinding("security", "security", "low", "Review Supabase row-level security", "A public Supabase client is normal for browser apps, but database access must be constrained by row-level security.", "A Supabase project URL and public-client initialization pattern were found in frontend code. No database was queried.", "Review row-level security policies for every exposed table and keep service-role keys on the server only."));
  if (/firebase(?:app|io)\.com|firebaseio\.com/i.test(combined) && /apiKey\s*[:=]/i.test(combined)) findings.push(auditFinding("security", "security", "low", "Review Firebase security rules", "Firebase browser configuration is public; database and storage rules determine who can read or change data.", "Firebase project configuration was found in frontend code. No Firebase service was queried.", "Review Firestore, Realtime Database, and Storage rules; restrict access by authenticated user and intended data scope."));
  return { findings, checked, exposed };
}

export function securityFindings(input: {
  protocol: string; certificateValid: boolean | undefined; httpRedirectsToHttps: boolean | undefined; headers: HeaderMap; mixedContent: string[];
  cookies: string[]; secrets: SecretMatch[]; corsWildcards: string[]; exposureFindings: Finding[];
}) {
  const findings = [...input.exposureFindings];
  if (input.protocol !== "https:") findings.push(auditFinding("security", "security", "high", "The page does not use HTTPS", "HTTPS protects the connection and enables secure browser controls.", `The final page URL uses ${input.protocol.replace(":", "")}.`, "Serve the page over HTTPS and redirect HTTP traffic to the secure URL."));
  if (input.certificateValid === false) findings.push(auditFinding("security", "security", "critical", "The HTTPS certificate could not be validated", "Visitors may be unable to verify the site's identity or securely load its pages.", "The HTTPS request failed with a TLS certificate validation error.", "Install a valid certificate for this hostname and renew it before expiry."));
  if (input.httpRedirectsToHttps === false) findings.push(auditFinding("security", "security", "medium", "HTTP does not redirect to HTTPS", "Visitors can reach the site over an unencrypted connection if they enter an HTTP address.", "The HTTP version did not redirect to the matching HTTPS page.", "Configure the host to redirect every HTTP request to the same HTTPS URL."));
  const headerAudit = inspectSecurityHeaders(input.headers);
  findings.push(...headerAudit.findings);
  if (input.mixedContent.length) findings.push(auditFinding("security", "security", "high", "The HTTPS page references mixed-content resources", "HTTP scripts, images, or frames can weaken or break a secure page.", `${input.mixedContent.length} HTTP resource URL${input.mixedContent.length === 1 ? "" : "s"} were found in the rendered page.`, "Change every listed resource to HTTPS or remove it if no secure version exists."));
  if (input.cookies.length) findings.push(auditFinding("security", "security", "medium", "A cookie is missing recommended security attributes", "Cookie attributes limit script access and reduce exposure during cross-site requests.", `Cookie${input.cookies.length === 1 ? "" : "s"} missing one or more attributes: ${input.cookies.slice(0, 5).join(", ")}. Cookie values were not retained.`, "Set Secure, HttpOnly, and an appropriate SameSite attribute on session cookies; use a documented exception only when a cookie must be readable by browser code."));
  for (const secret of input.secrets) findings.push(auditFinding("security", "security", "critical", `A ${secret.type} may be exposed in a frontend bundle`, "Secrets shipped to browser code can be copied by anyone who can load the page.", `Potential ${secret.type} in ${secret.file}; masked value: ${secret.masked}. The full value was not retained.`, "Remove the secret from client code, rotate it with its provider, and move privileged requests behind a server-side endpoint."));
  if (input.corsWildcards.length) findings.push(auditFinding("security", "security", "low", "A referenced API route allows every origin", "A wildcard CORS response may allow other sites to read a route's response.", `Wildcard Access-Control-Allow-Origin was returned for ${input.corsWildcards.slice(0, 5).join(", ")}.`, "Restrict the route's Access-Control-Allow-Origin to the origins that need browser access."));
  return { findings, checks: { ...headerAudit.checks, https: { state: "checked", value: input.protocol === "https:" ? "HTTPS" : "HTTP" }, tlsCertificate: input.certificateValid === undefined ? unknown("Certificate validation could not be confirmed.") : { state: "checked", value: input.certificateValid ? "Valid" : "Invalid" }, httpToHttps: input.httpRedirectsToHttps === undefined ? unknown("The HTTP redirect could not be checked.") : { state: "checked", value: input.httpRedirectsToHttps ? "Redirects to HTTPS" : "No HTTPS redirect" }, mixedContent: { state: "checked", value: input.mixedContent.length }, cookies: { state: "checked", value: input.cookies.length }, frontendSecrets: { state: "checked", value: input.secrets.length }, corsWildcardRoutes: { state: "checked", value: input.corsWildcards.length } } as Record<string, MetricCheck> };
}

export type SeoSignals = {
  title: string; description: string; h1Count: number; headingOrderProblems: string[]; canonical: string; metaRobots: string;
  robotsHeader: string; hreflang: Array<{ lang: string; href: string; valid: boolean; status?: number }>;
  jsonLd: { valid: number; invalid: number }; imageCount: number; imageAltCount: number;
  ogTitle: string; ogDescription: string; ogImage: string; twitterCard: string;
};
export function seoFindings(seo: SeoSignals, sitemap: MetricCheck, deadLinks: string[]) {
  const findings: Finding[] = [];
  if (!seo.title) findings.push(auditFinding("seo", "seo_aeo", "The page has no SEO title", "Search engines and shared links need a concise title that describes the page.", "No document title was found.", "Add a specific title between 30 and 60 characters."));
  else if (seo.title.length < 30 || seo.title.length > 60) findings.push(auditFinding("seo", "seo_aeo", "The SEO title is outside the usual length range", "Search previews may truncate titles that are much longer than a typical result.", `The title contains ${seo.title.length} characters.`, "Rewrite the title to describe the product clearly in about 30–60 characters."));
  if (!seo.description) findings.push(auditFinding("seo", "seo_aeo", "The page has no meta description", "Search and social previews may need to infer a description from page content.", "No meta description was found.", "Add a concise, accurate meta description, usually about 70–160 characters."));
  else if (seo.description.length < 70 || seo.description.length > 160) findings.push(auditFinding("seo", "seo_aeo", "The meta description is outside the usual length range", "Search previews may truncate or omit descriptions that are much longer than a typical result.", `The description contains ${seo.description.length} characters.`, "Rewrite the description to explain the page accurately in about 70–160 characters."));
  if (seo.h1Count !== 1) findings.push(auditFinding("seo", "seo_aeo", "The page should have one clear H1", "A single primary heading helps readers and search engines identify the page's main topic.", `${seo.h1Count} H1 headings were found.`, "Keep one visible H1 for the page's main topic and use lower-level headings for sections."));
  if (seo.headingOrderProblems.length) findings.push(auditFinding("seo", "seo_aeo", "The heading order skips a level", "Skipped heading levels can make the page outline harder to navigate.", seo.headingOrderProblems.slice(0, 3).join("; "), "Reorder headings so each section descends one level at a time."));
  if (!seo.canonical) findings.push(auditFinding("seo", "seo_aeo", "No canonical URL was declared", "A canonical helps search engines identify the preferred address for this page.", "No canonical link was found.", "Add a canonical link that points to the preferred public URL."));
  if (/\bnoindex\b/i.test(`${seo.metaRobots} ${seo.robotsHeader}`)) findings.push(auditFinding("seo", "seo_aeo", "A noindex directive is active", "Search engines may omit a launch page from results when noindex is left on after development.", `Robots directives include: ${`${seo.metaRobots} ${seo.robotsHeader}`.trim().slice(0, 120)}.`, "Remove noindex only if the page is intended to appear in search results."));
  if (sitemap.state === "checked" && Number(sitemap.value) >= 400) findings.push(auditFinding("seo", "seo_aeo", "sitemap.xml returned an HTTP error", "A sitemap helps crawlers discover the site's intended public pages.", `The sitemap returned HTTP ${sitemap.value}.`, "Publish a valid sitemap.xml or remove the sitemap reference if the site does not use one."));
  if (seo.hreflang.some((item) => !item.valid || (item.status !== undefined && item.status >= 400))) findings.push(auditFinding("seo", "seo_aeo", "A hreflang alternate could not be validated", "Incorrect language alternates can point visitors and crawlers to the wrong localized page.", `${seo.hreflang.filter((item) => !item.valid || (item.status !== undefined && item.status >= 400)).length} hreflang entries were malformed or returned an HTTP error.`, "Use valid language-region codes and point each hreflang entry to a live localized page."));
  if (seo.jsonLd.invalid) findings.push(auditFinding("seo", "seo_aeo", "Structured data contains invalid JSON-LD", "Invalid structured data cannot be interpreted by search engines.", `${seo.jsonLd.invalid} JSON-LD block${seo.jsonLd.invalid === 1 ? "" : "s"} could not be parsed as JSON.`, "Correct the JSON syntax and validate the JSON-LD before publishing."));
  if (!seo.ogTitle || !seo.ogDescription || !seo.ogImage) findings.push(auditFinding("seo", "seo_aeo", "The Open Graph preview is incomplete", "Shared links may show a missing or inferred title, description, or image.", `Open Graph fields found: title ${seo.ogTitle ? "yes" : "no"}, description ${seo.ogDescription ? "yes" : "no"}, image ${seo.ogImage ? "yes" : "no"}.`, "Set accurate og:title, og:description, and og:image values for the page."));
  if (!seo.twitterCard) findings.push(auditFinding("seo", "seo_aeo", "No Twitter/X card type was declared", "The share preview may fall back to a smaller or less useful card format.", "No twitter:card meta value was found.", "Add a twitter:card value such as summary_large_image when a large share image is available."));
  if (seo.imageCount && seo.imageAltCount < seo.imageCount) findings.push(auditFinding("seo", "seo_aeo", "Some images have no descriptive alt text", "Alt text helps search engines and assistive technology understand informative images.", `${seo.imageCount - seo.imageAltCount} of ${seo.imageCount} images have no non-empty alt text.`, "Add concise alt text to informative images and empty alt text to decorative ones."));
  if (deadLinks.length) findings.push(auditFinding("forms", "conversion", "A primary CTA target returned an error", "A visitor cannot complete the next step if its destination is missing or unavailable.", `${deadLinks.length} primary CTA target${deadLinks.length === 1 ? "" : "s"} returned an error or used a placeholder link.`, `Repair or replace these primary destinations: ${deadLinks.slice(0, 4).join(", ")}.`));
  return findings;
}

export function leftoverFindings(input: { text: string; title: string; favicon: string; imageUrls: string[]; placeholderLinks: number; testimonials: string[]; consoleErrors: number; consoleMessages?: string[]; comingSoonCount: number }) {
  const findings: Finding[] = [];
  const textMatches = [...input.text.matchAll(/\b(lorem ipsum|your company|acme(?: inc\.?| corp\.?)?|john doe|example\.com|vite \+ react|create next app|lovable app)\b/gi)].map((match) => match[0]);
  const defaultTitle = /^(?:vite\s*\+\s*react|create next app|lovable app)$/i.test(input.title.trim());
  const defaultFavicon = /(?:vite\.svg|next\.svg|lovable\.svg|bolt\.svg|vercel\.svg)(?:[?#]|$)/i.test(input.favicon);
  const placeholderImages = input.imageUrls.filter((url) => /(?:placehold\.co|placeholder\.com|via\.placeholder|dummyimage|picsum\.photos|placeholder[-_/])/i.test(url));
  if (textMatches.length || defaultTitle) findings.push(auditFinding("leftovers", "clarity", "Template text or a default title remains on the page", "Template copy can make a launch page appear unfinished and obscure the real offer.", [...new Set(textMatches)].slice(0, 4).join(", ") || `Default page title: ${input.title}.`, "Replace template strings with accurate copy specific to the real product."));
  if (defaultFavicon) findings.push(auditFinding("leftovers", "technical", "A default framework favicon is still in use", "A starter icon can make browser tabs and bookmarks look unfinished.", `Default favicon path detected: ${new URL(input.favicon, "https://scan.invalid").pathname}.`, "Replace the framework starter icon with the product's own favicon."));
  if (placeholderImages.length) findings.push(auditFinding("leftovers", "clarity", "A placeholder image service is still referenced", "Placeholder imagery can make a page feel incomplete and may not represent the real product.", `${placeholderImages.length} placeholder image URL${placeholderImages.length === 1 ? "" : "s"} were detected.`, "Replace placeholder images with approved product imagery or remove them."));
  if (input.placeholderLinks) findings.push(auditFinding("leftovers", "conversion", "A placeholder link was found", "A link to # does not take the visitor to the promised destination.", `${input.placeholderLinks} link${input.placeholderLinks === 1 ? "" : "s"} use href="#".`, "Connect each link to a working destination or remove it until that destination exists."));
  if (input.comingSoonCount) findings.push(auditFinding("leftovers", "conversion", "A section is marked Coming soon", "A section that advertises an unavailable feature may distract visitors from what they can do today.", `${input.comingSoonCount} “Coming soon” label${input.comingSoonCount === 1 ? "" : "s"} were found in rendered text.`, "Remove unfinished sections or replace them with a clear description of what is available now."));
  if (input.testimonials.length) findings.push(auditFinding("leftovers", "trust", "A testimonial looks like a placeholder", "Unverified placeholder quotes can confuse visitors about what is genuine.", `${input.testimonials.length} testimonial block${input.testimonials.length === 1 ? "" : "s"} matched common sample names or generic template language. This is a pattern match, not a claim about authenticity.`, "Confirm every quote and attribution with its source; remove or replace any sample copy."));
  if (input.consoleErrors) findings.push(auditFinding("leftovers", "technical", "The page logged browser errors on load", "Runtime errors can stop scripts or interactive elements from working as intended.", input.consoleMessages?.length ? `${input.consoleErrors} browser console error${input.consoleErrors === 1 ? "" : "s"} were observed. First messages: ${input.consoleMessages.join(" | ")}` : `${input.consoleErrors} browser console error${input.consoleErrors === 1 ? "" : "s"} were observed. Error text was not retained.`, "Inspect the browser console, fix the underlying runtime issues, and retest the page without submitting forms."));
  return findings;
}

export function formFindings(input: { forms: Array<{ action: string; method: string; fields: number; unlabeledFields: number; emailInputs: number; invalidEmailInputs: number; handlerVisible: boolean }>; primaryCtas: Array<{ text: string; href: string }>; statusByUrl: Map<string, number | undefined>; baseUrl: string }) {
  const findings: Finding[] = [];
  const unresolved = input.primaryCtas.filter((cta) => !cta.href || cta.href === "#" || (input.statusByUrl.has(cta.href) && (input.statusByUrl.get(cta.href) ?? 0) >= 400));
  if (unresolved.length) findings.push(auditFinding("forms", "conversion", "A primary CTA target is missing or unavailable", "The main action should take the visitor to a working next step.", `${unresolved.length} primary action${unresolved.length === 1 ? "" : "s"} did not have a confirmed working target.`, "Set the CTA href to a public destination that returns a successful response."));
  for (const [index, form] of input.forms.entries()) {
    if (!form.action && !form.handlerVisible) findings.push(auditFinding("forms", "conversion", "A form action could not be confirmed from markup", "A signup or contact form needs a working submission path before visitors enter information.", `Form ${index + 1} has no action attribute or declarative submit handler in its markup. It was not submitted; script-registered handlers cannot be confirmed by this passive check.`, "Confirm the form has a working submission handler. The scan does not submit forms."));
    if (form.unlabeledFields) findings.push(auditFinding("forms", "conversion", "A form field is missing an accessible label", "A label helps screen-reader and keyboard users understand what to enter.", `Form ${index + 1} has ${form.unlabeledFields} unlabeled field${form.unlabeledFields === 1 ? "" : "s"}.`, "Associate a visible label with each input or provide an accessible name."));
    if (form.invalidEmailInputs) findings.push(auditFinding("forms", "conversion", "A likely email field is not typed as email", "Email inputs provide suitable keyboards and basic format checking.", `Form ${index + 1} has ${form.invalidEmailInputs} email-like field${form.invalidEmailInputs === 1 ? "" : "s"} with a different input type.`, 'Use <input type="email"> for email-address fields.'));
  }
  return findings;
}

export function extractSameOriginApiRoutes(sources: string[], origin: string) {
  const base = new URL(origin);
  const routes = new Set<string>();
  for (const source of sources) for (const match of source.matchAll(/["'`](https?:\/\/[^"'`\s]+|\/api\/[^"'`?#\s]+)/g)) {
    try {
      const url = new URL(match[1], base);
      if (url.origin === base.origin && url.pathname.startsWith("/api/")) { url.hash = ""; url.search = ""; routes.add(url.toString()); }
    } catch { /* Ignore malformed route strings. */ }
  }
  return [...routes].slice(0, 6);
}

export function countFindingsBySection(findings: Finding[]) {
  const sections = ["security", "seo", "leftovers", "forms", "technical"] as const;
  return Object.fromEntries(sections.map((section) => {
    const matching = findings.filter((item) => item.section === section);
    const counts = { total: matching.length, critical: matching.filter((item) => item.severity === "critical").length, high: matching.filter((item) => item.severity === "high").length, medium: matching.filter((item) => item.severity === "medium").length, low: matching.filter((item) => item.severity === "low").length };
    return [section, counts];
  }));
}
