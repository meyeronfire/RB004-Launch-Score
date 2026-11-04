// Liquid-chrome hero artwork (photoreal render on pure black) as a full-bleed
// hero background. Decorative only; hidden from assistive tech.
export function ChromeRibbon({ className = "" }: { className?: string }) {
  return <img className={`chrome-ribbon ${className}`} src="/hero-chrome.png" alt="" aria-hidden="true" draggable={false} />;
}
