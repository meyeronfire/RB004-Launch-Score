import { createHash, randomUUID } from "node:crypto";
import { chromium, type BrowserContext, type Page } from "playwright";
import { imageSize } from "image-size";
import { safeFetch, normalizePublicUrl, SafeFetchError, UnsafeTargetError, currentScanSignal, withScanSignal } from "./ssrf";
import { makeFinding, rankFindings, scoreFindings } from "./score";
import { findCachedScan, readScan, saveScan, updateScan } from "./store";
import type { Finding, MetricCheck, ScanRecord } from "./types";
import { reviewContent } from "./content-review";
import { promptVariants } from "./fix-prompts";
import { browserLaunchOptions } from "./browser-isolation";

const asDataUrl = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`;
const now = () => new Date().toISOString();
const running = new Set<string>();
const SCAN_WALL_LIMIT_MS = 90_000;

async function phase(id: string, name: string, leaseToken?: string) {
  await updateScan(id, (scan) => ({ ...scan, status: "scanning", phaseHistory: scan.phase !== name ? [...(scan.phaseHistory ?? []), scan.phase].filter((value, index, all) => value && all.indexOf(value) === index) : scan.phaseHistory, phase: name, updatedAt: now() }), leaseToken);
}
function finding(category: Finding["category"], severity: Finding["severity"], title: string, why_it_matters: string, evidence: string, fix: string) {
  return makeFinding({ category, severity, title, why_it_matters, evidence, fix });
}
function unknown(note: string): MetricCheck { return { state: "unknown", note }; }

type RobotsGroup = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };
function matchesRobotsPath(path: string, target: string) {
  const end = path.endsWith("$");
  const segments = (end ? path.slice(0, -1) : path).split("*");
  if (!target.startsWith(segments[0])) return false;
  if (segments.length === 1) return !end || target.length === segments[0].length;
  let cursor = segments[0].length;
  // Consume literal segments once, in order; attacker-supplied wildcards never become a regex.
  for (let index = 1; index < segments.length; index++) {
    const segment = segments[index];
    if (end && index === segments.length - 1) return target.endsWith(segment) && target.length - segment.length >= cursor;
    const found = target.indexOf(segment, cursor);
    if (found < 0) return false;
    cursor = found + segment.length;
  }
  return true;
}
export function isRobotsDisallowed(text: string, target: string) {
  const groups: RobotsGroup[] = []; let group: RobotsGroup = { agents: [], rules: [] };
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split("#", 1)[0].trim(); if (!clean) continue;
    const separator = clean.indexOf(":"); if (separator < 0) continue;
    const key = clean.slice(0, separator).trim().toLowerCase(); const value = clean.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length && value) group.rules.push({ allow: key === "allow", path: value });
  }
  if (group.agents.length) groups.push(group);
  const token = "rb004-launch-score";
  const specificity = (g: RobotsGroup) => Math.max(0, ...g.agents.filter((agent) => agent !== "*" && token.includes(agent)).map((agent) => agent.length));
  const maxSpecificity = Math.max(0, ...groups.map(specificity));
  const selected = maxSpecificity ? groups.filter((g) => specificity(g) === maxSpecificity) : groups.filter((g) => g.agents.includes("*"));
  const matched = selected.flatMap((g) => g.rules).filter((rule) => matchesRobotsPath(rule.path, target))
    .sort((a, b) => b.path.replace(/[\*$]/g, "").length - a.path.replace(/[\*$]/g, "").length || Number(b.allow) - Number(a.allow));
  return Boolean(matched[0] && !matched[0].allow);
}

const robotsCache = new Map<string, { expiresAt: number; result: Promise<{ check: MetricCheck; text?: string }> }>();
async function robotsFor(url: URL) {
  const origin = url.origin;
  let cached = robotsCache.get(origin);
  if (!cached || cached.expiresAt < Date.now()) {
    const result = (async () => {
      try {
        const res = await safeFetch(new URL("/robots.txt", origin).toString(), { timeoutMs: 4000, maxBytes: 64_000, maxRedirects: 2 });
        if (res.status === 404) return { check: { state: "checked", value: "Not found" } as MetricCheck, text: "" };
        if (res.status < 200 || res.status >= 400) return { check: unknown(`Could not confirm robots.txt rules (HTTP ${res.status}).`), text: undefined };
        return { check: { state: "checked", value: "Rules found" } as MetricCheck, text: res.body.toString("utf8") };
      } catch { return { check: unknown("Could not check robots.txt."), text: undefined }; }
    })();
    cached = { expiresAt: Date.now() + 60 * 60 * 1000, result };
    robotsCache.set(origin, cached);
    const resolved = await result;
    if (resolved.check.state === "unknown") cached.expiresAt = Date.now() + 15_000;
    return resolved;
  }
  return cached.result;
}
async function robotsDecision(url: URL) {
  const result = await robotsFor(url);
  const allowed = result.text !== undefined && !isRobotsDisallowed(result.text, `${url.pathname}${url.search}`);
  return { allowed, check: result.check };
}
async function inspectRobots(pageUrl: URL) {
  const decision = await robotsDecision(pageUrl);
  return { robots: decision.check, blocked: !decision.allowed };
}
async function assertRobotsAllows(url: URL) {
  const decision = await robotsDecision(url);
  if (!decision.allowed) throw new SafeFetchError("A requested page or resource is disallowed by robots.txt.");
}

export async function pageSnapshot(page: Page) {
  return page.evaluate(() => {
    const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}" i]`)?.content?.trim() ?? "";
    const og = (name: string) => document.querySelector<HTMLMetaElement>(`meta[property="og:${name}" i]`)?.content?.trim() ?? "";
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const h1 = document.querySelector("h1");
    const visible = (element: Element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"; };
    const controls: Element[] = [...anchors, ...document.querySelectorAll("button")];
    const ctas = controls
      .map((element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120), href: element instanceof HTMLAnchorElement ? element.href : "", visible: visible(element), top: rect.top, width: rect.width, height: rect.height, fontSize: parseFloat(style.fontSize) }; })
      .filter((a) => a.text);
    const images = [...document.images];
    const html = document.documentElement;
    return {
      title: document.title.trim(), description: meta("description"), ogTitle: og("title"), ogDescription: og("description"), ogImage: og("image"),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? "",
      favicon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? "",
      appleTouchIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? "",
      lang: html.lang, viewport: meta("viewport"), h1: h1?.textContent?.trim().replace(/\s+/g, " ") ?? "", h1Visible: h1 ? visible(h1) : false,
      text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 18_000), aboveFoldText: [...document.body.querySelectorAll("h1,h2,p,a,button")].filter(visible).filter((e) => e.getBoundingClientRect().top < innerHeight).map((e) => (e.textContent || "").trim()).join(" ").slice(0, 3500),
      ctas, links: anchors.map((a) => a.href).filter(Boolean).slice(0, 50), imageCount: images.length, imageAltCount: images.filter((i) => i.hasAttribute("alt") && i.alt.trim().length > 0).length,
      bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth, heroHeight: h1?.getBoundingClientRect().height ?? 0,
      h1FontSize: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      deadButtons: [...document.querySelectorAll("a[href='#'],button:disabled")].length,
      hasFaq: [...document.querySelectorAll("h1,h2,h3,summary")].some((e) => /frequently asked|\bfaq\b|common questions/i.test(e.textContent || "")) || document.querySelectorAll("details").length > 0,
      hasPricing: /\$\s?\d|pricing|plans and pricing|free plan|free trial/i.test(document.body.innerText || ""),
      hasProof: /testimonials?|customer stories|case studies|trusted by|reviews?|\b\d[,.]?\d*% of (users|customers|teams)/i.test(document.body.innerText || "") || [...document.images].some((i) => /logo/i.test(i.alt)),
      hasContact: [...document.querySelectorAll("a[href]")].some((a) => /mailto:|contact|support/i.test(`${a.getAttribute("href") || ""} ${a.textContent || ""}`)),
      placeholders: (document.body.innerText.match(/lorem ipsum|your company|insert .* here|placeholder text/gi) ?? []).slice(0, 5),
      html: document.documentElement.outerHTML.slice(0, 1_000_000),
    };
  });
}

