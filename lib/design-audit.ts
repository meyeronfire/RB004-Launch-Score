import { makeFinding } from "./score";
import type { Finding, VisualSample, VisualSignals } from "./types";

function parseCssColor(value: string) {
  const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) < 0.99) return undefined;
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;
  const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
}

function luminance(color: number[]) {
  const channels = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground: string, background: string) {
  const fg = parseCssColor(foreground); const bg = parseCssColor(background);
  if (!fg || !bg) return undefined;
  const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function safeText(value: string, max = 72) { return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }

export function auditDesignSignals(devices: VisualSignals[]) {
  const fontFamilies = [...new Set(devices.flatMap((device) => device.fontFamilies).map((font) => safeText(font, 80)).filter(Boolean))].sort();
  const colors = [...new Set(devices.flatMap((device) => device.colors).map((color) => color.toLowerCase()))].sort();
  const spacingValues = [...new Set(devices.flatMap((device) => device.spacingValues))].sort();
  const contrastCandidates: Array<{ sample: VisualSample; ratio: number; threshold: 3 | 4.5 }> = [];
  for (const sample of devices.flatMap((device) => device.samples)) {
    if (!sample.text.trim()) continue;
    const ratio = contrastRatio(sample.color, sample.background);
    if (ratio === undefined) continue;
    const largeBold = sample.fontSize >= 24 || (sample.fontSize >= 18.66 && Number(sample.fontWeight) >= 700);
    const threshold = largeBold ? 3 : 4.5;
    if (ratio + 0.01 < threshold) contrastCandidates.push({ sample, ratio, threshold });
  }
  const worstBySection = new Map<string, (typeof contrastCandidates)[number]>();
  for (const candidate of contrastCandidates) {
    const key = `${candidate.sample.device}\0${candidate.sample.section}`;
    if (!worstBySection.has(key) || worstBySection.get(key)!.ratio > candidate.ratio) worstBySection.set(key, candidate);
  }
  const contrastIssues = [...worstBySection.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 8);
  const findings: Finding[] = contrastIssues.map(({ sample, ratio, threshold }) => {
    const excerpt = safeText(sample.text, 52) || `${sample.tag.toLowerCase()} text`;
    const section = safeText(sample.section, 48) || "Page";
    return makeFinding({ section: "design", category: "design_brand", severity: ratio < 3 ? "high" : "medium", title: `Text contrast is low in ${section}`, why_it_matters: "Low contrast can make visible text harder to read, especially in bright light or for visitors with low vision.", evidence: `${sample.device} · ${section} — “${excerpt}” has ${ratio.toFixed(2)}:1 contrast against ${sample.background}; WCAG AA requires ${threshold}:1 for this text size.`, fix: `Adjust the existing foreground or background token for this text to reach at least ${threshold}:1. Keep the current brand palette and verify the rendered state.` });
  });
  return { fontFamilies, colors, spacingValues, contrastFailureCount: contrastCandidates.length, contrastIssues, findings };
}
