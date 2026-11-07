import { randomUUID } from "node:crypto";
import { chromium, type BrowserContext, type Page } from "playwright";
import { imageSize } from "image-size";
import { safeFetch, normalizePublicUrl, SafeFetchError, UnsafeTargetError, currentScanSignal, withScanSignal } from "./ssrf";
import { makeFinding, rankFindings, scoreFindings, SEVERITY_PENALTY } from "./score";
import { findCachedScan, readScan, saveScan, updateScan } from "./store";
import type { Category, Finding, MetricCheck, ScanRecord, ScoreBreakdown } from "./types";
import { CATEGORY_WEIGHTS } from "../config/scoring";
import { reviewContent } from "./content-review";
import { reviewDesign } from "./design-review";
import { auditDesignSignals } from "./design-audit";
import { promptVariants } from "./fix-prompts";
import { browserLaunchOptions } from "./browser-isolation";
import { ScanRequestBudget, withRequestBudget, currentRequestBudget } from "./request-budget";
import { detectFrontendSecrets, extractSameOriginApiRoutes, formFindings, inspectExposedFiles, leftoverFindings, securityFindings, seoFindings, type ScriptSource } from "./depth-checks";
import { calculateAuditCounts } from "./audit-counts";
import { releaseFreeScanReservation, reserveFreeScan, settleScanCost } from "./free-tier";

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
export function scanFailureMessage(error: unknown) {
  if (error instanceof UnsafeTargetError) return error.message;
  const detail = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" ? String((error as { code?: unknown }).code ?? "") : "";
  if (/bot protection|automated review|HTTP (401|403|429)/i.test(detail)) return "This site is blocking automated review. Try again later or check whether its bot protection allows public scans.";
  if (/timeout|timed out|took too long|deadline|exceeded its time limit/i.test(detail) || /ETIMEDOUT|ESOCKETTIMEDOUT/i.test(code)) return "This page took too long to respond. Check that it is online and try again.";
  if (/HTTP 404|not found/i.test(detail)) return "This page could not be found. Check the URL and try again.";
  if (/robots\.txt|disallow/i.test(detail)) return "This site does not allow this scan in its public robots.txt rules.";
  if (/not an HTML page|HTML document|HTML page/i.test(detail)) return "This URL does not return a reviewable HTML page. Try a public webpage instead.";
  if (/could not be fetched|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|network/i.test(`${detail} ${code}`)) return "This page could not be reached. Check the URL and try again.";
  return "This page could not be scanned. Check the URL and try again.";
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
export async function assertRobotsAllows(url: URL) {
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
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((element) => ({ level: Number(element.tagName.slice(1)), text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180) }));
    const headingOrderProblems: string[] = [];
    for (let index = 1; index < headings.length; index++) if (headings[index].level > headings[index - 1].level + 1) headingOrderProblems.push(`${headings[index - 1].text.slice(0, 50)} → ${headings[index].text.slice(0, 50)} skips a heading level`);
    const forms = [...document.forms].map((form) => {
      const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type=hidden]),textarea,select")];
      const emailInputs = fields.filter((field) => /email/i.test(`${field.getAttribute("name") || ""} ${field.getAttribute("placeholder") || ""} ${field.getAttribute("aria-label") || ""}`));
      return { action: form.getAttribute("action")?.trim() ?? "", method: (form.getAttribute("method") || "get").toLowerCase(), fields: fields.length,
        unlabeledFields: fields.filter((field) => !field.labels?.length && !field.getAttribute("aria-label") && !field.getAttribute("aria-labelledby")).length,
        emailInputs: emailInputs.length, invalidEmailInputs: emailInputs.filter((field) => field.type !== "email").length,
        handlerVisible: Boolean(form.getAttribute("onsubmit") || form.getAttribute("action")) };
    });
    const primaryCtas = controls.map((element) => ({ text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120), href: element instanceof HTMLAnchorElement ? element.href : "", visible: visible(element) }))
      .filter((item) => item.visible && /\b(start|try|sign ?up|join|book|buy|contact|download|request|subscribe|create|get|launch|demo|apply|continue|submit)\b/i.test(item.text)).slice(0, 12);
    const structuredData = [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => {
      try { JSON.parse(script.textContent || ""); return true; } catch { return false; }
    });
    const hreflang = [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((link) => ({ lang: link.hreflang.trim(), href: link.href, valid: /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(link.hreflang.trim()) }));
    const resourceUrls = [...document.querySelectorAll<HTMLScriptElement | HTMLImageElement | HTMLIFrameElement | HTMLSourceElement | HTMLLinkElement>("script[src],img[src],iframe[src],source[src],link[href]")].map((el) => (el.tagName === "LINK" ? (el as HTMLLinkElement).href : (el as HTMLScriptElement).src)).filter(Boolean);
    const mixedContent = resourceUrls.filter((resource) => resource.startsWith("http://")).slice(0, 30);
    const testimonialBlocks = [...document.querySelectorAll("blockquote,[class*=testimonial i],[data-testid*=testimonial i]")].map((el) => (el.textContent || "").trim().replace(/\s+/g, " ")).filter((text) => /john doe|jane doe|your name|customer name|insert (?:a )?quote|amazing product!?|best product ever/i.test(text));
    const allVisualElements = [...document.querySelectorAll("body *")].filter(visible);
    const visualStride = Math.max(1, Math.ceil(allVisualElements.length / 1200));
    const visualElements = allVisualElements.filter((_, index) => index % visualStride === 0).slice(0, 1200);
    const sampleElements = visualElements.filter((element) => /^(H[1-6]|P|A|BUTTON|LABEL|LI|IMG|SVG)$/.test(element.tagName) && ((element.textContent || "").trim() || (element.tagName === "IMG" && (element.getAttribute("alt") || "").trim())));
    const sampleStride = Math.max(1, Math.ceil(sampleElements.length / 260));
    const visualSamples = sampleElements.filter((_, index) => index % sampleStride === 0).slice(0, 260).map((element) => {
      const style = getComputedStyle(element);
      let ancestor: Element | null = element; let background = "rgb(0, 0, 0)";
      while (ancestor) { const candidate = getComputedStyle(ancestor).backgroundColor; if (candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") { background = candidate; break; } ancestor = ancestor.parentElement; }
      const section = element.closest("section,main,header,footer,article") as HTMLElement | null;
      const sectionName = section?.querySelector("h1,h2,h3")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) || section?.getAttribute("aria-label") || section?.id || "Whole page";
      return { section: sectionName, tag: element.tagName, text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100), fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize) || 0, lineHeight: style.lineHeight, fontWeight: style.fontWeight, color: style.color, background, spacing: `${style.marginTop} ${style.marginBottom} ${style.paddingTop} ${style.paddingBottom} ${style.gap}`, backgroundImage: style.backgroundImage, classes: typeof element.className === "string" ? element.className.slice(0, 100) : "", alt: element.tagName === "IMG" ? element.getAttribute("alt") || "" : element.querySelector("img")?.getAttribute("alt") || "" };
    });
    const fontFamilies = [...new Set(visualElements.map((element) => getComputedStyle(element).fontFamily.split(",")[0].replace(/["']/g, "").trim()).filter(Boolean))].slice(0, 40);
    const colors = [...new Set(visualElements.flatMap((element) => { const style = getComputedStyle(element); return [style.color, style.backgroundColor, style.borderColor]; }).filter((color) => color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent"))].slice(0, 100);
    const spacingValues = [...new Set(visualElements.flatMap((element) => { const style = getComputedStyle(element); return [style.marginTop, style.marginBottom, style.paddingTop, style.paddingBottom, style.gap]; }).filter((value) => value && value !== "0px" && value !== "normal"))].slice(0, 100);
    const visualSignals = { fontFamilies, colors, spacingValues, sectionNames: [...new Set(visualSamples.map((sample) => sample.section))].slice(0, 30), samples: visualSamples.map((sample) => ({ ...sample, device: innerWidth <= 500 ? "Mobile" as const : "Desktop" as const })) };
    const visualAnchors = [...document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,button,a,[role=button],label,li")].filter(visible).slice(0, 500).map((element) => {
      const rect = element.getBoundingClientRect();
      const section = element.closest("section,main,header,footer,article");
      const sectionName = section?.querySelector("h1,h2,h3")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || section?.getAttribute("aria-label") || "Whole page";
      return { text: (element.textContent || element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 180), section: sectionName, x: rect.left + (typeof window === "undefined" ? 0 : window.scrollX), y: rect.top + (typeof window === "undefined" ? 0 : window.scrollY), width: rect.width, height: rect.height };
    }).filter((anchor) => anchor.text.length > 0 && anchor.width > 0 && anchor.height > 0);
    const scriptUrls = [...document.scripts].map((script) => script.src).filter(Boolean).slice(0, 8);
    const placeholderLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#"]')].length;
    const metaRobots = meta("robots") || meta("googlebot");
    return {
      title: document.title.trim(), description: meta("description"), ogTitle: og("title"), ogDescription: og("description"), ogImage: og("image"),
      metaRobots, twitterCard: meta("twitter:card"), twitterTitle: meta("twitter:title"), twitterDescription: meta("twitter:description"),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? "",
      favicon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? "",
      appleTouchIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ?? "",
      lang: html.lang, viewport: meta("viewport"), h1: h1?.textContent?.trim().replace(/\s+/g, " ") ?? "", h1Visible: h1 ? visible(h1) : false,
      text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 18_000), aboveFoldText: [...document.body.querySelectorAll("h1,h2,p,a,button")].filter(visible).filter((e) => e.getBoundingClientRect().top < innerHeight).map((e) => (e.textContent || "").trim()).join(" ").slice(0, 3500),
      ctas, links: anchors.map((a) => a.href).filter(Boolean).slice(0, 50), imageCount: images.length, imageAltCount: images.filter((i) => i.hasAttribute("alt") && i.alt.trim().length > 0).length,
      h1Count: document.querySelectorAll("h1").length, headings, headingOrderProblems, hreflang, jsonLd: { total: structuredData.length, valid: structuredData.filter(Boolean).length, invalid: structuredData.filter((value) => !value).length },
      forms, primaryCtas, scriptUrls, imageUrls: images.map((image) => image.currentSrc || image.src).filter(Boolean).slice(0, 80), mixedContent,
      placeholderLinks, testimonialBlocks,
      bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth, heroHeight: h1?.getBoundingClientRect().height ?? 0,
      h1FontSize: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      deadButtons: placeholderLinks + [...document.querySelectorAll("button:disabled")].length,
      hasFaq: [...document.querySelectorAll("h1,h2,h3,summary")].some((e) => /frequently asked|\bfaq\b|common questions/i.test(e.textContent || "")) || document.querySelectorAll("details").length > 0,
      hasPricing: /\$\s?\d|pricing|plans and pricing|free plan|free trial/i.test(document.body.innerText || ""),
      hasProof: /testimonials?|customer stories|case studies|trusted by|reviews?|\b\d[,.]?\d*% of (users|customers|teams)/i.test(document.body.innerText || "") || [...document.images].some((i) => /logo/i.test(i.alt)),
      hasContact: [...document.querySelectorAll("a[href]")].some((a) => /mailto:|contact|support/i.test(`${a.getAttribute("href") || ""} ${a.textContent || ""}`)),
      placeholders: (document.body.innerText.match(/lorem ipsum|your company|insert .* here|placeholder text/gi) ?? []).slice(0, 5),
      html: document.documentElement.outerHTML.slice(0, 1_000_000), visualSignals, visualAnchors,
    };
  });
}

type VisualAnchor = { text: string; section: string; x: number; y: number; width: number; height: number };
type CapturePoint = { x: number; y: number; segmentIndex?: number };
type SegmentInfo = { top: number; width: number; height: number };
function findingCapturePoint(item: Finding, anchors: VisualAnchor[] | undefined, size: { width: number; height: number } | undefined, segments: SegmentInfo[] | undefined): CapturePoint | undefined {
  if (!anchors?.length || ((!size?.width || !size.height) && !segments?.length)) return undefined;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const evidence = normalize(item.evidence);
  const titleWords = normalize(item.title).split(/\s+/).filter((word) => word.length > 3);
  const evidenceWords = evidence.split(/\s+/).filter((word) => word.length > 4 && !["found", "there", "which", "their", "this", "that", "with", "from", "page", "rendered"].includes(word));
  const aliases: Record<string, string[]> = { design: ["design", "brand", "visual", "type"], security: ["security", "https", "headers"], seo: ["seo", "search", "metadata"], leftovers: ["placeholder", "template", "coming soon"], forms: ["form", "cta", "contact", "signup"], technical: ["technical", "lighthouse", "performance"] };
  let best: { anchor: VisualAnchor; score: number } | undefined;
  for (const anchor of anchors) {
    const text = normalize(anchor.text); const section = normalize(anchor.section);
    const exact = evidence.length > 10 && text.includes(evidence.slice(0, 48)) ? 16 : 0;
    const evidenceHits = evidenceWords.filter((word) => text.includes(word)).length;
    const titleHits = titleWords.filter((word) => text.includes(word)).length;
    const sectionHit = (aliases[item.section ?? ""] ?? []).some((word) => section.includes(word)) ? 2 : 0;
    const score = exact + evidenceHits * 3 + titleHits * 2 + sectionHit;
    if (!best || score > best.score) best = { anchor, score };
  }
  if (!best) return undefined;
  const { anchor } = best;
  const centerX = anchor.x + anchor.width / 2; const centerY = anchor.y + anchor.height / 2;
  if (size?.width && size.height) return { x: Math.max(0, Math.min(1, centerX / size.width)), y: Math.max(0, Math.min(1, centerY / size.height)) };
  const segmentIndex = segments?.findIndex((segment) => centerY >= segment.top && centerY <= segment.top + segment.height) ?? -1;
  const segment = segments?.[segmentIndex];
  return segment ? { x: Math.max(0, Math.min(1, centerX / segment.width)), y: Math.max(0, Math.min(1, (centerY - segment.top) / segment.height)), segmentIndex } : undefined;
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
  if (!snap.viewport) findings.push(finding("technical", "high", "The page has no viewport setting", "Without a viewport declaration, mobile browsers may render a desktop-sized page.", "No viewport meta tag was found.", 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
  if (!snap.lang) findings.push(finding("technical", "medium", "The page does not declare its language", "Assistive technology and browsers use the document language to read and interpret text.", "The root HTML element has no lang attribute.", 'Set the document language, for example <html lang="en"> when English is the page language.'));
  if (mobileSnap.bodyWidth > mobileSnap.viewportWidth + 2) findings.push(finding("conversion", "medium", "The mobile page overflows horizontally", "Content wider than the screen can hide information and make the page harder to navigate.", `Rendered body width ${mobileSnap.bodyWidth}px; viewport ${mobileSnap.viewportWidth}px.`, "Find the element extending beyond the viewport and make it responsive at a 390px screen width."));
  const mobileCta = mobileSnap.ctas.find((cta) => cta.visible && cta.top + cta.height <= 844 && cta.text.length > 1);
  if (!mobileCta) findings.push(finding("conversion", "medium", "No action is visible in the first mobile screen", "Mobile visitors should be able to find a next step without searching through the page.", "No visible labeled link or button appeared completely within the first 844px of the mobile capture.", "Make the main action visible in the mobile hero without requiring an initial scroll."));
  else if (Math.min(mobileCta.width, mobileCta.height) < 44) findings.push(finding("conversion", "low", "The first mobile action has a small tap target", "Small controls can be harder to activate accurately on a touch screen.", `The first visible mobile action measures ${Math.round(mobileCta.width)} × ${Math.round(mobileCta.height)}px; the target is at least 44 × 44px.`, "Increase the primary action's touch area to at least 44 × 44px without crowding nearby controls."));
  if (!snap.hasProof) findings.push(finding("trust", "low", "No recognizable proof signal was detected", "A first-time visitor may look for a reason to trust a product before taking the next step.", "The rendered text and image descriptions did not include common review, customer story, or logo language.", "If you have real customer proof, add a concise quotation, case study, or customer logo with permission."));
  if (!snap.hasPricing) findings.push(finding("trust", "low", "Pricing details were not detected", "Visitors may hesitate when cost, plans, or a free option are difficult to find.", "No currency amount, pricing section, free plan, or free trial language was detected in rendered page text.", "If the product is paid, show the starting price and what it includes; if not, explain the free path."));
  if (!snap.hasFaq) findings.push(finding("trust", "low", "No FAQ or objection handling was detected", "Brief answers can resolve common uncertainties before a visitor commits.", "No FAQ heading, common questions heading, or details element was detected.", "Answer the questions that matter before signup, such as setup time, compatibility, or cancellation."));
  if (!snap.hasContact) findings.push(finding("trust", "low", "No contact or support path was detected", "A visible contact path can reassure visitors who need help before or after signing up.", "No email, contact, or support link was detected in rendered links.", "Add a working contact or support route appropriate to the product."));
  if (linkResult.broken.length) findings.push(finding("technical", linkResult.broken.length > 5 ? "high" : "medium", "Some same-site links returned an HTTP error", "Broken links can stop visitors before they reach important information or a signup flow.", `${linkResult.broken.length} of ${linkResult.checked} checked same-site links returned HTTP 400 or higher. ${linkResult.unknownCount} additional checks could not be completed.`, `Review these links: ${linkResult.broken.slice(0, 5).map((u) => { try { return new URL(u).pathname; } catch { return u; } }).join(", ")}.`));
  if (input.status >= 400) findings.push(finding("technical", "critical", "The page returned an HTTP error", "Visitors and crawlers may be unable to open the launch page reliably.", `The requested page returned HTTP ${input.status}.`, "Check the host and route configuration and confirm the public page returns a successful response."));
  if (input.ogImageTooSmall) findings.push(finding("technical", "low", "The social preview image is smaller than 1200 × 630px", "Some social platforms may display a small preview less clearly when its image is below common share-card dimensions.", `The declared Open Graph image is ${input.ogImage.value}.`, "Export a clear social preview image at 1200 × 630px or larger while keeping the same aspect ratio."));
  return findings;
}

function stackHints(html: string) {
  const tests: Array<[string, RegExp]> = [["Next.js", /__next|_next\/static/i], ["Vite", /\bvite\b/i], ["Framer", /framerusercontent|data-framer/i], ["Webflow", /webflow\.com|w-mod-/i], ["Lovable", /lovable/i], ["Shopify", /cdn\.shopify\.com|shopify-section/i], ["WordPress", /wp-content|wp-includes/i], ["Vercel", /vercel\.app|_vercel/i], ["Netlify", /netlify\.app|netlify/i]];
  return tests.filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
}

async function pageCapture(context: BrowserContext, url: string, mobile: boolean, requestCounter: { count: number; bytes: number; active: number; waiting: Array<() => void>; buckets: Record<"script" | "style" | "image" | "font" | "other", number>; largest: Array<{ url: string; bytes: number; type: string }> }, budget: ScanRequestBudget) {
  await context.route("**/*", async (route) => {
    const request = route.request(); const target = request.url();
    if (["data:", "blob:", "about:"].some((prefix) => target.startsWith(prefix))) return route.continue();
    if (request.method() !== "GET" || requestCounter.count >= 48 || requestCounter.bytes >= 16_000_000 || budget.remaining <= 6) return route.abort("blockedbyclient");
    requestCounter.count++;
    if (requestCounter.active >= 6) await new Promise<void>((resolve) => requestCounter.waiting.push(resolve));
    requestCounter.active++;
    try {
      await assertRobotsAllows(new URL(target));
      const response = await safeFetch(target, { timeoutMs: 5_000, maxBytes: 1_500_000, maxRedirects: 3, beforeRedirect: assertRobotsAllows, budget });
      if (response.redirects.length) return route.fulfill({ status: 302, headers: { location: response.redirects[0] } });
      if (requestCounter.bytes + response.body.length > 16_000_000) return route.abort("blockedbyclient");
      requestCounter.bytes += response.body.length;
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      const kind = /javascript|ecmascript/.test(contentType) ? "script" : /css/.test(contentType) ? "style" : /image\//.test(contentType) ? "image" : /font/.test(contentType) ? "font" : "other";
      requestCounter.buckets[kind] += response.body.length;
      requestCounter.largest.push({ url: target, bytes: response.body.length, type: kind });
      const headers: Record<string, string> = {};
      for (const key of ["content-type", "cache-control", "last-modified", "etag"]) { const value = response.headers[key]; if (typeof value === "string") headers[key] = value; }
      return route.fulfill({ status: response.status, headers, body: response.body });
    } catch { return route.abort("blockedbyclient"); }
    finally { requestCounter.active--; requestCounter.waiting.shift()?.(); }
  });
  const page = await context.newPage();
  let consoleErrors = 0;
  const consoleMessages: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") { consoleErrors += 1; if (consoleMessages.length < 5) consoleMessages.push(String(message.text()).slice(0, 180)); } });
  page.on("pageerror", (error) => { consoleErrors += 1; if (consoleMessages.length < 5) consoleMessages.push(`Uncaught: ${String(error).slice(0, 180)}`); });
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: mobile ? 25_000 : 20_000 });
    if (!response || response.status() >= 500) throw new SafeFetchError(`The page returned HTTP ${response?.status() ?? "no response"}.`);
    if ([401, 403, 429].includes(response.status())) throw new SafeFetchError("This site is blocking automated review. Try again later or check whether its bot protection allows public scans.");
    await page.waitForTimeout(800);
    const screenshot = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false, timeout: 8000 });
    const pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    let fullPageBuffer: Buffer | undefined;
    const screenshotSegments: Array<{ image: string; top: number; width: number; height: number }> = [];
    const viewportSize = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }));
    if (pageHeight <= 14_000) {
      try {
        const step = mobile ? 620 : 760;
        for (let offset = 0; offset < pageHeight; offset += step) { await page.evaluate((top) => window.scrollTo(0, top), offset); await page.waitForTimeout(55); }
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
        fullPageBuffer = await page.screenshot({ type: "jpeg", quality: 48, fullPage: true, animations: "disabled", timeout: 12000 });
      } catch { /* An incomplete full-page capture leaves the vision category unscored. */ }
    } else {
      const segmentCount = Math.min(24, Math.max(2, Math.ceil((pageHeight - viewportSize.height) / (viewportSize.height * 0.85)) + 1));
      const step = Math.max(1, (pageHeight - viewportSize.height) / (segmentCount - 1));
      for (let index = 0; index < segmentCount; index++) {
        const top = Math.round(index * step);
        try {
          await page.evaluate((offset) => window.scrollTo(0, offset), top); await page.waitForTimeout(55);
          const image = await page.screenshot({ type: "jpeg", quality: 46, fullPage: false, animations: "disabled", timeout: 8000 });
          screenshotSegments.push({ image: asDataUrl(image), top, width: viewportSize.width, height: imageSize(image).height });
        } catch { /* Keep other segments if an individual viewport capture fails. */ }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const fullPageSize = fullPageBuffer ? imageSize(fullPageBuffer) : undefined;
    let speed: Record<string, number> = {};
    try {
      speed = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const paints = performance.getEntriesByType("paint") as Array<PerformanceEntry>;
        const res = performance.getEntriesByType("resource") as Array<PerformanceResourceTiming>;
        const thirdParty = new Set(res.map((entry) => { try { return new URL(entry.name).origin; } catch { return ""; } }).filter((entryOrigin) => entryOrigin && entryOrigin !== location.origin));
        const rb = (window as unknown as { __rbSpeed?: { lcp: number; cls: number } }).__rbSpeed;
        return { dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0), load: Math.round(nav?.loadEventEnd ?? 0), fcp: Math.round(paints.find((paint) => paint.name === "first-contentful-paint")?.startTime ?? 0), lcp: Math.round(rb?.lcp ?? 0), cls: Math.round((rb?.cls ?? 0) * 1000) / 1000, resources: res.length, scripts: res.filter((entry) => entry.initiatorType === "script").length, thirdPartyOrigins: thirdParty.size, transferKB: Math.round(res.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0) / 1024) };
      });
    } catch { /* Speed metrics are best-effort. */ }
    return { responseStatus: response.status(), currentUrl: page.url(), snapshot: await pageSnapshot(page), screenshot: asDataUrl(screenshot), fullPageScreenshot: fullPageBuffer ? asDataUrl(fullPageBuffer) : undefined, fullPageSize: fullPageSize ? { width: fullPageSize.width, height: fullPageSize.height } : undefined, screenshotSegments, consoleErrors, consoleMessages, speed };
  } finally { await page.close(); await context.unrouteAll({ behavior: "ignoreErrors" }); }
}

