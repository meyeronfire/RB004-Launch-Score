"use client";

import { useEffect, useState } from "react";
import { exampleReport } from "@/lib/example";

const categories = [
  { key: "clarity", name: "Clarity" },
  { key: "conversion", name: "Conversion" },
  { key: "design_brand", name: "Design & Brand" },
  { key: "trust", name: "Trust" },
  { key: "technical", name: "Technical" },
  { key: "security", name: "Security" },
  { key: "seo_aeo", name: "SEO / AEO" },
];

export function HeroReportPreview() {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const frame = requestAnimationFrame(() => { setValue(exampleReport.score ?? 0); setStarted(true); });
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(() => setStarted(true), 180);
    const start = performance.now() + 180;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 900));
      setValue(Math.round((exampleReport.score ?? 0) * (1 - Math.pow(1 - progress, 4))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, []);

  return <aside className="hero-preview" aria-label="Example launch report preview">
    <span className="preview-label mono">EXAMPLE</span>
    <div className="preview-score" aria-label={`Example score ${exampleReport.score} out of 100`}>{value}<span>/100</span></div>
    <div className="preview-categories">
      {categories.map(({ key, name }, index) => {
        const score = exampleReport.categoryScores?.[key as keyof typeof exampleReport.categoryScores];
        return <div className={`preview-row${typeof score === "number" ? "" : " preview-row--unavailable"}`} key={key}>
          <span>{name}</span><span className="preview-track" aria-hidden="true"><i style={{ "--fill": `${score ?? 0}%`, "--delay": `${index * 90}ms`, "--scale": started && typeof score === "number" ? 1 : 0 } as React.CSSProperties} /></span><span className="preview-number">{score ?? "—"}</span>
        </div>;
      })}
    </div>
    <p className="preview-finding"><span className="mono">01</span> Some images have no descriptive alt text</p>
  </aside>;
}
