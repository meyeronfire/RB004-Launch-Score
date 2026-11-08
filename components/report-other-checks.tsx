import type { CheckLedgerRow } from "@/lib/report-artifacts";

export function ReportOtherChecks({ rows }: { rows: CheckLedgerRow[] }) {
  const other = rows.filter((row) => row.category === "Other");
  if (!other.length) return null;
  return <details className="category-check-list other-recorded-checks">
    <summary>Other recorded checks · {other.length}</summary>
    <p>Additional recorded values that are not assigned to a scoring category. Their recorded states are included in the ledger totals.</p>
    <div className="check-evidence">{other.map((row) => <div className="check-ledger-row" key={row.key}>
      <span className="check-ledger-label"><span className="mono check-ledger-status">{row.status.replaceAll("_", " ")}</span><span>{row.label}</span></span>
      <strong className="mono">{row.value ?? row.note ?? "Not recorded"}</strong>
    </div>)}</div>
  </details>;
}