export function summarizeLinkStatuses(statuses: Array<number | undefined>) {
  return { checked: statuses.filter((status): status is number => status !== undefined).length, brokenCount: statuses.filter((status) => status !== undefined && status >= 400).length, unknownCount: statuses.filter((status) => status === undefined).length };
}

async function checkStatus(urls: string[]) {
  const unique = [...new Set(urls)].slice(0, 8); const results: Array<{ url: string; status?: number }> = [];
  for (let i = 0; i < unique.length; i += 8) {
    const batch = unique.slice(i, i + 8);
    const completed = await Promise.all(batch.map(async (url) => {
      try { const target = normalizePublicUrl(url); await assertRobotsAllows(target); const result = await safeFetch(url, { timeoutMs: 3000, maxRedirects: 3, beforeRedirect: assertRobotsAllows, statusOnly: true }); return { url, status: result.status }; }
      catch { return { url, status: undefined }; }
    }));
    results.push(...completed);
  }
  const summary = summarizeLinkStatuses(results.map((item) => item.status));
  return { unique, checked: summary.checked, broken: results.filter((item) => item.status !== undefined && item.status >= 400).map((item) => item.url), unknownCount: summary.unknownCount, statusByUrl: new Map(results.map((item) => [item.url, item.status])) };
}

type PsiStrategy = import("./types").LighthouseStrategy;
const missingPsiStrategy = (note: string): PsiStrategy => ({ performance: unknown(note), accessibility: unknown(note), bestPractices: unknown(note), seo: unknown(note), lcp: unknown(note), cls: unknown(note), inpTbt: unknown(note) });
export async function psiMetrics(url: string, strategy: "mobile" | "desktop") {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    console.warn("PageSpeed Insights is unavailable: PAGESPEED_API_KEY is not configured.");
    return missingPsiStrategy("PageSpeed Insights is unavailable.");
  }
  for (let attempt = 1; attempt <= 2; attempt++) try {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 650));
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url); endpoint.searchParams.set("strategy", strategy); endpoint.searchParams.set("key", apiKey);
    for (const category of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) endpoint.searchParams.append("category", category);
    const response = await safeFetch(endpoint.toString(), { timeoutMs: 16_000, maxBytes: 1_500_000, maxRedirects: 0 });
    if (response.status < 200 || response.status >= 300) {
      let apiMessage = "";
      try { apiMessage = String((JSON.parse(response.body.toString("utf8")) as { error?: { status?: string; message?: string } }).error?.message ?? ""); } catch { /* Keep status as the diagnostic when the provider response is not JSON. */ }
      const detail = apiMessage.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]").replace(/https?:\/\/\S+/gi, "[url]").replace(/AIza[\w-]{20,}/g, "[redacted]").slice(0, 200);
      throw new Error(`HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
    }
    const data = JSON.parse(response.body.toString("utf8")) as { lighthouseResult?: { categories?: Record<string, { score?: number | null }>; audits?: Record<string, { numericValue?: number; displayValue?: string }> } };
    const categories = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};
    const category = (key: string): MetricCheck => categories[key]?.score != null ? { state: "checked", value: Math.round((categories[key].score ?? 0) * 100) } : unknown(`PageSpeed Insights did not return the ${key} score for ${strategy}.`);
    const audit = (keys: string[]): MetricCheck => {
      const match = keys.map((key) => audits[key]).find((value) => value && (value.displayValue || value.numericValue !== undefined));
      if (!match) return unknown("PageSpeed Insights did not return this metric.");
      return { state: "checked", value: match.displayValue ?? match.numericValue ?? "Checked" };
    };
    return { performance: category("performance"), accessibility: category("accessibility"), bestPractices: category("best-practices"), seo: category("seo"),
      lcp: audit(["largest-contentful-paint"]), cls: audit(["cumulative-layout-shift"]), inpTbt: audit(["interaction-to-next-paint", "experimental-interaction-to-next-paint", "total-blocking-time"]) };
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]").replace(/([?&]url=)[^&\s]+/gi, "$1[redacted]").slice(0, 180) : "Unknown error";
    console.error("PageSpeed Insights API error", { strategy, attempt, error: detail });
    if (attempt === 2) return missingPsiStrategy("PageSpeed Insights is unavailable.");
  }
  return missingPsiStrategy("PageSpeed Insights is unavailable.");
}

async function processScanCore(id: string, leaseToken?: string) {
  if (running.has(id)) return;
  running.add(id);
  let browserMs = 0; let modelInputTokens = 0; let modelOutputTokens = 0; let scanModel = "";
  try {
    const scan = await readScan(id); if (!scan || scan.status === "complete") return;
    const requestBudget = currentRequestBudget() ?? new ScanRequestBudget();
    const target = normalizePublicUrl(scan.url);
    await phase(id, "Checking scan permissions…", leaseToken);
    const policy = await inspectRobots(target);
    if (policy.robots.state === "unknown") throw new SafeFetchError("Could not confirm the page’s robots.txt rules, so the scan stopped safely. Try again later.");
    if (policy.blocked) throw new UnsafeTargetError("This page is disallowed by its robots.txt file.");
    await phase(id, "Rendering the desktop page…", leaseToken);
    const ttfbStartedAt = Date.now();
    const initial = await safeFetch(target.toString(), { timeoutMs: 10_000, maxBytes: 5_000_000, maxRedirects: 4, beforeRedirect: assertRobotsAllows });
    const ttfbMs = Date.now() - ttfbStartedAt;
    if ([401, 403, 429].includes(initial.status)) throw new SafeFetchError("This site is blocking automated review.");
    if (initial.status === 404) throw new SafeFetchError("HTTP 404: page not found.");
    if (initial.status < 200 || initial.status >= 400) throw new SafeFetchError(`The page returned HTTP ${initial.status}.`);
    const contentType = String(initial.headers["content-type"] ?? "").toLowerCase();
    const looksLikeHtml = /<(?:!doctype\s+html|html|head|body)\b/i.test(initial.body.toString("utf8", 0, Math.min(initial.body.length, 4096)));
    if ((contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) || (!contentType && !looksLikeHtml)) throw new SafeFetchError("This URL does not return a reviewable HTML page.");
    const finalUrl = normalizePublicUrl(initial.finalUrl);
    await assertRobotsAllows(finalUrl);
    let html = initial.body.toString("utf8");
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
    const counter = { count: 0, bytes: 0, active: 0, waiting: [] as Array<() => void>, buckets: { script: 0, style: 0, image: 0, font: 0, other: 0 }, largest: [] as Array<{ url: string; bytes: number; type: string }> };
    const browserStartedAt = Date.now();
    let desktop; let mobile;
    try {
      const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: false, serviceWorkers: "block" });
      // esbuild (tsx) injects __name() into functions passed to page.evaluate; define it in the page context.
      await desktopContext.addInitScript("window.__name = function(fn, name) { try { Object.defineProperty(fn, \"name\", { value: name, configurable: true }); } catch (e) {} return fn; };");
      await desktopContext.addInitScript("window.__rbSpeed = { lcp: 0, cls: 0 }; try { new PerformanceObserver(function(l){ for (var i=0;i<l.getEntries().length;i++) window.__rbSpeed.lcp = l.getEntries()[i].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {} try { new PerformanceObserver(function(l){ for (var i=0;i<l.getEntries().length;i++) if (!l.getEntries()[i].hadRecentInput) window.__rbSpeed.cls += l.getEntries()[i].value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}");
      await desktopContext.routeWebSocket("**/*", (socket) => socket.close({ code: 1008, reason: "WebSockets are disabled during scanning." }));
      desktop = await pageCapture(desktopContext, finalUrl.toString(), false, counter, requestBudget); await desktopContext.close();
      await phase(id, "Rendering the mobile page…", leaseToken);
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ignoreHTTPSErrors: false, serviceWorkers: "block" });
      await mobileContext.addInitScript("window.__name = function(fn, name) { try { Object.defineProperty(fn, \"name\", { value: name, configurable: true }); } catch (e) {} return fn; };");
      await mobileContext.routeWebSocket("**/*", (socket) => socket.close({ code: 1008, reason: "WebSockets are disabled during scanning." }));
      mobile = await pageCapture(mobileContext, finalUrl.toString(), true, counter, requestBudget); await mobileContext.close();
    } finally { signal?.removeEventListener("abort", closeBrowser); browserMs += Date.now() - browserStartedAt; await browser.close(); }
    if (signal?.aborted) throw new SafeFetchError("The scan exceeded its 90-second time limit. Please try again later.");
    const snap = desktop.snapshot; const mobileSnap = mobile.snapshot;
    const pageUrl = new URL(finalUrl); const origin = pageUrl.origin;
    await phase(id, "Checking links and page signals…", leaseToken);
    const sameOriginLinks = snap.links.filter((href: string) => { try { return new URL(href).origin === origin && new URL(href).pathname !== pageUrl.pathname; } catch { return false; } });
    const hreflangLinks = snap.hreflang.map((item: { href: string }) => item.href);
    const formActionLinks = snap.forms.map((form: { action: string }) => form.action ? new URL(form.action, finalUrl).toString() : "").filter(Boolean);
    const primaryTargets = snap.primaryCtas.map((cta: { href: string }) => cta.href).filter(Boolean);
    const auditTargets = [...primaryTargets, ...formActionLinks, ...hreflangLinks, ...sameOriginLinks];
    const linkResult = await checkStatus(auditTargets);
    const robots = policy.robots;
    let sitemap: MetricCheck;
    try { const sitemapUrl = new URL("/sitemap.xml", origin); await assertRobotsAllows(sitemapUrl); const res = await safeFetch(sitemapUrl.toString(), { timeoutMs: 3500, maxBytes: 500_000, maxRedirects: 2, beforeRedirect: assertRobotsAllows }); sitemap = { state: "checked", value: res.status }; } catch { sitemap = unknown("Could not check sitemap.xml."); }
    let ogImage: MetricCheck = unknown("No Open Graph image was declared.");
    let ogImageTooSmall = false;
    let shareImageUrl: string | undefined;
    if (snap.ogImage) {
      try { const imageUrl = new URL(snap.ogImage, finalUrl).toString(); await assertRobotsAllows(new URL(imageUrl)); const image = await safeFetch(imageUrl, { timeoutMs: 5000, maxBytes: 1_500_000, maxRedirects: 3, beforeRedirect: assertRobotsAllows }); const mime = String(image.headers["content-type"] ?? ""); const dimensions = mime.startsWith("image/") ? imageSize(image.body) : undefined; if (dimensions) ogImageTooSmall = dimensions.width < 1200 || dimensions.height < 630; ogImage = image.status >= 200 && image.status < 300 && dimensions ? { state: "checked", value: `${dimensions.width} × ${dimensions.height}px · ${image.body.length} bytes` } : { state: "checked", value: `Invalid image response · HTTP ${image.status}` }; if (dimensions && image.status >= 200 && image.status < 300) { const safeImage = new URL(image.finalUrl); safeImage.search = ""; safeImage.hash = ""; shareImageUrl = safeImage.toString(); } } catch { ogImage = { state: "checked", value: "Image could not be fetched or decoded safely" }; }
    }
    const [psi, psiDesktop] = await Promise.all([psiMetrics(finalUrl.toString(), "mobile"), psiMetrics(finalUrl.toString(), "desktop")]);
    const scripts: ScriptSource[] = [{ url: finalUrl.toString(), source: snap.html }];
    for (const scriptUrl of snap.scriptUrls.filter((url: string) => { try { const candidate = new URL(url); return candidate.origin === origin && /\.m?js$/i.test(candidate.pathname); } catch { return false; } }).slice(0, 4)) {
      try {
        await assertRobotsAllows(new URL(scriptUrl));
        const response = await safeFetch(scriptUrl, { timeoutMs: 3000, maxBytes: 600_000, maxRedirects: 2, beforeRedirect: assertRobotsAllows });
        if (response.status >= 200 && response.status < 300) scripts.push({ url: response.finalUrl, source: response.body.toString("utf8") });
      } catch { /* Bundle failures stay unknown and never block the base report. */ }
    }
    const exposure = await inspectExposedFiles(origin, scripts, (url, options) => safeFetch(url, { ...options, beforeRedirect: assertRobotsAllows }), assertRobotsAllows);
    const apiRoutes = extractSameOriginApiRoutes(scripts.map((script) => script.source), origin);
    const corsWildcards: string[] = [];
    for (const route of apiRoutes.slice(0, 6)) {
      try { await assertRobotsAllows(new URL(route)); const response = await safeFetch(route, { method: "OPTIONS", statusOnly: true, headers: { origin, "access-control-request-method": "GET" }, timeoutMs: 2500, maxRedirects: 1, beforeRedirect: assertRobotsAllows }); if (String(response.headers["access-control-allow-origin"] ?? "").trim() === "*") corsWildcards.push(new URL(route).pathname); } catch { /* Unsupported preflight responses remain unknown. */ }
    }
    const inlineAndBundleSecrets = scripts.flatMap((script) => detectFrontendSecrets(script.source, script.url));
    const seenSecret = new Set<string>();
    const secrets = inlineAndBundleSecrets.filter((item) => { const key = `${item.type}\0${item.file}\0${item.masked}`; if (seenSecret.has(key)) return false; seenSecret.add(key); return true; });
    const cookies: string[] = [];
    const setCookie = initial.headers["set-cookie"];
    for (const cookie of (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [])) {
      const parts = cookie.split(";"); const name = parts[0]?.split("=", 1)[0]?.trim() || "cookie";
      const attributes = parts.slice(1).map((part) => part.trim().split("=", 1)[0].toLowerCase());
      const missing = ["secure", "httponly", "samesite"].filter((attribute) => !attributes.includes(attribute));
      if (missing.length) cookies.push(`${name} (missing ${missing.join(", ")})`);
    }
    let httpRedirectsToHttps: boolean | undefined;
    let certificateValid: boolean | undefined = finalUrl.protocol === "https:" ? true : undefined;
    if (target.protocol === "http:") httpRedirectsToHttps = finalUrl.protocol === "https:";
    else {
      try {
        const httpTarget = new URL(finalUrl); httpTarget.protocol = "http:";
        await assertRobotsAllows(httpTarget);
        const response = await safeFetch(httpTarget.toString(), { statusOnly: true, timeoutMs: 3500, maxRedirects: 3, beforeRedirect: assertRobotsAllows });
        httpRedirectsToHttps = response.finalUrl.startsWith("https:");
      } catch { httpRedirectsToHttps = undefined; }
    }
    if (!certificateValid && finalUrl.protocol !== "https:") {
      try { const httpsTarget = new URL(finalUrl); httpsTarget.protocol = "https:"; await assertRobotsAllows(httpsTarget); const response = await safeFetch(httpsTarget.toString(), { statusOnly: true, timeoutMs: 3500, maxRedirects: 2, beforeRedirect: assertRobotsAllows }); certificateValid = response.finalUrl.startsWith("https:"); }
      catch (error) { const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined; certificateValid = code && /CERT|TLS|SSL/i.test(code) ? false : undefined; }
    }
    const security = securityFindings({ protocol: finalUrl.protocol, certificateValid, httpRedirectsToHttps, headers: initial.headers,
      mixedContent: finalUrl.protocol === "https:" ? snap.mixedContent : [], cookies, secrets: [], corsWildcards, exposureFindings: exposure.findings });
    const seo = seoFindings({ title: snap.title, description: snap.description, h1Count: snap.h1Count, headingOrderProblems: snap.headingOrderProblems,
      canonical: snap.canonical, metaRobots: snap.metaRobots, robotsHeader: String(initial.headers["x-robots-tag"] ?? "").slice(0, 120), hreflang: snap.hreflang.map((item: { lang: string; href: string; valid: boolean }) => ({ ...item, status: linkResult.statusByUrl.get(item.href) })),
      jsonLd: snap.jsonLd, imageCount: snap.imageCount, imageAltCount: snap.imageAltCount, ogTitle: snap.ogTitle, ogDescription: snap.ogDescription, ogImage: snap.ogImage, twitterCard: snap.twitterCard }, sitemap, []);
    const consoleMessages = [...(desktop.consoleMessages ?? []), ...(mobile.consoleMessages ?? [])];
    const leftovers = leftoverFindings({ text: `${snap.text} ${snap.html}`, title: snap.title, favicon: snap.favicon, imageUrls: snap.imageUrls,
      placeholderLinks: snap.placeholderLinks, testimonials: snap.testimonialBlocks, consoleErrors: desktop.consoleErrors + mobile.consoleErrors, consoleMessages,
      comingSoonCount: (snap.text.match(/coming soon/gi) ?? []).length });
    const formAudit = formFindings({ forms: snap.forms, primaryCtas: snap.primaryCtas.filter((cta: { href: string }) => Boolean(cta.href)), statusByUrl: linkResult.statusByUrl, baseUrl: finalUrl.toString() });
    const designSignals = auditDesignSignals([snap.visualSignals, mobileSnap.visualSignals]);
    const findings = [...deterministicFindings({ page: snap, mobile: mobileSnap, links: linkResult, status: initial.status, protocol: finalUrl.protocol, ogImage, ogImageTooSmall }), ...security.findings, ...seo, ...leftovers, ...formAudit, ...designSignals.findings];
    const checkResults: Record<string, MetricCheck> = {
      ...security.checks,
      status: { state: "checked", value: initial.status }, redirects: { state: "checked", value: initial.redirects.length }, https: { state: "checked", value: finalUrl.protocol === "https:" ? "Secure" : "Not secure" },
      title: snap.title ? { state: "checked", value: snap.title } : { state: "checked", value: "Missing" }, description: snap.description ? { state: "checked", value: snap.description } : { state: "checked", value: "Missing" },
      ogTitle: snap.ogTitle ? { state: "checked", value: snap.ogTitle } : unknown("No Open Graph title was declared."), ogDescription: snap.ogDescription ? { state: "checked", value: snap.ogDescription } : unknown("No Open Graph description was declared."), ogImage, favicon: snap.favicon ? { state: "checked", value: snap.favicon } : unknown("No favicon was declared."), appleTouchIcon: snap.appleTouchIcon ? { state: "checked", value: snap.appleTouchIcon } : unknown("No Apple touch icon was declared."), canonical: snap.canonical ? { state: "checked", value: snap.canonical } : unknown("No canonical URL was declared."), robots, sitemap,
      imageAltCoverage: snap.imageCount ? { state: "checked", value: `${snap.imageAltCount}/${snap.imageCount}` } : unknown("No page images were detected."), sameOriginLinks: { state: "checked", value: `${linkResult.checked} checked · ${linkResult.broken.length} HTTP errors · ${linkResult.unknownCount} couldn't check` },
      proofSignals: { state: "checked", value: snap.hasProof ? "Detected" : "Not detected by text and image-label checks" }, pricing: { state: "checked", value: snap.hasPricing ? "Detected" : "Not detected in page text" }, faq: { state: "checked", value: snap.hasFaq ? "Detected" : "Not detected" }, contact: { state: "checked", value: snap.hasContact ? "Detected" : "Not detected" },
      mobileOverflow: { state: "checked", value: mobileSnap.bodyWidth > mobileSnap.viewportWidth + 2 ? `${mobileSnap.bodyWidth}px wide` : "None detected" },
      designFontFamilies: { state: "checked", value: designSignals.fontFamilies.length }, designDistinctColors: { state: "checked", value: designSignals.colors.length }, designContrastFailures: { state: "checked", value: designSignals.contrastFailureCount },
      pageSpeedMobile: psi.performance, pageSpeedDesktop: psiDesktop.performance, lighthouseMobileAccessibility: psi.accessibility, lighthouseDesktopAccessibility: psiDesktop.accessibility,
      lighthouseMobileBestPractices: psi.bestPractices, lighthouseDesktopBestPractices: psiDesktop.bestPractices, lighthouseMobileSeo: psi.seo, lighthouseDesktopSeo: psiDesktop.seo,
      lcpMobile: psi.lcp, clsMobile: psi.cls, inpTbtMobile: psi.inpTbt, lcpDesktop: psiDesktop.lcp, clsDesktop: psiDesktop.cls, inpTbtDesktop: psiDesktop.inpTbt,
      titleLength: { state: "checked", value: snap.title.length }, descriptionLength: { state: "checked", value: snap.description.length }, h1Count: { state: "checked", value: snap.h1Count },
      headingOrder: { state: "checked", value: snap.headingOrderProblems.length ? `${snap.headingOrderProblems.length} skip(s)` : "In order" }, metaRobots: snap.metaRobots ? { state: "checked", value: snap.metaRobots.slice(0, 120) } : { state: "checked", value: "No robots meta" },
      twitterCard: snap.twitterCard ? { state: "checked", value: snap.twitterCard } : { state: "checked", value: "Missing" }, hreflang: { state: "checked", value: snap.hreflang.length }, jsonLd: { state: "checked", value: `${snap.jsonLd.valid} valid · ${snap.jsonLd.invalid} invalid` },
      securityHeaders: { state: "checked", value: Object.values(security.checks).filter((item) => item.value === "Present").length }, exposedFiles: { state: "checked", value: exposure.exposed.length }, frontendSecrets: { state: "checked", value: secrets.length },
      mixedContent: { state: "checked", value: snap.mixedContent.length }, cookieIssues: { state: "checked", value: cookies.length }, corsWildcardRoutes: { state: "checked", value: corsWildcards.length },
      formCount: { state: "checked", value: snap.forms.length }, primaryCtaTargets: { state: "checked", value: `${linkResult.checked} checked · ${linkResult.unknownCount} unknown` }, consoleErrors: { state: "checked", value: desktop.consoleErrors + mobile.consoleErrors },
      consoleErrorDetails: (desktop.consoleMessages ?? []).length + (mobile.consoleMessages ?? []).length ? { state: "checked" as const, value: [...(desktop.consoleMessages ?? []), ...(mobile.consoleMessages ?? [])].join(" | ") } : { state: "checked" as const, value: "No console errors observed." },
      brokenLinkDetails: linkResult.broken.length ? { state: "checked" as const, value: linkResult.broken.slice(0, 6).join(" | ") } : { state: "checked" as const, value: "No broken links among the checked set." },
      redirectChain: { state: "checked", value: initial.redirects.length ? initial.redirects.join(" → ") : "No redirects" },
      assetWeights: { state: "checked", value: Object.entries(counter.buckets).map(([kind, bytes]) => `${kind} ${Math.round(bytes / 1024)} KB`).join(" · ") },
      largestAssets: { state: "checked", value: counter.largest.sort((a, b) => b.bytes - a.bytes).slice(0, 4).map((item) => `${item.url.split("/").pop()?.slice(0, 40) || item.url.slice(0, 40)} ${Math.round(item.bytes / 1024)} KB`).join(" · ") || "No subresources were fetched." },
      ttfb: { state: "checked", value: `${ttfbMs} ms` },
      requestCount: { state: "checked", value: counter.count },
      speedDcl: { state: "checked", value: `${desktop.speed?.dcl ?? 0} ms DOMContentLoaded` },
      speedLoad: { state: "checked", value: `${desktop.speed?.load ?? 0} ms load complete` },
      speedFcp: { state: "checked", value: `${desktop.speed?.fcp ?? 0} ms first contentful paint` },
      speedLcp: { state: "checked", value: `${desktop.speed?.lcp ?? 0} ms largest contentful paint` },
      speedCls: { state: "checked", value: desktop.speed?.cls ?? 0 },
      speedResources: { state: "checked", value: `${desktop.speed?.resources ?? 0} requests · ${desktop.speed?.scripts ?? 0} scripts · ${desktop.speed?.thirdPartyOrigins ?? 0} third-party origins · ${desktop.speed?.transferKB ?? 0} KB transfer` },
    };
    const current = await readScan(id); if (!current) return;
    await phase(id, "Preparing the evidence-led report…", leaseToken);
    await phase(id, "Reviewing visual design…", leaseToken);
    const reviewModel = current.paid ? (process.env.LLM_MODEL_PAID || "gpt-4.1") : (process.env.LLM_MODEL_FREE || process.env.LLM_MODEL || undefined);
    const [contentReview, designModelResult] = await Promise.all([
      reviewContent({ title: snap.title, description: snap.description, pageText: snap.text, findings, desktopImage: desktop.screenshot, mobileImage: mobile.screenshot }, reviewModel),
      reviewDesign({ desktopImage: desktop.fullPageScreenshot, mobileImage: mobile.fullPageScreenshot, signals: [snap.visualSignals, mobileSnap.visualSignals] }, reviewModel),
    ]);
    modelInputTokens = (contentReview.usage?.inputTokens ?? 0) + (designModelResult.usage?.inputTokens ?? 0);
    modelOutputTokens = (contentReview.usage?.outputTokens ?? 0) + (designModelResult.usage?.outputTokens ?? 0);
    scanModel = contentReview.usage?.model || designModelResult.usage?.model || (current.paid ? process.env.LLM_MODEL_PAID || "gpt-4.1" : process.env.LLM_MODEL_FREE || process.env.LLM_MODEL || "gpt-4.1-mini");
    const designReview = designModelResult.review;
    const allFindings = [...findings, ...designModelResult.findings, ...contentReview.findings.filter((item) => !findings.some((known) => known.id === item.id))];
    const copyDrafts = contentReview.copyDrafts;
    const ranked = rankFindings(allFindings);
    const sectionCodes: Record<string, string> = { security: "SEC", seo: "SEO", leftovers: "LEFT", forms: "FORM", technical: "TECH", design: "DES", other: "GEN" };
    const codeCounters: Record<string, number> = {};
    for (const finding of ranked) { const prefix = sectionCodes[finding.section ?? "other"] ?? "GEN"; codeCounters[prefix] = (codeCounters[prefix] ?? 0) + 1; finding.code = `${prefix}-${String(codeCounters[prefix]).padStart(2, "0")}`; }
    const lighthouseScores = [psi.performance, psi.accessibility, psi.bestPractices, psi.seo, psiDesktop.performance, psiDesktop.accessibility, psiDesktop.bestPractices, psiDesktop.seo].flatMap((item) => item.state === "checked" && typeof item.value === "number" ? [item.value] : []);
    const technicalCoverage = 0.9 + 0.1 * (lighthouseScores.length / 8);
    const securityCoverage = Object.values(security.checks).filter((item) => item.state === "checked").length / Math.max(1, Object.keys(security.checks).length);
    const categoryCoverage = { clarity: contentReview.findings.length ? 1 : 0.6, conversion: contentReview.findings.length ? 1 : 0.85, design_brand: designReview.state === "checked" ? 1 : 0.45, trust: 1, technical: technicalCoverage, security: securityCoverage };
    const scored = scoreFindings(ranked, categoryCoverage, lighthouseScores, designReview.score === undefined ? {} : { design_brand: designReview.score });
    const categoryBase: Partial<Record<Category, number>> = designReview.score === undefined ? {} : { design_brand: designReview.score };
    const scoreBreakdown: ScoreBreakdown = {
      categories: Object.fromEntries((Object.keys(CATEGORY_WEIGHTS) as Category[]).map((category) => {
        const catFindings = ranked.filter((finding) => finding.category === category);
        const lost = catFindings.reduce((sum, finding) => sum + SEVERITY_PENALTY[finding.severity], 0);
        const base = Math.round(categoryBase[category] ?? 100);
        const ceiling = Math.round(50 + 50 * Math.max(0, Math.min(1, categoryCoverage[category] ?? 0.55)));
        return [category, { score: scored.categoryScores[category], base, ceiling, lost, count: catFindings.length }];
      })),
      top: [...ranked].sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity]).slice(0, 5).map((finding) => ({ code: finding.code, severity: finding.severity, penalty: SEVERITY_PENALTY[finding.severity], title: finding.title, category: finding.category })),
    };
    const hints = stackHints(html);
    const prompts = promptVariants({ url: finalUrl.toString(), title: snap.title, stack: hints, findings: ranked, copyDrafts });
    const paidPayload = { available: copyDrafts.headlines.length === 3, paidModelReady: Boolean(current.paid && copyDrafts.headlines.length === 3), findings: ranked, prompts, copyDrafts, model: scanModel };
    await saveScan({ ...current, status: "complete", phase: "Report ready", updatedAt: now(), score: scored.score, categoryScores: scored.categoryScores, findings: ranked, auditCounts: calculateAuditCounts(checkResults, ranked), scoreBreakdown,
      checks: checkResults, categoryCoverage, lighthouse: { mobile: psi, desktop: psiDesktop, source: "via Google PageSpeed Insights" }, sharePreview: { title: snap.ogTitle || snap.title, description: snap.ogDescription || snap.description }, shareImageUrl,
      desktopImage: desktop.screenshot, mobileImage: mobile.screenshot, designReview, scoringVersion: 2, domain: pageUrl.hostname, title: snap.title, description: snap.description, finalUrl: finalUrl.toString(), redirects: initial.redirects,
      stackHints: hints, contentReview: contentReview.status, paidPayload }, leaseToken);
    await settleScanCost({ scanId: id, paid: Boolean(current.paid), browserMs, inputTokens: modelInputTokens, outputTokens: modelOutputTokens, model: scanModel });
    for (const script of scripts) script.source = "";
    snap.html = "";
    html = "";
  } catch (error) {
    const message = scanFailureMessage(error);
    if (!(error instanceof UnsafeTargetError) && !(error instanceof SafeFetchError)) {
      const diagnostic = error instanceof Error ? error as Error & { code?: string } : undefined;
      console.error("Launch Score scan failed", { scanId: id, errorName: diagnostic?.name ?? "UnknownError", errorCode: diagnostic?.code });
    }
    await updateScan(id, (scan) => ({ ...scan, status: "failed", phase: "Scan could not be completed", error: message, updatedAt: now() }), leaseToken);
    const failedScan = await readScan(id);
    await settleScanCost({ scanId: id, paid: Boolean(failedScan?.paid), browserMs, inputTokens: modelInputTokens, outputTokens: modelOutputTokens, model: scanModel || (failedScan?.paid ? process.env.LLM_MODEL_PAID : process.env.LLM_MODEL_FREE) || "gpt-4.1-mini" }).catch(() => undefined);
  } finally { running.delete(id); }
}

