import type { ReactNode } from "react";
import { RELEASE_CODE } from "@/config/release";
import { FeaturedOnFooter } from "@/components/featured-on-footer";

export function SiteFooter({ navLabel, children }: { navLabel: string; children: ReactNode }) {
  return (
    <footer className="wrap footer">
      <FeaturedOnFooter />
      <div className="footer-bar">
        <span>{RELEASE_CODE} — A Regular Basis release. Berlin.</span>
        <nav className="footer-links" aria-label={navLabel}>{children}</nav>
      </div>
    </footer>
  );
}
