import type { LinkedPageAudit } from "./types";

export function inspectLinkedPage(path: string, status: number, contentType: string, html: string): LinkedPageAudit {
  if (status >= 400) return { path, state: "checked", status, note: "The linked page returned an HTTP error." };
  if (!/text\/html/i.test(contentType)) return { path, state: "checked", status, note: "Non-HTML response; page metadata was not inspected." };

  const title = /<title\b[^>]*>([^<]{0,200})<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const descriptionPresent = /<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["'][^"']{1,})[^>]*>/i.test(html);
  const h1Count = (html.match(/<h1\b[^>]*>/gi) ?? []).length;
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesMissingAlt = imageTags.filter((tag) => !/\balt\s*=/i.test(tag)).length;
  const noindex = /<meta\b(?=[^>]*\bname=["'](?:robots|googlebot)["'])(?=[^>]*\bcontent=["'][^"']*\bnoindex\b)[^>]*>/i.test(html);

  return { path, state: "checked", status, title, descriptionPresent, h1Count, imageCount: imageTags.length, imagesMissingAlt, noindex };
}