export class ScanAdmissionError extends Error {
  constructor(readonly code: "email_required" | "free_paused" | "free_limit", message: string) { super(message); this.name = "ScanAdmissionError"; }
}

export async function createScan(url: string, options: { paid?: boolean; paidRescanExpiresAt?: string; freeAdmission?: { device: string; ip: string; sessionToken?: string } } = {}): Promise<ScanRecord> {
  const target = normalizePublicUrl(url);
  const cached = options.paid ? undefined : await findCachedScan(target.toString());
  if (cached) return cached;
  const id = randomUUID(); const timestamp = now();
  const record: ScanRecord = { id, url: target.toString(), status: "queued", phase: "In the scan queue…", createdAt: timestamp, updatedAt: timestamp, paid: Boolean(options.paid), paidRescanExpiresAt: options.paidRescanExpiresAt };
  if (!options.paid && options.freeAdmission) {
    const admission = await reserveFreeScan({ scanId: id, ...options.freeAdmission });
    if (!admission.allowed) {
      if (admission.budgetPaused) throw new ScanAdmissionError("free_paused", "Free scans are paused for today. Come back tomorrow, or leave your email for the waitlist.");
      if (admission.requiresEmail) throw new ScanAdmissionError("email_required", "Add your email to unlock two more free scans.");
      throw new ScanAdmissionError("free_limit", "This email has used its three free scans.");
    }
  }
  try { await saveScan(record); }
  catch (error) { if (!options.paid && options.freeAdmission) await releaseFreeScanReservation(id); throw error; }
  if (process.env.NODE_ENV !== "production") void processScan(id);
  return record;
}

export async function processScan(id: string, leaseToken?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_WALL_LIMIT_MS);
  try { return await withScanSignal(controller.signal, () => withRequestBudget(new ScanRequestBudget(), () => processScanCore(id, leaseToken))); }
  finally { clearTimeout(timer); }
}
