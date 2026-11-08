import type { Category } from "@/lib/types";
import { categoryIndicatorAccent } from "@/lib/report-visuals";
import type { CSSProperties } from "react";

export function ReportCategoryScore({ score, category }: { score?: number; category?: Category }) {
  const available = typeof score === "number" && Number.isFinite(score);
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const value = available ? Math.max(0, Math.min(100, score)) : 0;
  const dash = circumference * value / 100;
  return <>
    <span className="category-score-widget" style={{ "--category-accent": category ? categoryIndicatorAccent(category) : "#ff2e7e" } as CSSProperties}>
      <svg className="category-score-ring" viewBox="0 0 40 40" aria-hidden="true">
        <circle className="category-score-ring-track" cx="20" cy="20" r={radius}/>
        {available && <circle className="category-score-ring-value" cx="20" cy="20" r={radius} strokeDasharray={`${dash} ${circumference - dash}`}/ >}
      </svg>
      <span className={`mono category-score${available ? "" : " category-score--unavailable"}`} aria-label={available ? `${score} out of 100` : "Score unavailable"}>
      {available ? <>{score}<small>/100</small></> : "Unavailable"}
      </span>
    </span>
  </>;
}
