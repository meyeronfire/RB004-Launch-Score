import { readFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { Page } from "playwright";
import { deterministicFindings, pageSnapshot } from "../lib/scanner";
import { leftoverFindings } from "../lib/depth-checks";

const pages = ["01-complete.html", "02-missing-headline-action.html", "03-template-no-trust.html", "04-mobile-overflow.html", "05-technical-gaps.html"];

async function snapshotFromSavedHtml(html: string) {
  const dom = new JSDOM(html, { url: "https://fixture.example/", pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, "innerText", { configurable: true, get() { return this.textContent ?? ""; } });
  for (const element of window.document.querySelectorAll<HTMLElement>("*")) {
    const style = window.getComputedStyle(element);
    const explicitWidth = parseFloat(style.width);
    const explicitHeight = parseFloat(style.height);
    const button = element.tagName === "BUTTON";
    const anchor = element.tagName === "A";
    const width = Number.isFinite(explicitWidth) && explicitWidth > 0 ? explicitWidth : button ? 120 : anchor ? 100 : 240;
    const height = Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : button ? 48 : 32;
    Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 100, top: 100, left: 0, right: width, bottom: 100 + height, width, height, toJSON: () => ({}) }) });
  }
  const bodyWidth = Math.max(390, parseFloat(window.getComputedStyle(window.document.body).minWidth) || 0);
  Object.defineProperty(window.document.body, "scrollWidth", { configurable: true, value: bodyWidth });
  const keys = ["document", "innerWidth", "innerHeight", "getComputedStyle", "HTMLAnchorElement", "Element"] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const values: Record<(typeof keys)[number], unknown> = { document: window.document, innerWidth: 390, innerHeight: 844, getComputedStyle: window.getComputedStyle.bind(window), HTMLAnchorElement: window.HTMLAnchorElement, Element: window.Element };
  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
  }
  try {
    const fakePage = { evaluate: (callback: () => unknown) => callback() } as unknown as Page;
    return await pageSnapshot(fakePage);
  } finally {
    for (const key of keys) { const descriptor = previous.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    window.close();
  }
}

describe("saved rendered-page fixtures", () => {
  it.each(pages)("extracts DOM signals safely from %s", async (name) => {
    const html = await readFile(path.join(process.cwd(), "tests/fixtures/pages", name), "utf8");
    const snapshot = await snapshotFromSavedHtml(html);
    expect(typeof snapshot.title).toBe("string");
    expect(snapshot.ctas.every((cta) => typeof cta.text === "string" && typeof cta.visible === "boolean")).toBe(true);
    if (name === "01-complete.html") {
      expect(snapshot.ctas.some((cta) => cta.text === "Start free" && cta.visible)).toBe(true);
      expect(snapshot.imageCount).toBe(1);
      expect(snapshot.imageAltCount).toBe(1);
    }
    const findings = deterministicFindings({ page: snapshot, mobile: snapshot, links: { broken: [], checked: 0, unknownCount: 0 }, status: 200, protocol: "https:", ogImage: { state: "unknown", note: "No fixture OG image." }, ogImageTooSmall: false });
    if (name === "02-missing-headline-action.html") expect(findings.some((finding) => finding.title === "The page has no main headline")).toBe(true);
    if (name === "03-template-no-trust.html") expect(leftoverFindings({ text: `${snapshot.text} ${snapshot.html}`, title: snapshot.title, favicon: snapshot.favicon, imageUrls: snapshot.imageUrls, placeholderLinks: snapshot.placeholderLinks, testimonials: snapshot.testimonialBlocks, consoleErrors: 0, comingSoonCount: 0 }).some((finding) => finding.title === "Template text or a default title remains on the page")).toBe(true);
    if (name === "04-mobile-overflow.html") expect(findings.some((finding) => finding.title === "The mobile page overflows horizontally")).toBe(true);
    if (name === "05-technical-gaps.html") expect(findings.some((finding) => finding.title === "The page has no viewport setting")).toBe(true);
  });
});
