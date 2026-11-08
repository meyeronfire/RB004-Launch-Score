---
name: VERDKT RB004
description: Evidence-led launch reports in black, chrome, and restrained hot pink.
colors:
  bg: "#090909"
  surface: "#111111"
  elevated: "#181818"
  ink: "#F5F5F5"
  ink-soft: "#C2C2C2"
  ink-faint: "#A2A2A2"
  line: "#303030"
  accent: "#FF2E7E"
  accent-strong: "#E91D6C"
typography:
  display:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(30px, 4vw, 48px)"
    fontWeight: 560
    lineHeight: 1.04
    letterSpacing: "-.035em"
  headline:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(24px, 3vw, 34px)"
    fontWeight: 520
    lineHeight: 1.1
    letterSpacing: "-.035em"
  title:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "clamp(22px, 3vw, 32px)"
    fontWeight: 520
    lineHeight: 1.13
    letterSpacing: "-.025em"
  body:
    fontFamily: "Inter Display, Inter Variable, Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Geist Mono Variable, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: ".035em"
rounded:
  chip: "999px"
  card: "14px"
  score-card: "16px"
  action: "8px"
spacing:
  card-inset: "clamp(22px, 3.3vw, 36px)"
  section-inset: "clamp(42px, 6vw, 76px)"
  section-gap: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.action}"
    padding: "0 18px"
    height: "48px"
  report-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-inset}"
---

# Design System: VERDKT RB004

## Overview

**Creative North Star: "The Evidence Ledger"**

VERDKT presents a launch-page audit as a legible record: a contained score and verdict lead into prioritized findings, expandable category ledgers, and source evidence. Black surfaces, careful type hierarchy, and fine neutral rules keep attention on what the scan actually recorded. The report is compact and structured without turning into a dashboard grid.

Inter Display carries findings and explanation; Geist Mono marks measurements, status, and provenance. Chrome is reserved for the score. Hot pink is the sole chromatic interface accent and marks primary actions, selected emphasis, and category tracks. The existing Regular Basis and VERDKT identity remains part of the product; captured third-party pages retain their own colors as evidence.

**Key Characteristics:**

- Contained, restrained score with a chrome numeral.
- Neutral bordered cards and open category rows.
- Pink-only interface emphasis; readable state words accompany color.
- Progressive disclosure keeps ledger and technical detail available.

## Colors

### Primary

- **Hot Pink** (`accent`): primary actions, focus, selection, and category track fill.
- **Deep Hot Pink** (`accent-strong`): hover treatment for primary actions.

### Neutral

- **Near Black** (`bg`): page canvas and dark action text.
- **Surface Black** (`surface`): score and finding card fill.
- **Elevated Black** (`elevated`): secondary action surface.
- **Soft White** (`ink`): principal text.
- **Readable Grey** (`ink-soft`): supporting explanation and controls.
- **Quiet Grey** (`ink-faint`): metadata and captions.
- **Rule Grey** (`line`): separators, card borders, and neutral score tracks.

Category labels and results use a shared pink accent rather than a different hue for each scoring category. Result wording remains explicit; color does not carry status alone.

**The Single Accent Rule.** Keep interface color to hot pink and neutrals; colors in genuine captured sites are evidence, not VERDKT tokens.

## Typography

- **Display** (560, responsive 30–48px, 1.04 line-height): Inter Display stack for the report verdict.
- **Headline** (520, responsive 24–34px): section headings.
- **Title** (520, responsive 22–32px): finding titles, with room to wrap long copy.
- **Body** (400, 15px, 1.65 line-height): explanation and evidence summaries.
- **Label** (400, 12px, 1.5 line-height, mono): result metadata and scan provenance. Smaller 10–11px metadata appears in denser ledger regions.

The display stack is `Inter Display, Inter Variable, Inter, sans-serif`; the mono stack is `Geist Mono Variable, SFMono-Regular, monospace`. Numeric readings use tabular figures where specified.

**The Finding-First Rule.** Give the plain-language finding title visual priority; status, severity, rule identifiers, and scoring detail follow it.

## Layout

The report is centered in a maximum 1180px content width with 24px desktop gutters and 18px gutters at 720px and below (14px below 360px). The opening score and verdict form a balanced two-column layout, then stack to one column on narrow screens. The score numeral scales against its own card container rather than the viewport.

