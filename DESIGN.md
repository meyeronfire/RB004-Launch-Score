---
name: RB004 Launch Score
description: Black editorial launch reports with a chrome score and hot pink actions.
colors:
  bg: "#000"
  surface: "#0a0a0a"
  ink: "#fff"
  ink-soft: "rgba(255,255,255,.78)"
  ink-faint: "rgba(255,255,255,.56)"
  accent: "#ff2e7e"
  accent-strong: "#e0186a"
  category-clarity: "#f4c95d"
  category-conversion: "#ff2e7e"
  category-design-brand: "#b99aff"
  category-trust: "#62d9be"
  category-technical: "#70bdff"
  category-security: "#ff745e"
  category-seo-aeo: "#70df9b"
  separator: "rgba(255,255,255,.1)"
typography:
  display:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(54px, 8.4vw, 134px)"
    fontWeight: 560
    lineHeight: 0.92
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(36px, 5.4vw, 72px)"
    fontWeight: 540
    lineHeight: 0.98
    letterSpacing: "-.04em"
  title:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(23px, 3vw, 36px)"
    fontWeight: 520
    lineHeight: 1.08
    letterSpacing: "-.035em"
  body:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist Mono Variable, SFMono-Regular, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "normal"
    letterSpacing: ".04em"
  score:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(160px, 24vw, 292px)"
    fontWeight: 560
    lineHeight: 0.73
    letterSpacing: "-.04em"
  prompt:
    fontFamily: "Geist Mono Variable, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
spacing:
  gap-small: "12px"
  inline: "20px"
  gap: "24px"
  section-title: "42px"
components:
  button-scan:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    padding: "0 20px"
    height: "48px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    padding: "0 20px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  scan-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "64px"
  navigation:
    textColor: "{colors.ink-faint}"
    typography: "{typography.label}"
  score-display:
    typography: "{typography.score}"
  category-reading:
    textColor: "{colors.ink}"
    height: "44px"
  tool-tabs:
    textColor: "{colors.ink-soft}"
    padding: "0 14px"
    height: "44px"
  prompt-output:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.prompt}"
    padding: "clamp(20px, 4vw, 40px)"
---

# Design System: RB004 Launch Score

## Overview

**Creative North Star: "The Pinned Regular Basis Editorial World"**

A black editorial canvas gives the page its structure through scale, whitespace, and fine horizontal rules. Inter Display carries both headlines and prose; Geist Mono identifies measurements, provenance, release information, and tool output. Hot pink remains the action color; category colors create consistent wayfinding across score and finding evidence.

The score is the material signature: monochrome reflection bands clipped to large numerals, accompanied by a restrained pink marker. Supporting content remains flat and sparse. Rendered website captures retain their own source colors; those colors do not expand the RB004 interface palette.

**Key Characteristics:**

- Unframed, left-aligned editorial sections.
- Monochrome chrome scores with hot pink actions and readings.
- Underline fields and flat rectangular controls.
- Readable provenance, coverage, and unknown states.

## Colors

The interface uses hot pink for actions against black, with a controlled white hierarchy and a limited category palette for report navigation. The frontmatter records applied reusable values; category colors are data roles, not decorative surfaces. Sidecar tonal ramps are synthesized OKLCH previews, not additional shipped interface colors; alpha colors keep their frontmatter values.

### Primary

- **Hot Pink** (`accent`): submit and unlock actions, focused fields, and the score marker.
- **Deep Hot Pink** (`accent-strong`): primary button hover.

### Category Data Roles

Use the category accent consistently for its report ring, score bar, finding label, and evidence section: clarity (`category-clarity`), conversion (`category-conversion`), design & brand (`category-design-brand`), trust (`category-trust`), technical (`category-technical`), security (`category-security`), and SEO/AEO (`category-seo-aeo`). Labels and scores remain visible so color is never the only signal.

### Neutral

- **Black** (`bg`): page canvas and primary action text.
- **Near Black** (`surface`): example report panel and prompt output.
- **White** (`ink`): principal headings, fields, and readings.
- **Soft White** (`ink-soft`): explanatory prose and interactive secondary text.
- **Faint White** (`ink-faint`): metadata, captions, coverage, and footer text.
- **Hairline White** (`separator`): repeated editorial and report row dividers. Section boundaries also use lower-opacity white rules.

### Named Rules

**The Action and Category Rule.** Reserve hot pink for actions and focus. Use the mapped category color only for data-linked rings, bars, finding labels, and section wayfinding; keep surfaces black and editorial.

## Typography

**Display and Body Font:** Inter Display, with Inter Variable, Inter, and sans-serif fallbacks.
**Label/Mono Font:** Geist Mono Variable, with SFMono-Regular and monospace fallbacks.

The type is tightly spaced and large for headings, quieter and generously led for prose, and precise for data. The body currently shares the display stack; importing Inter Variable does not assign it a separate body role. The supplied normal and italic Inter Display faces declare weight 500. The frontmatter records CSS-requested role weights, not a claim that separate 400–650 Display font files exist.

### Hierarchy

- **Display:** landing question; mobile overrides it to `clamp(49px, 14vw, 92px)` at 720px and below.
- **Headline:** report section headings. Landing editorial headings use `clamp(38px, 6vw, 82px)` with the same tight spacing.
- **Title:** finding titles. Report summary titles use `clamp(28px, 3vw, 44px)` and line-height 1.05.
- **Body:** global prose; contextual explanatory text ranges from 13–20px. Paragraph measures generally span 46–68ch.
- **Label:** release, provenance, and metadata; actual data roles range from 10–16px. Mono numeric readings use tabular figures.
- **Score:** report numeral; at 760px and below it becomes `clamp(150px, 50vw, 220px)`. The landing example has its own `clamp(110px, 19vw, 248px)` scale.
- **Prompt:** scrollable tool output with preserved whitespace and word wrapping.

