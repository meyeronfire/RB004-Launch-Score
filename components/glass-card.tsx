import type { CSSProperties, ElementType, ReactNode } from "react";

type GlassCardProps = {
  as?: ElementType;
  className?: string;
  shellClassName?: string;
  accent?: boolean;
  glow?: boolean;
  children: ReactNode;
  href?: string;
  id?: string;
  style?: CSSProperties;
  "data-category"?: string;
  "aria-label"?: string;
};

export function GlassCard({ as: Component = "div", className = "", shellClassName = "", accent = false, glow = true, children, href, id, style, "data-category": dataCategory, "aria-label": ariaLabel }: GlassCardProps) {
  const shell = ["glass-shell", glow ? "glass-shell--glow" : "", shellClassName].filter(Boolean).join(" ");
  const card = ["glass-card", accent ? "glass-card--accent" : "", className].filter(Boolean).join(" ");
  return <div className={shell}><Component id={id} className={card} href={href} style={style} data-category={dataCategory} aria-label={ariaLabel}>{children}</Component></div>;
}