export function deterministicFindings(input: {
  page: { title: string; h1: string; description: string; viewport: string; lang: string; imageCount: number; imageAltCount: number; ctas: Array<{ visible: boolean; top: number; height: number; width: number; text: string }>; deadButtons: number; placeholders: string[]; hasProof: boolean; hasPricing: boolean; hasFaq: boolean; hasContact: boolean };
  mobile: { bodyWidth: number; viewportWidth: number; ctas: Array<{ visible: boolean; top: number; height: number; width: number; text: string }> };
  links: { broken: string[]; checked: number; unknownCount: number };
  status: number; protocol: string; ogImage: MetricCheck; ogImageTooSmall: boolean;
}) {
  const { page: snap, mobile: mobileSnap, links: linkResult } = input;
  const findings: Finding[] = [];
  if (!snap.title) findings.push(finding("clarity", "high", "The page has no browser title", "A title helps a visitor identify the page from a tab or a shared link.", "No <title> text was found in the rendered page.", "Write a short, specific title that says what the page offers and who it helps."));
  if (!snap.h1) findings.push(finding("clarity", "high", "The page has no main headline", "A clear headline helps a new visitor understand the offer quickly.", "No visible H1 was found in the rendered page.", "Add one visible H1 that states the offer in language a first-time visitor would use."));
  else if (snap.h1.length < 18 || /welcome|home page|coming soon/i.test(snap.h1)) findings.push(finding("clarity", "medium", "The headline may need more specificity", "A visitor should be able to tell what the product does from the headline alone.", `Rendered H1: “${snap.h1.slice(0, 180)}”`, "Make the headline name the outcome or concrete job the product helps with."));
  const visibleCtas = snap.ctas.filter((cta) => cta.visible && cta.top + cta.height <= 900 && cta.text.length > 1);
  if (!visibleCtas.length) findings.push(finding("conversion", "high", "No clear first-screen action was detected", "A new visitor may not know what to do next if the primary action is absent or hard to see.", "No visible, labeled link or button was found completely within the first desktop viewport.", "Add one prominent, labeled primary action in the hero and keep competing actions secondary."));
  else if (visibleCtas.length > 8) findings.push(finding("conversion", "medium", "Many actions compete above the fold", "Several equally prominent choices can make the next step less obvious.", `${visibleCtas.length} visible, labeled actions were detected in the first desktop viewport.`, "Choose one primary action for the hero and move secondary links below the main decision."));
  if (!snap.description) findings.push(finding("technical", "medium", "The page has no meta description", "Search and social previews may need to infer a description from the page text.", "No meta name=description value was found.", "Add a concise description of the offer and intended audience."));
  if (!snap.viewport) findings.push(finding("technical", "high", "The page has no viewport setting", "Without a viewport declaration, mobile browsers may render a desktop-sized page.", "No viewport meta tag was found.", 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
  if (!snap.lang) findings.push(finding("technical", "medium", "The page does not declare its language", "Assistive technology and browsers use the document language to read and interpret text.", "The root HTML element has no lang attribute.", 'Set the document language, for example <html lang="en"> when English is the page language.'));
  if (snap.imageCount > 0 && snap.imageAltCount < snap.imageCount) findings.push(finding("technical", "medium", "Some images have no descriptive alt text", "Screen reader users can miss information carried by images without alt text.", `${snap.imageCount - snap.imageAltCount} of ${snap.imageCount} rendered images have no non-empty alt attribute.`, "Add concise alt text to informative images; use empty alt text for decorative images."));
  if (mobileSnap.bodyWidth > mobileSnap.viewportWidth + 2) findings.push(finding("conversion", "medium", "The mobile page overflows horizontally", "Content wider than the screen can hide information and make the page harder to navigate.", `Rendered body width ${mobileSnap.bodyWidth}px; viewport ${mobileSnap.viewportWidth}px.`, "Find the element extending beyond the viewport and make it responsive at a 390px screen width."));
  const mobileCta = mobileSnap.ctas.find((cta) => cta.visible && cta.top + cta.height <= 844 && cta.text.length > 1);
  if (!mobileCta) findings.push(finding("conversion", "medium", "No action is visible in the first mobile screen", "Mobile visitors should be able to find a next step without searching through the page.", "No visible labeled link or button appeared completely within the first 844px of the mobile capture.", "Make the main action visible in the mobile hero without requiring an initial scroll."));
  else if (Math.min(mobileCta.width, mobileCta.height) < 44) findings.push(finding("conversion", "low", "The first mobile action has a small tap target", "Small controls can be harder to activate accurately on a touch screen.", `The first visible mobile action measures ${Math.round(mobileCta.width)} × ${Math.round(mobileCta.height)}px; the target is at least 44 × 44px.`, "Increase the primary action's touch area to at least 44 × 44px without crowding nearby controls."));
  if (snap.deadButtons) findings.push(finding("conversion", "medium", "A placeholder link or disabled action was found", "A control that does not advance the visitor can interrupt their path through the page.", `${snap.deadButtons} placeholder (#) links or disabled buttons were detected.`, "Connect these controls to their intended destination or remove them until they work."));
  if (snap.placeholders.length) findings.push(finding("clarity", "high", "Placeholder copy remains on the page", "Template copy can make the offer feel unfinished and leave visitors unsure what is real.", `Matched page text: “${snap.placeholders[0]}”`, "Replace template text with copy specific to this product and its audience."));
  if (!snap.hasProof) findings.push(finding("trust", "low", "No recognizable proof signal was detected", "A first-time visitor may look for a reason to trust a product before taking the next step.", "The rendered text and image descriptions did not include common review, customer story, or logo language.", "If you have real customer proof, add a concise quotation, case study, or customer logo with permission."));
  if (!snap.hasPricing) findings.push(finding("trust", "low", "Pricing details were not detected", "Visitors may hesitate when cost, plans, or a free option are difficult to find.", "No currency amount, pricing section, free plan, or free trial language was detected in rendered page text.", "If the product is paid, show the starting price and what it includes; if not, explain the free path."));
  if (!snap.hasFaq) findings.push(finding("trust", "low", "No FAQ or objection handling was detected", "Brief answers can resolve common uncertainties before a visitor commits.", "No FAQ heading, common questions heading, or details element was detected.", "Answer the questions that matter before signup, such as setup time, compatibility, or cancellation."));
  if (!snap.hasContact) findings.push(finding("trust", "low", "No contact or support path was detected", "A visible contact path can reassure visitors who need help before or after signing up.", "No email, contact, or support link was detected in rendered links.", "Add a working contact or support route appropriate to the product."));
  if (linkResult.broken.length) findings.push(finding("technical", linkResult.broken.length > 5 ? "high" : "medium", "Some same-site links returned an HTTP error", "Broken links can stop visitors before they reach important information or a signup flow.", `${linkResult.broken.length} of ${linkResult.checked} checked same-site links returned HTTP 400 or higher. ${linkResult.unknownCount} additional checks could not be completed.`, `Review these links: ${linkResult.broken.slice(0, 5).map((u) => { try { return new URL(u).pathname; } catch { return u; } }).join(", ")}.`));
  if (input.status >= 400) findings.push(finding("technical", "critical", "The page returned an HTTP error", "Visitors and crawlers may be unable to open the launch page reliably.", `The requested page returned HTTP ${input.status}.`, "Check the host and route configuration and confirm the public page returns a successful response."));
  if (input.protocol !== "https:") findings.push(finding("technical", "medium", "The page does not use HTTPS", "A secure connection protects information exchanged with the site and is expected by modern browsers.", `The final page URL uses ${input.protocol.replace(":", "")} rather than HTTPS.`, "Serve the page over HTTPS and redirect its HTTP URL to the secure version."));
  if (input.ogImageTooSmall) findings.push(finding("technical", "low", "The social preview image is smaller than 1200 × 630px", "Some social platforms may display a small preview less clearly when its image is below common share-card dimensions.", `The declared Open Graph image is ${input.ogImage.value}.`, "Export a clear social preview image at 1200 × 630px or larger while keeping the same aspect ratio."));
  return findings;
}

function stackHints(html: string) {
  const tests: Array<[string, RegExp]> = [["Next.js", /__next|_next\/static/i], ["Vite", /\bvite\b/i], ["Framer", /framerusercontent|data-framer/i], ["Webflow", /webflow\.com|w-mod-/i], ["Lovable", /lovable/i], ["Shopify", /cdn\.shopify\.com|shopify-section/i], ["WordPress", /wp-content|wp-includes/i]];
  return tests.filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
}

async function pageCapture(context: BrowserContext, url: string, mobile: boolean, requestCounter: { count: number; bytes: number; active: number; waiting: Array<() => void> }) {
  await context.route("**/*", async (route) => {
    const request = route.request(); const target = request.url();
    if (["data:", "blob:", "about:"].some((prefix) => target.startsWith(prefix))) return route.continue();
    if (request.method() !== "GET" || requestCounter.count >= 120 || requestCounter.bytes >= 16_000_000) return route.abort("blockedbyclient");
    requestCounter.count++;
    if (requestCounter.active >= 6) await new Promise<void>((resolve) => requestCounter.waiting.push(resolve));
    requestCounter.active++;
    try {
      await assertRobotsAllows(new URL(target));
      const response = await safeFetch(target, { timeoutMs: 5_000, maxBytes: 1_500_000, maxRedirects: 3, beforeRedirect: assertRobotsAllows });
      if (response.redirects.length) return route.fulfill({ status: 302, headers: { location: response.redirects[0] } });
      if (requestCounter.bytes + response.body.length > 16_000_000) return route.abort("blockedbyclient");
      requestCounter.bytes += response.body.length;
      const headers: Record<string, string> = {};
      for (const key of ["content-type", "cache-control", "last-modified", "etag"]) { const value = response.headers[key]; if (typeof value === "string") headers[key] = value; }
      return route.fulfill({ status: response.status, headers, body: response.body });
    } catch { return route.abort("blockedbyclient"); }
    finally { requestCounter.active--; requestCounter.waiting.shift()?.(); }
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: mobile ? 25_000 : 20_000 });
    if (!response || response.status() >= 500) throw new SafeFetchError(`The page returned HTTP ${response?.status() ?? "no response"}.`);
    await page.waitForTimeout(800);
    const screenshot = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false, timeout: 8000 });
    return { responseStatus: response.status(), currentUrl: page.url(), snapshot: await pageSnapshot(page), screenshot: asDataUrl(screenshot) };
  } finally { await page.close(); await context.unrouteAll({ behavior: "ignoreErrors" }); }
}

