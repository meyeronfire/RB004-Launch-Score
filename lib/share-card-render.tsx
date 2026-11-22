import type { ShareCardData, ShareVariant } from "@/lib/share-card";

// Satori-compatible share card. Flex only, explicit display on every container.
// Visual language matches the site: black field, liquid-chrome ribbon, chrome
// score, hot pink as the only chromatic accent, Inter Display + Geist Mono.
const CHROME = "linear-gradient(174deg,#fff 0%,#d4d4d4 20%,#fff 31%,#acacac 45%,#888 48%,#fff 50%,#f5f5f5 54%,#919191 57%,#c4c4c4 76%,#fff 94%)";
const PINK = "#ff2e7e";
const MONO = "Geist Mono";
const SANS = "Inter Display";
const TRACK = "linear-gradient(90deg,#6e6e6e,#f4f4f4 58%,#ff2e7e)";

type Assets = { data: ShareCardData; variant: ShareVariant; width: number; height: number; logoSrc: string; chromeSrc: string };

function chromeText(value: string | number, fontSize: number, letterSpacing: number) {
  return <span style={{ display: "flex", fontSize, lineHeight: 0.78, letterSpacing, background: CHROME, backgroundClip: "text", color: "transparent" }}>{value}</span>;
}

function scoreReadout(value: number | null, size: number) {
  if (value === null) return <span style={{ display: "flex", justifyContent: "flex-end", minWidth: size * 3.4, fontFamily: MONO, fontSize: size, color: "#9a9a9a" }}>—</span>;
  return <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", minWidth: size * 4.6 }}>
    <span style={{ display: "flex", fontFamily: MONO, fontSize: size, color: "#fff", lineHeight: 1 }}>{value}</span>
    <span style={{ display: "flex", fontFamily: MONO, fontSize: Math.max(11, size - 5), color: "#8d8d8d", lineHeight: 1, margin: "0 0 1px 1px" }}>/100</span>
  </div>;
}

function bar(value: number | null, height: number) {
  const shown = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  return <div style={{ display: "flex", width: "100%", height, background: "#3a3a3a", borderRadius: 99, overflow: "hidden" }}>
    {shown > 0 && <div style={{ display: "flex", width: `${shown}%`, height: "100%", background: TRACK, borderRadius: 99 }} />}
  </div>;
}

function categories(data: ShareCardData, labelSize: number, barHeight: number, gap: number) {
  return <div style={{ display: "flex", flexDirection: "column", gap, width: "100%" }}>
    {data.categories.map((category) => <div key={category.label} style={{ display: "flex", flexDirection: "column", gap: Math.max(6, Math.round(barHeight * 0.7)) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <span style={{ display: "flex", fontSize: labelSize, color: "#f2f2f2", letterSpacing: -0.2 }}>{category.label}</span>
        {scoreReadout(category.value, labelSize)}
      </div>
      {bar(category.value, barHeight)}
    </div>)}
  </div>;
}

function panel(children: React.ReactElement, pad: number) {
  return <div style={{ display: "flex", padding: 1, borderRadius: 22, background: "linear-gradient(155deg, rgba(255,255,255,.62), rgba(255,255,255,.08) 46%, rgba(255,46,126,.72))", width: "100%" }}>
    <div style={{ display: "flex", flexDirection: "column", width: "100%", borderRadius: 21, background: "rgba(0,0,0,.78)", padding: pad }}>
      {children}
    </div>
  </div>;
}

function severityChips(data: ShareCardData, fontSize: number) {
  const chips = (["critical", "high", "medium", "low"] as const).filter((level) => data.severityCounts[level] > 0);
  if (!chips.length) return <div style={{ display: "flex", fontSize, fontFamily: MONO, color: "#bdbdbd" }}>No findings recorded.</div>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
    {chips.map((level) => <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "8px 14px", background: "rgba(255,255,255,.04)" }}>
      <span style={{ display: "flex", fontFamily: MONO, fontSize, color: PINK }}>{data.severityCounts[level]}</span>
      <span style={{ display: "flex", fontFamily: MONO, fontSize: fontSize - 1, color: "#f2f2f2", letterSpacing: 1.2 }}>{level.toUpperCase()}</span>
    </div>)}
  </div>;
}

