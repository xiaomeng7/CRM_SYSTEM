# Porsche Consulting–style redesign — summary

## Overview
Landing page restyled to feel like a boutique consulting firm homepage: minimal typography, large whitespace, thin dividers, card-based sections. Form fields, IDs, names, JSON payload, and `/api/apply-advisory` logic are unchanged.

---

## index.html

**Header**
- Clean nav: brand left (“Better Home Technology”), phone + “Request Advisory Review” button right. Button scrolls to `#request-review`.

**Hero (Porsche-style rhythm)**
- Kicker: “Energy Decision Advisory — Adelaide Pilot Round”
- H1 split into two lines: “Before You Spend $20,000+ on Solar or Battery.” / “Get an Independent Written Opinion.”
- Subline unchanged (in writing)
- Scroll indicator: CSS chevron below hero

**Trust strip**
- Moved **below** hero (inside main). Thin top/bottom borders, centred items: Independent · No commission · Written recommendation · Adelaide-based. Wraps on mobile. No overlap with header; hero has top padding for fixed header.

**In Focus**
- Section label: “In Focus”
- Three cards: “Sales projections vs real modelling”, “Tariffs & export constraints”, “Battery lifecycle & payback reality”, each with 1–2 sentence advisory copy.

**What you receive**
- Section label: “What you receive”
- Two-column layout: left = short outcome paragraph (“decision clarity you can take to any installer…”); right = bullet list (Written PDF, go/no-go battery, load profile, tariff review, 45-min call, next-step guidance).

**Trust line**
- Single divider section with one sentence: advisory firm, no sales/commission/upsell.

**Pricing**
- $690 primary (large, dark), $990 struck-through and muted, “Limited advisory capacity” badge (neutral, not red). “Adelaide Pilot Round” note below.

**Who it’s for / not for**
- Unchanged copy.

**How it works**
- Four step cards with large circular number badges (48–56px), strong title, muted description. Same copy (Apply, Review, Payment link, Booking). Added `.step-content` wrapper for layout.

**FAQ**
- Existing FAQs kept; “Are you affiliated with any solar installer?” with “No. We do not receive commissions…” answer.

**Form**
- Title “Request Advisory Review”, line “We typically respond within 1 business day.” Form fields, names, IDs, and submit logic unchanged. Premium-style inputs (larger, focus states, error styling).

---

## styles.css

**Design system**
- Max-width ~1100px, section padding 5rem desktop / 3rem mobile. Thin 1px dividers between major sections. System font stack. Grayscale + black accent (no red/promo colours). Variables: `--space-desktop`, `--space-mobile`, `--max-width`, `--header-height`.

**Header**
- Fixed height, fixed on scroll. Brand + `.header-right` (phone, CTA). `.site-header--static` for thank-you page (no fixed positioning).

**Hero**
- Top padding clears fixed header. Kicker uppercase, letter-spacing. Two-line H1 with `.hero-line` block. Chevron animation (bounce).

**Trust strip**
- Below hero, in flow. Border-top/bottom, card background, centred items with dot separators.

**Sections**
- `.section-label` for small caps labels (“In Focus”, “What you receive”, etc.). Consistent section padding and border-bottom.

**In Focus**
- Three-column grid of cards; border, shadow, heading + short paragraph.

**What delivers**
- Two-column grid (intro paragraph | bullet list). Stacks on mobile.

**Pricing**
- Prominent block: large $690, struck-through $990, neutral badge, soft shadow.

**Steps**
- Four-column grid, each step = flex row (circular number + `.step-content`). Number 3.5rem (56px), high contrast. Responsive: 4 → 2 → 1 columns.

**Form**
- Larger inputs, clear focus ring (black), error message styling. Button black, no promo colour.

**Thank-you**
- Same container/typography. `.site-header--static + main .thank-you` reduces top padding when header is not fixed.

---

## thank-you.html

- Same design system (styles.css). Header with brand (links to /) and phone; `.site-header--static` so no fixed overlap.
- Title: “Application received.”
- Body: “We will review your request and contact you to arrange payment and booking. If you need to reach us sooner, call 0493 208 540.”
- “Back to main page” button (`.btn-back`).

---

## Unchanged

- All form `name`, `id`, and JSON keys in the submit payload.
- JS: `getUtm()`, fetch to `/api/apply-advisory`, redirect to `/thank-you.html`, button label reset.
- No new frameworks; pure HTML/CSS and existing minimal JS.