export function summarizeLinkStatuses(statuses: Array<number | undefined>) {
  return { checked: statuses.filter((status): status is number => status !== undefined).length, brokenCount: statuses.filter((status) => status !== undefined && status >= 400).length, unknownCount: statuses.filter((status) => status === undefined).length };
}

async function checkStatus(urls: string[]) {
  const unique = [...new Set(urls)].slice(0, 50); const results: Array<{ url: string; status?: number }> = [];
  for (let i = 0; i < unique.length; i += 8) {
    const batch = unique.slice(i, i + 8);
    const completed = await Promise.all(batch.map(async (url) => {
      try { const target = normalizePublicUrl(url); await assertRobotsAllows(target); const result = await safeFetch(url, { timeoutMs: 3000, maxRedirects: 3, beforeRedirect: assertRobotsAllows, statusOnly: true }); return { url, status: result.status }; }
      catch { return { url, status: undefined }; }
    }));
    results.push(...completed);
  }
  const summary = summarizeLinkStatuses(results.map((item) => item.status));
  return { unique, checked: summary.checked, broken: results.filter((item) => item.status !== undefined && item.status >= 400).map((item) => item.url), unknownCount: summary.unknownCount };
}

async function psiMetrics(url: string, strategy: "mobile" | "desktop") {
  if (!process.env.PAGESPEED_API_KEY) return { state: "unknown" as const, note: "PageSpeed Insights is not configured." };
  try {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url); endpoint.searchParams.set("strategy", strategy); endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);
    const signal = currentScanSignal();
    const res = await fetch(endpoint, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(16_000)]) : AbortSignal.timeout(16_000), cache: "no-store" });
    if (!res.ok) return { state: "unknown" as const, note: `PageSpeed Insights returned HTTP ${res.status}.` };
    const data = await res.json() as { lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, { numericValue?: number; displayValue?: string }> } };
    const audits = data.lighthouseResult?.audits ?? {};
    return { state: "checked" as const, performance: data.lighthouseResult?.categories?.performance?.score != null ? Math.round(data.lighthouseResult.categories.performance.score * 100) : undefined,
      lcp: audits["largest-contentful-paint"]?.displayValue, cls: audits["cumulative-layout-shift"]?.displayValue, inp: audits["interaction-to-next-paint"]?.displayValue ?? audits["total-blocking-time"]?.displayValue };
  } catch { return { state: "unknown" as const, note: "PageSpeed Insights could not be reached." }; }
}

