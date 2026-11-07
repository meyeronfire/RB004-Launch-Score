import type { ShareCardData, ShareVariant } from "@/lib/share-card";

// Satori-compatible share card renderer. Flex-only (no grid), explicit display
// on every container, deterministic output for identical inputs.
const CHROME = "linear-gradient(174deg,#fff 0%,#d4d4d4 20%,#fff 31%,#acacac 45%,#888 48%,#fff 50%,#f5f5f5 54%,#919191 57%,#c4c4c4 76%,#fff 94%)";
const PINK = "#ff2e7e";
const MONO = "Geist Mono";
const SANS = "Inter Display";

function progress(score: number | null, width: number) {
  return <div style={{ display: "flex", width, height: 5, background: "#2a2a2a", borderRadius: 3, overflow: "hidden" }}>
    <div style={{ display: "flex", width: `${score ?? 0}%`, height: "100%", background: PINK, borderRadius: 3 }} />
  </div>;
}

function categoryGrid(data: ShareCardData, columns: 2 | 3, labelSize: number, trackWidth: number) {
  const rows = Array.from({ length: Math.ceil(data.categories.length / columns) }, (_, row) => data.categories.slice(row * columns, (row + 1) * columns));
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 * (columns === 2 ? 1.4 : 1) }}>
    {rows.map((categories, row) => <div key={row} style={{ display: "flex", gap: 28 * (columns === 2 ? 1.4 : 1) }}>
      {categories.map((category) => <div key={category.label} style={{ display: "flex", flexDirection: "column", gap: 7, width: trackWidth }}>
        <span style={{ display: "flex", fontSize: labelSize, color: "#a8a8a8" }}>{category.label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", flex: 1, height: 3, background: "#2a2a2a", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ display: "flex", width: `${category.value ?? 0}%`, height: "100%", background: PINK, borderRadius: 2 }} />
          </div>
          <span style={{ display: "flex", fontSize: labelSize + 1, fontFamily: MONO, color: "#e5e5e5", minWidth: 26, justifyContent: "flex-end" }}>{category.value ?? "—"}</span>
        </div>
      </div>)}
    </div>)}
  </div>;
}

function severityChips(data: ShareCardData, fontSize: number) {
  const chips = (["critical", "high", "medium", "low"] as const).filter((level) => data.severityCounts[level] > 0);
  if (!chips.length) return <div style={{ display: "flex", fontSize, fontFamily: MONO, color: "#a8a8a8" }}>No findings recorded.</div>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
    {chips.map((level) => <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "6px 16px" }}>
      <span style={{ display: "flex", fontFamily: MONO, fontSize, color: PINK }}>{data.severityCounts[level]}</span>
      <span style={{ display: "flex", fontFamily: MONO, fontSize, color: "#e5e5e5", letterSpacing: 1 }}>{level.toUpperCase()}</span>
    </div>)}
  </div>;
}