Sections use responsive vertical padding (`clamp(42px, 6vw, 76px)`) and a fine top rule. Findings are contained cards; categories remain full-width disclosure rows. Category rows show name, score, neutral track with pink fill, separate issue/review context, and an expansion affordance. Mobile rearranges these into stacked rows. Missing category scores display “Unavailable” without a numeric denominator or filled track.

The reading path is summary, prioritized findings, category overview and ledger, page/performance evidence, methodology, and paid continuation. Expandable details expose scan coverage, technical evidence, and scoring information without crowding the first view.

## Elevation & Depth

The report uses modest tonal surfaces and borders, with a restrained shadow under the score card. The chrome reflection gradient belongs to the score numeral only. Evidence rows and category ledgers use separators instead of shadows. No report glow is needed for emphasis.

### Shadow Vocabulary

- **Score card** (`0 20px 48px rgba(0,0,0,.24)`): separates the opening score container from the page canvas.

**The Chrome Score Rule.** Keep metallic reflections inside the contained score numeral; ordinary content remains neutral and readable.

## Shapes

Cards use moderately rounded corners (14px); the score overview uses a slightly softer 16px radius and primary actions use 8px. Category and evidence rows remain square-edged and separated by thin rules. Compact status chips are pill-shaped (999px). These distinct shapes identify component roles rather than rounding every surface uniformly.

## Components

### Buttons

Primary actions use hot pink, dark text, and a rounded rectangle (8px) with a 48px minimum height and 18px horizontal padding. Hover lightens the pink; keyboard focus uses a visible 2px pink outline offset by 4px. Secondary prompt actions use an elevated dark surface and neutral border. Controls and evidence links keep at least 44px touch height where defined.

### Cards / Containers

The score overview and findings use near-black fills, neutral borders, and moderate corners. The score overview has 16px corners and responsive padding; findings use 14px corners with `clamp(22px, 3.3vw, 36px)` padding. Category details are not placed in nested card grids.

### Inputs / Fields

The landing URL field remains an open transparent field with a bottom rule; focus changes that rule to pink. The redesign documents the report system while preserving this existing landing interaction.

### Navigation

The existing masthead retains the Regular Basis release mark, VERDKT name, and subdued release metadata. The redesign does not replace the established brand signature.

### Score Overview

The score is a chrome numeral sized using container query units and paired with a small `/100` denominator. A subdued completion label, coverage explanation, and expandable scan details qualify the result. Unknown measurements remain unavailable rather than being converted into zero.

### Finding Card

The reusable finding card leads with title, then category, result state, and severity. It separates why it matters, observed evidence, and next step; optional evidence links point to captured renders. A native disclosure contains technical evidence and scoring details.

### Category Row

Each native details row presents category, recorded score when available, a neutral track with pink fill, and separate issue/review/unknown context. Expansion retains category findings and check results. An unrecorded score has no numeric scale or filled indicator.

**The Evidence State Rule.** Distinguish confirmed issues from review and unknown states in text, and preserve their evidence inside the expanded ledger.

## Do's and Don'ts

### Do:

- **Do** keep the score inside its card and size it against that container.
- **Do** use pink for focused actions and category tracks, with neutral tracks and explicit labels.
- **Do** preserve category results, check records, measurements, and methodology in progressive disclosures.
- **Do** show unavailable scores and metrics as unavailable.
- **Do** retain the masthead identity and original colors in captured website evidence.

### Don't:

- **Don't** use rainbow category colors or colored semantic states across the report.
- **Don't** use oversized free-floating score numerals or rely on clipping to fit them.
- **Don't** treat a completed scan as proof that every check passed.
- **Don't** turn missing evidence into a confirmed failure or an invented measurement.

Not canonized: older report rules for seven colored category accents, a monumental score outside a container, and unframed findings are superseded by the final report CSS. The checkmark generated from text in the legacy progress history remains a glyph-icon defect and is not a reusable icon rule. The final production rebuild has been recaptured in `.impeccable/review/desktop.png` and `mobile.png`; focused 390px captures cover tap-target guidance, unavailable category scores, and supplemental checks. Browser results record 29 viewport rows with zero overflow or browser errors, including unavailable score labels and Top 3 mobile evidence navigation. The example captures are labeled example report, not a live audit. No real payment or provider-flow claim is made by this visual system document.