async function processScanCore(id: string, leaseToken?: string) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const scan = await readScan(id); if (!scan || scan.status === "complete") return;
    const target = normalizePublicUrl(scan.url);
    await phase(id, "Checking scan permissions…", leaseToken);
    const policy = await inspectRobots(target);
    if (policy.robots.state === "unknown") throw new SafeFetchError("Could not confirm the page’s robots.txt rules, so the scan stopped safely. Try again later.");
    if (policy.blocked) throw new UnsafeTargetError("This page is disallowed by its robots.txt file.");
    await phase(id, "Rendering the desktop page…", leaseToken);
    const initial = await safeFetch(target.toString(), { timeoutMs: 10_000, maxBytes: 5_000_000, maxRedirects: 4, beforeRedirect: assertRobotsAllows });
    const finalUrl = normalizePublicUrl(initial.finalUrl);
    await assertRobotsAllows(finalUrl);
    const html = initial.body.toString("utf8");
    const contentHash = createHash("sha256").update(html).digest("hex");
    const cacheKey = createHash("sha256").update(`${target.toString()}\n${contentHash}`).digest("hex");
    const cached = await findCachedScan(target.toString(), cacheKey);
    if (cached) {
      const current = await readScan(id); if (current) await saveScan({ ...cached, id, url: target.toString(), status: "complete", phase: "Report ready · reused a scan from the last 24 hours", createdAt: current.createdAt, updatedAt: now(), paid: false, leadEmail: undefined }, leaseToken);
      return;
    }
    const signal = currentScanSignal();
    const launching = chromium.launch(await browserLaunchOptions());
    if (signal) void launching.then((lateBrowser) => { if (signal.aborted) return lateBrowser.close(); }).catch(() => undefined);
    const browser = await (signal ? Promise.race([
      launching,
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new SafeFetchError("The scan exceeded its 90-second time limit.")), { once: true })),
    ]) : launching);
    if (signal?.aborted) { await browser.close(); throw new SafeFetchError("The scan exceeded its 90-second time limit."); }
    const closeBrowser = () => { void browser.close().catch(() => undefined); };
    signal?.addEventListener("abort", closeBrowser, { once: true });
    let desktop; let mobile;
    try {
      const counter = { count: 0, bytes: 0, active: 0, waiting: [] as Array<() => void> };
      const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: false, serviceWorkers: "block" });
      await desktopContext.routeWebSocket("**/*", (socket) => socket.close({ code: 1008, reason: "WebSockets are disabled during scanning." }));
      desktop = await pageCapture(desktopContext, finalUrl.toString(), false, counter); await desktopContext.close();
      await phase(id, "Rendering the mobile page…", leaseToken);
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ignoreHTTPSErrors: false, serviceWorkers: "block" });
      await mobileContext.routeWebSocket("**/*", (socket) => socket.close({ code: 1008, reason: "WebSockets are disabled during scanning." }));
      mobile = await pageCapture(mobileContext, finalUrl.toString(), true, counter); await mobileContext.close();
    } finally { signal?.removeEventListener("abort", closeBrowser); await browser.close(); }
    if (signal?.aborted) throw new SafeFetchError("The scan exceeded its 90-second time limit. Please try again later.");
    const snap = desktop.snapshot; const mobileSnap = mobile.snapshot;
    const pageUrl = new URL(finalUrl); const origin = pageUrl.origin;
    await phase(id, "Checking links and page signals…", leaseToken);
    const sameOriginLinks = snap.links.filter((href: string) => { try { return new URL(href).origin === origin && new URL(href).pathname !== pageUrl.pathname; } catch { return false; } }).slice(0, 50);
    const linkResult = await checkStatus(sameOriginLinks);
    const robots = policy.robots;
    let sitemap: MetricCheck;
    try { const sitemapUrl = new URL("/sitemap.xml", origin); await assertRobotsAllows(sitemapUrl); const res = await safeFetch(sitemapUrl.toString(), { timeoutMs: 3500, maxBytes: 500_000, maxRedirects: 2, beforeRedirect: assertRobotsAllows }); sitemap = { state: "checked", value: res.status }; } catch { sitemap = unknown("Could not check sitemap.xml."); }
    let ogImage: MetricCheck = unknown("No Open Graph image was declared.");
    let ogImageTooSmall = false;
    if (snap.ogImage) {
      try { const imageUrl = new URL(snap.ogImage, finalUrl).toString(); await assertRobotsAllows(new URL(imageUrl)); const image = await safeFetch(imageUrl, { timeoutMs: 5000, maxBytes: 5_000_000, maxRedirects: 3, beforeRedirect: assertRobotsAllows }); const mime = String(image.headers["content-type"] ?? ""); const dimensions = mime.startsWith("image/") ? imageSize(image.body) : undefined; if (dimensions) ogImageTooSmall = dimensions.width < 1200 || dimensions.height < 630; ogImage = image.status >= 200 && image.status < 300 && dimensions ? { state: "checked", value: `${dimensions.width} × ${dimensions.height}px · ${image.body.length} bytes` } : { state: "checked", value: `Invalid image response · HTTP ${image.status}` }; } catch { ogImage = { state: "checked", value: "Image could not be fetched or decoded safely" }; }
    }
    const [psi, psiDesktop] = await Promise.all([psiMetrics(finalUrl.toString(), "mobile"), psiMetrics(finalUrl.toString(), "desktop")]);
    const findings = deterministicFindings({ page: snap, mobile: mobileSnap, links: linkResult, status: initial.status, protocol: finalUrl.protocol, ogImage, ogImageTooSmall });
    const checkResults: Record<string, MetricCheck> = {
      status: { state: "checked", value: initial.status }, redirects: { state: "checked", value: initial.redirects.length }, https: { state: "checked", value: finalUrl.protocol === "https:" ? "Secure" : "Not secure" },
      title: snap.title ? { state: "checked", value: snap.title } : { state: "checked", value: "Missing" }, description: snap.description ? { state: "checked", value: snap.description } : { state: "checked", value: "Missing" },
      ogTitle: snap.ogTitle ? { state: "checked", value: snap.ogTitle } : unknown("No Open Graph title was declared."), ogDescription: snap.ogDescription ? { state: "checked", value: snap.ogDescription } : unknown("No Open Graph description was declared."), ogImage, favicon: snap.favicon ? { state: "checked", value: snap.favicon } : unknown("No favicon was declared."), appleTouchIcon: snap.appleTouchIcon ? { state: "checked", value: snap.appleTouchIcon } : unknown("No Apple touch icon was declared."), canonical: snap.canonical ? { state: "checked", value: snap.canonical } : unknown("No canonical URL was declared."), robots, sitemap,
      imageAltCoverage: snap.imageCount ? { state: "checked", value: `${snap.imageAltCount}/${snap.imageCount}` } : unknown("No page images were detected."), sameOriginLinks: { state: "checked", value: `${linkResult.checked} checked · ${linkResult.broken.length} HTTP errors · ${linkResult.unknownCount} couldn't check` },
      proofSignals: { state: "checked", value: snap.hasProof ? "Detected" : "Not detected by text and image-label checks" }, pricing: { state: "checked", value: snap.hasPricing ? "Detected" : "Not detected in page text" }, faq: { state: "checked", value: snap.hasFaq ? "Detected" : "Not detected" }, contact: { state: "checked", value: snap.hasContact ? "Detected" : "Not detected" },
      mobileOverflow: { state: "checked", value: mobileSnap.bodyWidth > mobileSnap.viewportWidth + 2 ? `${mobileSnap.bodyWidth}px wide` : "None detected" },
      pageSpeedMobile: psi.state === "checked" ? { state: "checked", value: psi.performance ?? "Unavailable" } : unknown(psi.note),
      pageSpeedDesktop: psiDesktop.state === "checked" ? { state: "checked", value: psiDesktop.performance ?? "Unavailable" } : unknown(psiDesktop.note),
      lcp: psi.state === "checked" && psi.lcp ? { state: "checked", value: psi.lcp } : unknown(psi.state === "checked" ? "No LCP value was returned." : psi.note),
      cls: psi.state === "checked" && psi.cls ? { state: "checked", value: psi.cls } : unknown(psi.state === "checked" ? "No CLS value was returned." : psi.note),
      inpMobile: psi.state === "checked" && psi.inp ? { state: "checked", value: psi.inp } : unknown(psi.state === "checked" ? "No INP/TBT value was returned." : psi.note),
      lcpDesktop: psiDesktop.state === "checked" && psiDesktop.lcp ? { state: "checked", value: psiDesktop.lcp } : unknown(psiDesktop.state === "checked" ? "No LCP value was returned." : psiDesktop.note),
      clsDesktop: psiDesktop.state === "checked" && psiDesktop.cls ? { state: "checked", value: psiDesktop.cls } : unknown(psiDesktop.state === "checked" ? "No CLS value was returned." : psiDesktop.note),
      inpDesktop: psiDesktop.state === "checked" && psiDesktop.inp ? { state: "checked", value: psiDesktop.inp } : unknown(psiDesktop.state === "checked" ? "No INP/TBT value was returned." : psiDesktop.note),
    };
    const current = await readScan(id); if (!current) return;
    await phase(id, "Preparing the evidence-led report…", leaseToken);
    const contentReview = await reviewContent({ title: snap.title, description: snap.description, pageText: snap.text, findings, desktopImage: desktop.screenshot, mobileImage: mobile.screenshot });
    const allFindings = [...findings, ...contentReview.findings.filter((item) => !findings.some((known) => known.id === item.id))];
    const copyDrafts = contentReview.copyDrafts;
    const ranked = rankFindings(allFindings);
    const categoryCoverage = { clarity: contentReview.findings.length ? 1 : 0.6, conversion: contentReview.findings.length ? 1 : 0.85, trust: 1, technical: psi.state === "checked" ? 1 : 0.9 } as const;
    const scored = scoreFindings(ranked, categoryCoverage);
    const prompts = promptVariants({ url: finalUrl.toString(), title: snap.title, stack: stackHints(html), findings: ranked, copyDrafts });
    const paidPayload = { available: copyDrafts.headlines.length === 3, findings: ranked, prompts, copyDrafts };
    await saveScan({ ...current, status: "complete", phase: "Report ready", updatedAt: now(), score: scored.score, categoryScores: scored.categoryScores, findings: ranked,
      checks: checkResults, categoryCoverage, desktopImage: desktop.screenshot, mobileImage: mobile.screenshot, domain: pageUrl.hostname, title: snap.title, description: snap.description, finalUrl: finalUrl.toString(), redirects: initial.redirects,
      stackHints: stackHints(html), contentReview: contentReview.status, paidPayload, cacheKey }, leaseToken);
  } catch (error) {
    const message = error instanceof UnsafeTargetError || error instanceof SafeFetchError ? error.message : "The page could not be scanned. It may be unavailable or taking too long to respond.";
    if (!(error instanceof UnsafeTargetError) && !(error instanceof SafeFetchError)) {
      const diagnostic = error instanceof Error ? error as Error & { code?: string } : undefined;
      console.error("Launch Score scan failed", { scanId: id, errorName: diagnostic?.name ?? "UnknownError", errorCode: diagnostic?.code });
    }
    await updateScan(id, (scan) => ({ ...scan, status: "failed", phase: "Scan could not be completed", error: message, updatedAt: now() }), leaseToken);
  } finally { running.delete(id); }
}

export async function createScan(url: string): Promise<ScanRecord> {
  const target = normalizePublicUrl(url);
  const id = randomUUID(); const timestamp = now();
  const record: ScanRecord = { id, url: target.toString(), status: "queued", phase: "In the scan queue…", createdAt: timestamp, updatedAt: timestamp, paid: false };
  await saveScan(record);
  if (process.env.NODE_ENV !== "production") void processScan(id);
  return record;
}

export async function processScan(id: string, leaseToken?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_WALL_LIMIT_MS);
  try { return await withScanSignal(controller.signal, () => processScanCore(id, leaseToken)); }
  finally { clearTimeout(timer); }
}