export function renderShareCard({ data, variant, width, height, wordmarkSrc }: { data: ShareCardData; variant: ShareVariant; width: number; height: number; wordmarkSrc: string }): React.ReactElement {
  const tall = height > width;
  const pad = Math.round(width * 0.055);
  const scoreSize = tall ? Math.round(width * 0.34) : Math.round(height * 0.42);
  const domainWidth = tall ? width * 0.8 : width * 0.36;
  const domainSize = Math.max(16, Math.min(width * 0.034, domainWidth / Math.max(data.domain.length * 0.56, 1)));

  const header = <div style={{ display: "flex", alignItems: "center", gap: 22, position: "relative" }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Satori needs a self-contained data URI in ImageResponse. */}
    <img src={wordmarkSrc} alt="VERDKT" width={Math.round(width * 0.14)} height={Math.round(width * 0.14 / 3)} />
    <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.012), color: "#a8a8a8", letterSpacing: 2 }}>LAUNCH SCORE</span>
  </div>;

  const footer = <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #292929", paddingTop: Math.round(height * 0.025), position: "relative" }}>
    <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.014), color: "#e5e5e5" }}>How ready is your launch?</span>
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <span style={{ display: "flex", fontSize: Math.round(width * 0.013) }}>VERDKT · rb004.vercel.app</span>
      <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.011), color: "#8a8a8a", letterSpacing: 1 }}>SCANNED WITH VERDKT</span>
    </div>
  </div>;

  let main: React.ReactElement;
  if (variant === "findings") {
    main = <div style={{ display: "flex", flex: 1, flexDirection: tall ? "column" : "row", justifyContent: tall ? "center" : "space-between", alignItems: tall ? "center" : "flex-end", position: "relative", gap: tall ? 40 : 30 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.013), color: PINK, letterSpacing: 2 }}>{data.hasData ? "THE AUDIT FOUND" : "AUDIT INCOMPLETE"}</span>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <span style={{ display: "flex", fontSize: tall ? Math.round(width * 0.26) : Math.round(height * 0.34), lineHeight: 0.85, letterSpacing: -6, background: CHROME, backgroundClip: "text", color: "transparent" }}>{data.issueCount}</span>
          <span style={{ display: "flex", fontSize: Math.round(width * 0.026), color: "#a8a8a8", margin: "8px 0 0 14px", fontFamily: MONO }}>issues</span>
        </div>
        <span style={{ display: "flex", fontSize: Math.round(width * 0.03), lineHeight: 1.15, color: "#e5e5e5", maxWidth: tall ? width * 0.7 : width * 0.32 }}>between your website and launch.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: tall ? "70%" : width * 0.3 }}>
        {severityChips(data, Math.round(width * 0.014))}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ display: "flex", fontSize: domainSize, color: "#e5e5e5" }}>{data.domain}</span>
          <div style={{ display: "flex", width: "100%" }}>{progress(data.score, tall ? width * 0.5 : width * 0.22)}</div>
          <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.013), color: "#a8a8a8" }}>{data.score ?? "—"}/100 · {data.statusLabel}</span>
        </div>
      </div>
    </div>;
  } else if (tall) {
    main = <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", gap: Math.round(height * 0.04) }}>
      <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.014), color: PINK, letterSpacing: 2 }}>MY LAUNCH SCORED</span>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <span style={{ display: "flex", fontSize: scoreSize, lineHeight: 0.78, letterSpacing: -8, background: CHROME, backgroundClip: "text", color: "transparent" }}>{data.score ?? "—"}</span>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.026), color: "#a8a8a8", margin: "10px 0 0 14px" }}>/100</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex" }}>{progress(data.score, width * 0.4)}</div>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.014), color: PINK, letterSpacing: 2 }}>{data.statusLabel.toUpperCase()}</span>
      </div>
      <span style={{ display: "flex", fontSize: domainSize, color: "#e5e5e5" }}>{data.domain}</span>
      <div style={{ display: "flex", width: "100%", marginTop: height * 0.02 }}>{categoryGrid(data, 2, Math.round(width * 0.015), (width - pad * 2) / 2 - 30)}</div>
    </div>;
  } else {
    main = <div style={{ display: "flex", flex: 1, justifyContent: "space-between", alignItems: "flex-end", position: "relative", gap: 30 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.014), color: PINK, letterSpacing: 2 }}>MY LAUNCH SCORED</span>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <span style={{ display: "flex", fontSize: scoreSize, lineHeight: 0.78, letterSpacing: -9, background: CHROME, backgroundClip: "text", color: "transparent" }}>{data.score ?? "—"}</span>
          <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.021), color: "#a8a8a8", margin: "5px 0 0 16px" }}>/100</span>
        </div>
        <div style={{ display: "flex", width: width * 0.26 }}>{progress(data.score, width * 0.26)}</div>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.round(width * 0.014), color: PINK, letterSpacing: 2 }}>{data.statusLabel.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: width * 0.36 }}>
        <span style={{ display: "flex", fontSize: domainSize, color: "#e5e5e5", textAlign: "right" }}>{data.domain}</span>
        {categoryGrid(data, 2, Math.round(width * 0.013), width * 0.15)}
      </div>
    </div>;
  }

  return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#fff", padding: pad, fontFamily: SANS, position: "relative", overflow: "hidden" }}>
    <div style={{ display: "flex", position: "absolute", top: 0, right: 0, width: tall ? "100%" : "55%", height: "75%", background: "linear-gradient(240deg, rgba(120,20,60,0.35) 0%, rgba(30,5,18,0.5) 45%, rgba(0,0,0,0) 75%)", flexDirection: "column" }} />
    {header}
    {main}
    {footer}
  </div>;
}
