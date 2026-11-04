// Liquid-chrome ribbon built in SVG: layered flowing paths with a metallic
// gradient and a pink edge light. Decorative only; hidden from assistive tech.
export function ChromeRibbon({ className = "" }: { className?: string }) {
  return <svg className={`chrome-ribbon ${className}`} viewBox="0 0 720 980" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="chrome-ink" x1="80" y1="0" x2="640" y2="980" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fafafa"/>
        <stop offset=".18" stopColor="#8f8f96"/>
        <stop offset=".34" stopColor="#ffffff"/>
        <stop offset=".5" stopColor="#5d5d66"/>
        <stop offset=".62" stopColor="#ffd3e4"/>
        <stop offset=".74" stopColor="#ff2d8b"/>
        <stop offset=".84" stopColor="#8c1039"/>
        <stop offset="1" stopColor="#2b2b30"/>
      </linearGradient>
      <linearGradient id="chrome-edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".95"/>
        <stop offset=".55" stopColor="#ff9ec4" stopOpacity=".8"/>
        <stop offset="1" stopColor="#ff2d8b" stopOpacity=".9"/>
      </linearGradient>
      <linearGradient id="chrome-soft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e8e8ee" stopOpacity=".5"/>
        <stop offset="1" stopColor="#ff2d8b" stopOpacity=".25"/>
      </linearGradient>
    </defs>
    <path d="M212 0C148 132 210 205 344 258C494 317 590 398 556 520C528 622 388 668 322 742C270 800 268 884 336 980"
      stroke="url(#chrome-soft)" strokeWidth="58" strokeLinecap="round" opacity=".5"/>
    <path d="M262 -40C210 96 296 178 418 236C560 303 648 396 610 512C578 610 430 654 366 730C316 790 318 886 392 990"
      stroke="url(#chrome-ink)" strokeWidth="46" strokeLinecap="round"/>
    <path d="M262 -40C210 96 296 178 418 236C560 303 648 396 610 512C578 610 430 654 366 730C316 790 318 886 392 990"
      stroke="url(#chrome-edge)" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
    <path d="M470 -60C430 70 500 150 606 210C716 272 786 356 760 460" stroke="url(#chrome-ink)" strokeWidth="18" strokeLinecap="round" opacity=".65"/>
  </svg>;
}
