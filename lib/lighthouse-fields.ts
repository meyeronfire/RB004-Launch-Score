import type { LighthouseStrategy } from "./types";

export function lighthouseChecks(strategy?: LighthouseStrategy) {
  if (!strategy) return [];
  const { lab, ...checks } = strategy;
  return [...Object.values(checks), ...(lab ? [lab.fcp, lab.speedIndex] : [])];
}

export function hasAutomatedAccessibility(engines?: import("./types").EngineCoverage[]) {
  return engines?.some((engine) => engine.id === "accessibility" && ["issues", "passed", "manual"].includes(engine.status)) ?? false;
}
