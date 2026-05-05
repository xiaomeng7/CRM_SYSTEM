# Marketing Strategy — 2026

This document captures BHT Revenue OS's marketing and sales strategy for the current cycle (2026 Q2 onward). It is the source of truth for target-customer prioritization, channel allocation, and positioning decisions. Update when market conditions or business priorities change. See `docs/architecture-overview.md` for the technical counterpart.

## Macro Context

The Australian economy is in a K-shaped cycle. Mid-to-low income households are squeezed by elevated mortgage stress, energy costs, rent, and food prices, with discretionary spend compressed. High-net-worth households remain relatively unaffected — asset-side gains in property and equities continue, debt-side exposure to interest rates is small, and behavior shifts toward "flight to quality" upgrades.

This divergence is most visible in residential construction: volume builders are struggling while luxury custom builders (Vogue, Beechwood, Duo, Rendition, etc.) remain busy. **BHT's positioning leans into this divergence rather than fights it.**

## Positioning

> **"Adelaide's Smart Home & Premium Electrical Specialists"**
>
> Builder partnerships, luxury home integration, pre-purchase peace of mind.

We are NOT a commodity electrician for the broad B2C market — that segment is dominated by RCG Electrical and others with deeper pricing/volume advantages. We narrow to:

1. **Smart home design and integration** for new luxury builds (B2B via builders/designers)
2. **Pre-purchase electrical inspection** for property buyers (B2C, fastest-converting funnel)
3. **Independent honest advisory** as the brand voice, carried over from Energy Decision Advisory

The "tell you when NOT to spend money" honesty positioning is our core brand differentiator versus sales-driven sparkies.

## Target Customer Tiers

### Tier 1 — Active investment

| Segment | Ticket size | Sales motion | Channels |
|---|---|---|---|
| **Pre-purchase inspection buyers (B2C)** | $400-$600 / job | Automated funnel: form → SMS → quote → book | Google SEO, real estate agent referral, buyer's agent referral, Hipages |
| **Luxury home builders / designers (B2B)** | $30K+ / project | 1-on-1 BD: coffee meetings, vendor short-list | Referral network (architects, interior designers, builders), portfolio site, no Hipages |
| **Repeat customers + word-of-mouth** | Variable | Lifecycle SMS / email | CRM-driven (apps/crm) |

### Tier 2 — Maintain only

| Segment | Notes |
|---|---|
| Switchboard / mandatory compliance upgrades | Demand is law-driven; no proactive marketing needed |
| Existing Hipages / Google Business inquiries | Maintain response speed; don't increase ad spend |

### Tier 3 — Do not invest in 2026

| Segment | Reason |
|---|---|
| B2C smart home retrofit (existing homes) | Discretionary spend; recession-sensitive |
| Small residential repairs (commodity) | Price war attracts low-margin comparison shoppers |
| NDIS / mmWave radar | Slow burn only — see "NDIS" section below |
| Mandarin-speaking customers (main site) | Future via WeChat mini-program |
| Property management B2B (rental safety) | Volume too small to justify proactive BD |

## NDIS / mmWave Radar Position

Structurally bullish over a 5-year horizon: aging population, NDIS budget, aged care expansion. mmWave radar's privacy and compliance advantages over cameras and wearables are real.

Short-term (12 months): NDIS budget tightening + long OT (Occupational Therapist) specifier cycle — accreditation + pilot + referral typically 6-12 months — mean no near-term cash flow.

**Action — slow-burn investment only**:

- Build relationship with one local OT
- Secure one pilot installation (free if needed) and document it
- Write one case study
- **Do not allocate marketing budget** — paid traffic is inefficient for NDIS decision paths
- Re-evaluate in 12-18 months: if a referral pipeline exists, scale; if not, accept sunk cost and exit

## Channel Strategy by Tier 1 Segment

### Pre-purchase Inspection (B2C funnel)

- **Hub site**: `/pre-purchase-inspection` landing page optimized for conversion
- **SEO**: target "pre-purchase electrical inspection Adelaide" + suburb-level long-tails
- **Partnerships**: outreach to real estate agents, buyer's agents, conveyancers — they refer pre-settlement
- **Paid**: Google Search ads on high-intent inspection keywords (NOT broad "Adelaide electrician")
- **Conversion KPIs**: form-to-booking rate, days-to-completion, NPS

### Luxury Home Builder Partnerships (B2B)

- **Hub site**: `/for-builders` + `/portfolio` — visual-first, premium tone, case studies
- **No paid advertising** — referral network only
- **BD motion**: maintain a list of 20-30 Adelaide luxury builders + interior designers + architects → quarterly outreach (coffee, lunch, project tour)
- **Conversion KPIs**: vendor short-list inclusions, project pitches, project wins (annual)

## What Not to Do

- **Do not** position as a generic "Adelaide electrician" — RCG and others occupy that lane and we cannot win on volume/price
- **Do not** invest paid media in B2C smart home retrofit during the current cycle
- **Do not** push NDIS revenue targets in 2026 — let it compound slowly
- **Do not** mix the luxury-B2B funnel with the B2C-inspection funnel — they need separate creative, separate landing pages, separate sales motion
- **Do not** run main-site bilingual EN/ZH — defer to a WeChat mini-program when timing is right

## Inputs to Revisit Quarterly

- Hipages average lead price + close rate
- Google Search Console: ranking positions for target keywords
- Pre-purchase inspection: bookings/month, form-submission → booking rate
- Builder BD: vendor short-list inclusions, meetings per month
- RBA cash rate, consumer confidence trends (ANZ-Roy Morgan)
- Luxury new-build approvals in SA (Planning SA / ABS data)

## Related Docs

- `docs/architecture-overview.md` — technical architecture and deployment boundaries
- `docs/repo-structure.md` — monorepo layout
- `apps/web/landing-page/README.md` — Energy Decision Advisory landing
- `docs/brand-brief.md` (planned) — brand identity (mission, tone, visual language)

---

*Last updated: 2026-05-01. Owner: Marketing/Sales Manager (currently CEO + Claude).*
