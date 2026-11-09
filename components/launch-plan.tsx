"use client";

import { useEffect, useMemo, useState } from "react";
import { buildLaunchPlan, OWNER_LAUNCH_CHECKS } from "@/lib/launch-plan";
import type { Finding } from "@/lib/types";

const phases = ["Confirm first", "Before launch", "Launch polish"] as const;

export function LaunchPlan({ scanId, findings }: { scanId: string; findings: Finding[] }) {
  const steps = useMemo(() => buildLaunchPlan(findings), [findings]);
  const tasks = useMemo(() => [...steps.map((step) => step.id), ...OWNER_LAUNCH_CHECKS.map((item) => `owner:${item.title}`)], [steps]);
  const storageKey = `verdkt-launch-plan:${scanId}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(saved)) setDone(saved.filter((item): item is string => typeof item === "string" && tasks.includes(item)));
      } catch { /* Checklist still works for this visit if storage is unavailable. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey, tasks]);
  function toggle(id: string) {
    setDone((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the current checklist usable without persistence. */ }
      return next;
    });
  }
  const total = tasks.length;
  return <section className="launch-plan-section" aria-labelledby="launch-plan-title">
    <div className="report-section-title"><div><span className="mono">YOUR NEXT STEPS</span><h2 id="launch-plan-title">Personalized launch plan</h2><p>Scan findings become an ordered checklist. Confirm each item in your actual product before changing code.</p></div><span className="launch-plan-progress mono">{done.length}/{total} checked</span></div>
    {phases.map((phase) => {
      const phaseSteps = steps.filter((step) => step.phase === phase);
      if (!phaseSteps.length) return null;
      return <section className="launch-plan-phase" key={phase}><h3>{phase}</h3>{phaseSteps.map((step) => <label className={`launch-plan-task${done.includes(step.id) ? " is-done" : ""}`} key={step.id}>
        <input type="checkbox" checked={done.includes(step.id)} onChange={() => toggle(step.id)} />
        <span className="launch-plan-task-copy"><strong>{step.title}</strong><small>{step.category} · {step.severity} · {step.phase === "Confirm first" ? "Verify before changing" : step.action}</small><small>Evidence: {step.evidence}</small></span>
      </label>)}</section>;
    })}
    <section className="launch-plan-phase launch-plan-owner"><div><h3>Owner checks</h3><span className="mono">NOT VERIFIED BY THIS SCAN</span></div><p>These operational checks need access to your code, accounts, or infrastructure. Mark them only after you have confirmed them.</p>{OWNER_LAUNCH_CHECKS.map((item) => { const id = `owner:${item.title}`; return <label className={`launch-plan-task${done.includes(id) ? " is-done" : ""}`} key={id}><input type="checkbox" checked={done.includes(id)} onChange={() => toggle(id)} /><span className="launch-plan-task-copy"><strong>{item.title}</strong><small>{item.detail}</small></span></label>; })}</section>
    <p className="launch-plan-source">Owner-check topics adapted from the <a href="https://github.com/pepperworks/vibe-coders-checklist" target="_blank" rel="noreferrer">Vibe Coder’s Production Ready Checklist</a>.</p>
    <p className="launch-plan-footnote">Checklist progress is saved in this browser for this report. Re-scan after changes to refresh the page findings.</p>
  </section>;
}
