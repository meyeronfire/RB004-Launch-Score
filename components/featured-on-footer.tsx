/**
 * Pre-listing directory badges. Append an official snippet here only after
 * that directory issues a real href (and artwork). Do not invent slugs for
 * Neeed, ToolTrove, HUNT0, or yourhack.
 *
 * Dark artwork is the official dark variant for this black footer. href, alt,
 * and rel stay as documented. SeeWhatNewAI keeps rel="nofollow noopener".
 * Twelve Tools, DeepLaunch, and LLM Relevance have no official rel; the link
 * adds rel="noopener" only, because target is _blank. ShowMeBestAI's supplied
 * snippet intentionally has no rel attribute. Do not add nofollow to followed links.
 */
const BADGES: {
  href: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  rel?: string | null;
  ariaLabel?: string;
}[] = [
  {
    href: "https://twelve.tools",
    src: "https://twelve.tools/badge0-dark.svg",
    alt: "Featured on Twelve Tools",
    width: 200,
    height: 54,
  },
  {
    href: "https://deeplaunch.io",
    src: "https://deeplaunch.io/badge/badge_dark.svg",
    alt: "Featured on DeepLaunch.io",
    width: 153,
    height: 44,
  },
  {
    href: "https://www.seewhatnewai.com/",
    src: "https://www.seewhatnewai.com/badges/listed-dark.svg",
    alt: "Listed on SeeWhatNewAI",
    width: 224,
    height: 64,
    rel: "nofollow noopener",
  },
  {
    href: "https://www.llmrelevance.com",
    src: "https://www.llmrelevance.com/badges/llm-relevance-horizontal-dark.svg",
    alt: "LLM Relevance",
    width: 154,
    height: 44,
    ariaLabel: "LLM Relevance - AI & SEO Tools for Small Business",
  },
  {
    href: "https://www.toolpilot.ai",
    src: "https://www.toolpilot.ai/cdn/shop/files/f-b.png?v=1695882701",
    alt: "Featured on ToolPilot",
    width: 300,
    height: 66,
    rel: "noopener",
  },
  {
    href: "https://showmebest.ai",
    src: "https://showmebest.ai/badge/feature-badge-white.webp",
    alt: "Featured on ShowMeBestAI",
    width: 220,
    height: 60,
    rel: null,
  },
];

export function FeaturedOnFooter() {
  return (
    <section className="featured-on" aria-label="Featured on">
      <p className="featured-on-label">Featured on</p>
      <ul className="featured-on-list">
        {BADGES.map((badge) => (
          <li key={badge.href}>
            <a href={badge.href} target="_blank" rel={badge.rel === null ? undefined : badge.rel ?? "noopener"} aria-label={badge.ariaLabel}>
              {/* Official badge URLs must stay in the HTML for directory crawlers. next/image would rewrite src. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badge.src} alt={badge.alt} width={badge.width} height={badge.height} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
