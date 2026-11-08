export function ReportCategoryScore({ score }: { score?: number }) {
  const available = typeof score === "number" && Number.isFinite(score);
  return <>
    {available
      ? <span className="category-track" aria-hidden="true"><i style={{ width: `${score}%` }}/></span>
      : <span className="category-track category-track--unavailable" aria-hidden="true"/>}
    <span className={`mono category-score${available ? "" : " category-score--unavailable"}`}>
      {available ? <>{score}<small>/100</small></> : "Unavailable"}
    </span>
  </>;
}
