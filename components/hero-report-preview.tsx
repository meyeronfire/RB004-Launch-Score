"use client";

import { useEffect, useState } from "react";

const categories = [
  { name: "Clarity", score: 80 },
  { name: "Conversion", score: 93 },
  { name: "Design & Brand", score: 88 },
  { name: "Trust", score: 91 },
  { name: "Technical", score: 93 },
  { name: "Security", score: 90 },
];

export function HeroReportPreview() {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const frame = requestAnimationFrame(() => { setValue(88); setStarted(true); });
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(() => setStarted(true), 180);
    const start = performance.now() + 180;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 900));
      setValue(Math.round(88 * (1 - Math.pow(1 - progress, 4))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, []);

  return <aside className="hero-preview" aria-label="Example launch report preview">
    <span className="preview-label mono">EXAMPLE</span>
    <div className="preview-score" aria-label="Example score 88 out of 100">{value}<span>/100</span></div>
    <div className="preview-categories">
      {categories.map(({ name, score }) => <div className="preview-row" key={name}>
        <span>{name}</span><span className="preview-track" aria-hidden="true"><i style={{ "--fill": `${score}%`, "--delay": `${categories.findIndex((item) => item.name === name) * 90}ms`, "--scale": started ? 1 : 0 } as React.CSSProperties} /></span><span className="preview-number">{score}</span>
      </div>)}
    </div>
    <p className="preview-finding"><span className="mono">01</span> Some images have no descriptive alt text</p>
  </aside>;
}