### Named Rules

**The Measurement Voice Rule.** Use Geist Mono for data and provenance; use the Inter Display stack for headings and explanatory prose.

## Layout

The shared container is `min(100% - 2 * var(--pad), 1560px)` with automatic inline margins. The applied desktop gutter is `max(24px, calc((100vw - 1560px) / 2))`; preserve this expression when extending the existing layout. The gutter becomes 22px at 720px and below.

Landing hero, editorial headers, example panel, and report hero use twelve-column grids with asymmetric spans. The landing question occupies columns 1–10; editorial headings and supporting copy separate across the grid. Report score and summary occupy opposite halves, with categories and share controls below. Landing sections use fluid vertical space (`clamp(96px, 14vw, 190px)`); report sections use (`clamp(72px, 10vw, 130px)`). Rows and fine rules provide structure without individual cards.

At 760px and below, report score, summary, categories, share controls, captures, email fields, and copy drafts stack. At 720px and below, landing headers, checks, example, pricing, and footer stack. The desktop capture pairs with a 280px mobile column; both become full-width stacked figures on small screens. Preserve the coverage note within the score overview rather than assigning it an implicit grid cell.

## Elevation & Depth

Ordinary sections and controls are flat. Near-black fills separate the example and prompt output; thin white rules divide content. Depth comes from monochrome chrome reflections clipped into score text, not raised card shadows. The gradient is an explicitly authorized material exception, repeated in the share card.

### Shadow Vocabulary

- **Live status glow** (`0 0 12px rgba(255,46,126,.45)`): the small active scanning dot.
- **Score marker glow** (`0 0 18px rgba(255,46,126,.35)`): the short pink rule beneath the score.

### Named Rules

**The Chrome Score Rule.** Reserve metallic reflection gradients for score numerals. Keep ordinary surfaces flat; the small score marker and live status dot may glow.

## Shapes

The system is rectangular and unframed: flat primary buttons, open editorial rows, straight underlines, and unrounded screenshot/output panels. The active status dot is circular (50% radius, 8px square). The score marker is a narrow horizontal rectangle (68px by 4px); the exported card uses a 54px by 4px marker. No rounded card vocabulary is established.

## Components

### Buttons

Pink rectangular buttons use black text. The scan action has a 48px minimum height; report primary actions have a 50px minimum. The frontmatter's heights represent these minimums, not fixed clipping bounds. Both use 20px inline padding, 14px text, and requested weight 650. Hover changes to deep hot pink over .2s ease; the scan button also rises 1px. Report primary actions dim to opacity .6 with a wait cursor while disabled. Global keyboard focus uses a 2px accent outline offset by 5px.

### Inputs / Fields

The URL field is transparent and joins its action above a single soft-white underline. Focus within the form changes that underline to pink. The desktop field is 64px tall, with text `clamp(18px, 2vw, 24px)`; mobile uses 58px and 17px text. Email forms repeat the transparent underline treatment with 54px inputs and 44px actions. Errors use pink text and status messages remain in normal document flow.

### Navigation

The compact release mark is pink mono beside a white product name. A faint mono release descriptor balances it across the masthead. Footer links are plain text, turn white on hover, and retain 44px minimum targets. They wrap on small screens; the footer itself stacks.

### Containers and Editorial Rows

The example panel and prompt output use near-black fills without outlines or rounded corners. Checks and findings use a narrow index column, heading, and prose separated by horizontal rules. The mobile check copy sits below its title; findings retain a smaller 38px index column. Preserve the distinct example provenance and measured-check notes.

### Score and Category Readings

The chrome numeral uses the exact reflection sequence recorded in the sidecar, transparent text fill, background clipping, and tabular numerals. A faint mono denominator sits above its baseline, while the pink marker anchors it below. Category tracks are 2px lines tinted to their category role with right-aligned mono values. The score counts in over 650ms using a quartic ease-out; reduced-motion preference skips counting. The active scan dot pulses over 1.5s; reduced-motion CSS stops it.

### Tool Tabs and Prompt Output

Tool tabs use transparent backgrounds and plain text with 44px minimum targets. Selection changes to pink with an underline offset 8px. Arrow keys, Home, and End move selection. The output panel uses the mono prompt role, fluid padding, a 520px maximum height, and scrolling.

## Do's and Don'ts

### Do:

- Do preserve black space, large left-aligned type, and horizontal section rules.
- Do keep provenance and unavailable-check notes readable beside the results they qualify.
- Do use the supplied Inter Display and Geist Mono files for exported score graphics.
- Do preserve visible pink focus outlines, keyboard tabs, 44px control targets, and reduced-motion behavior.

### Don't:

- Don't introduce additional interface hues or borrow the captured website’s palette.
- Don't replace editorial rows with gray outlined card grids, inflated radii, or decorative icon tiles.
- Don't flatten the chrome score to white or spread its reflection gradient into backgrounds.
- Don't invent proof, measured values, or availability to fill a visual gap.

Not canonized: the progress history's CSS-generated checkmark is an incumbent glyph-icon defect, not a reusable icon style. No UI repair is included in this documentation pass. Paid-state captures demonstrate mocked presentation; they do not certify production checkout, email, or provider delivery.