export function renderShareCard({ data, variant, width, height, logoSrc, chromeSrc }: Assets): React.ReactElement {
  const tall = height > width;
  const pad = tall ? Math.round(width * 0.055) : 36;
  const logo = tall ? 56 : 48;
  const domainSize = Math.max(22, Math.min(tall ? 42 : 34, (tall ? width * 0.8 : 460) / Math.max(data.domain.length * 0.58, 8)));
  const scoreDigits = String(data.score ?? "—").length;
  const scoreSize = tall ? Math.round(width * (scoreDigits >= 3 ? 0.3 : 0.36)) : (scoreDigits >= 3 ? 168 : 204);

  const header = <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Satori needs a self-contained data URI. */}
    <img src={logoSrc} alt="" width={logo} height={logo} style={{ borderRadius: 12 }} />
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span style={{ display: "flex", fontSize: tall ? 32 : 28, letterSpacing: -0.8, color: "#fff" }}>Ready for Real<span style={{ color: PINK }}>.</span></span>
      <span style={{ display: "flex", fontFamily: MONO, fontSize: tall ? 14 : 13, color: "rgba(255,255,255,.58)", letterSpacing: 0.4 }}>Launch Readiness</span>
    </div>
  </div>;

  const footerSize = tall ? 15 : 14;
  const footer = <div style={{ display: "flex", width: "100%", alignItems: "center", borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: tall ? 22 : 16 }}>
    <span style={{ display: "flex", width: "36%", fontFamily: MONO, fontSize: footerSize, color: "#e8e8e8" }}>How ready is your launch?</span>
    <span style={{ display: "flex", width: "36%", justifyContent: "center", fontSize: footerSize, color: "#f5f5f5" }}>Ready for Real · readyforreal.dev</span>
    <span style={{ display: "flex", width: "28%", justifyContent: "flex-end", fontFamily: MONO, fontSize: tall ? 12 : 11, color: "#9a9a9a", letterSpacing: 0.8 }}>SCANNED WITH READY FOR REAL</span>
  </div>;

  const domainBlock = <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <span style={{ display: "flex", fontFamily: MONO, fontSize: tall ? 13 : 12, color: PINK, letterSpacing: 1.8 }}>SCANNED DOMAIN</span>
    <span style={{ display: "flex", fontSize: domainSize, letterSpacing: -0.8, color: "#fff", lineHeight: 1.05 }}>{data.domain || "Unnamed page"}</span>
  </div>;

  let body: React.ReactElement;
  if (variant === "findings") {
    const countSize = tall ? Math.round(width * 0.28) : Math.round(height * 0.42);
    body = <div style={{ display: "flex", flex: 1, flexDirection: tall ? "column" : "row", justifyContent: "space-between", gap: tall ? 36 : 28, alignItems: tall ? "stretch" : "center" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, flex: 1 }}>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: tall ? 16 : 14, color: PINK, letterSpacing: 2.2 }}>{data.hasData ? "THE AUDIT FOUND" : "AUDIT INCOMPLETE"}</span>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {chromeText(data.issueCount, countSize, tall ? -6 : -8)}
          <span style={{ display: "flex", fontFamily: MONO, fontSize: tall ? 22 : 18, color: "#a3a3a3", margin: "14px 0 0 14px" }}>issues</span>
        </div>
        <span style={{ display: "flex", fontSize: tall ? 28 : 24, lineHeight: 1.2, color: "#ececec", maxWidth: tall ? width * 0.8 : 420 }}>between this page and launch.</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          {bar(data.score, 8)}
          <span style={{ display: "flex", fontFamily: MONO, fontSize: 14, color: "#cfcfcf" }}>{data.score ?? "—"}/100 · {data.statusLabel}</span>
        </div>
      </div>
      <div style={{ display: "flex", width: tall ? "100%" : 460 }}>
        {panel(<div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%" }}>
          {domainBlock}
          {severityChips(data, tall ? 18 : 16)}
        </div>, tall ? 32 : 28)}
      </div>
    </div>;
  } else if (tall) {
    body = <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: 15, color: PINK, letterSpacing: 2.4 }}>MY LAUNCH SCORED</span>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {chromeText(data.score ?? "—", scoreSize, -8)}
          <span style={{ display: "flex", fontFamily: MONO, fontSize: 28, color: "#a3a3a3", margin: "12px 0 0 14px" }}>/100</span>
        </div>
        <div style={{ display: "flex", width: width * 0.46 }}>{bar(data.score, 8)}</div>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: 16, color: PINK, letterSpacing: 2.2 }}>{data.statusLabel.toUpperCase()}</span>
      </div>
      {panel(<div style={{ display: "flex", flexDirection: "column", gap: 26, width: "100%" }}>
        {domainBlock}
        {categories(data, 22, 8, 18)}
      </div>, 32)}
    </div>;
  } else {
    body = <div style={{ display: "flex", flex: 1, flexDirection: "row", alignItems: "stretch", gap: 32 }}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 14 }}>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: 14, color: PINK, letterSpacing: 2.4 }}>MY LAUNCH SCORED</span>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {chromeText(data.score ?? "—", scoreSize, scoreDigits >= 3 ? -7 : -9)}
          <span style={{ display: "flex", fontFamily: MONO, fontSize: 24, color: "#a3a3a3", margin: "10px 0 0 12px" }}>/100</span>
        </div>
        <div style={{ display: "flex", width: 360, marginTop: 6 }}>{bar(data.score, 8)}</div>
        <span style={{ display: "flex", fontFamily: MONO, fontSize: 15, color: PINK, letterSpacing: 2.2 }}>{data.statusLabel.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", width: 512 }}>
        {panel(<div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
          {domainBlock}
          {categories(data, 16, 7, 11)}
        </div>, 22)}
      </div>
    </div>;
  }

  const ribbonWidth = tall ? Math.round(width * 1.15) : Math.round(width * 0.78);
  const ribbonHeight = tall ? Math.round(height * 0.5) : Math.round(height * 1.08);

  return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#fff", padding: pad, fontFamily: SANS, position: "relative", overflow: "hidden" }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Satori needs a self-contained data URI. */}
    <img src={chromeSrc} alt="" width={ribbonWidth} height={ribbonHeight} style={{ position: "absolute", top: tall ? -10 : -36, right: tall ? -30 : -8, objectFit: "cover", objectPosition: "right top" }} />
    <div style={{ display: "flex", position: "absolute", top: 0, right: 0, width: tall ? "100%" : "62%", height: tall ? "48%" : "100%", background: "radial-gradient(circle at 88% 18%, rgba(255,46,126,.42), rgba(255,46,126,.08) 36%, rgba(0,0,0,0) 68%)" }} />
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: tall ? "100%" : "58%", height: "100%", background: tall ? "linear-gradient(180deg, rgba(0,0,0,.2) 0%, rgba(0,0,0,.55) 42%, #000 68%)" : "linear-gradient(90deg, #000 0%, #000 58%, rgba(0,0,0,.72) 78%, rgba(0,0,0,0) 100%)" }} />
    <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: tall ? 180 : 110, background: "linear-gradient(180deg, rgba(0,0,0,0), #000 72%)" }} />
    <div style={{ display: "flex", position: "relative", width: "100%" }}>{header}</div>
    <div style={{ display: "flex", position: "relative", flex: 1, width: "100%" }}>{body}</div>
    <div style={{ display: "flex", position: "relative", width: "100%" }}>{footer}</div>
  </div>;
}
