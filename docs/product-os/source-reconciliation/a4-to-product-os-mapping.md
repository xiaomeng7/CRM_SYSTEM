# A4 Approved Content → Product OS Mapping

- Date: 2026-07-18
- Phase: 2 (read-only)
- Primary mapping analysis: `docs/product-os/source/A4_Content_Mapping_Review_V1.md`  
  SHA-256 `a68587aadff15df830b570ee5d83a30db7c3e1b398623980455e217c663b77a8`
- Presentation reference: `docs/product-os/source/Better_Home_Collections_A4_Review_Set_V1.pdf`  
  SHA-256 `f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8`  
  (12 pages, six Collections — cited via the Markdown review; PDF not rewritten)
- Product facts workbook: V2.07 xlsx (immutable)
- Rule: Do not substantially rewrite approved A4 copy; do not convert page-expression into product facts.

Language tags: **PF** Product Fact | **CC** Customer Content | **TC** Technical Content | **PC** Presentation Configuration

Can generate today? **Ready / Partial / Missing / Conflict** (from A4 review + workbook verification)

---

## Global A4 findings (all six Collections)

| Element | Approved source | Layer | V2.07 can generate? | Current field | Proposed V2 | Risk / Issue |
|---|---|---|---|---|---|---|
| Hierarchy navigation | A4 PDF (Collection highlighted) | PC | Partial | Hardcoded | layout + product_type | ISSUE-018 |
| Footer company / page | A4 PDF | CC/PC | Partial | 14 Footer + hardcoded | global content + footer_configs | ISSUE-016 |
| Footer version | A4 shows **V2.06** | PF/PC | Conflict | Master Version `2.06`; file V2.07 | `releases.release_code` | ISSUE-005 |
| Theme colour | Unified green on A4 | PC | Conflict | 17 product accents | channel theme tokens | ISSUE-006 |
| Hero image | Reviewed PDF crop | PC | Partial | 16 generic path | image_assets + crops | ISSUE-007 |
| Price display “installed incl GST” | A4 | PF/PC | Partial | 10 numeric only | product_prices + display modes | ISSUE-012 |
| Expand Further | A4 | PF | Missing | none | product_relationships | ISSUE-010 |
| Front moments | A4 | CC | Missing | not in 14; partial Legacy 12 | content_entries | ISSUE-016/017 |
| Problem / Response | A4 | CC | Missing | none in 14 | content_entries | ISSUE-016 |
| Story title | A4 “X is part of everyday life.” | CC | Missing | 14 Story title = product name | content_entries.story_title | ISSUE-016 |

---

## C-01 Entry Collection

| A4 element | Approved (from A4 review) | Layer | Generate? | Current source | Proposed V2 | Dup / gap | Issue |
|---|---|---|---|---|---|---|---|
| Product name | Entry Collection | PF | Ready | 04.Name | products.canonical_name | — | — |
| Product ID | C-01 | PF | Ready | 04.Product ID | products.product_code | — | — |
| Hero | Some welcomes don't need words. | CC | Ready | 14 Hero (=A4); also 04 | content_entries | Dup 04 | ISSUE-013 |
| Subtitle | Before you step inside, home is already waiting. | CC | Ready | 14 | content_entries | — | — |
| Story title | Entry is part of everyday life. | CC | Missing | 14 title = Entry Collection | content_entries | — | ISSUE-016 |
| Story body | Arrival begins before the door opens… | CC | Conflict | 14 body differs | migrate A4 exact later | — | ISSUE-016 |
| Front moments | Welcome / Arrive / Connect / Return + captions | CC | Missing | not in 14 | content_entries sequenced front | — | ISSUE-016 |
| Problem | Dark approaches and separate door devices… | CC | Missing | none | content_entries | — | ISSUE-016 |
| Better Home response | Entrance prepares light, access and awareness… | CC | Missing | facts in rules/automation only | content + fact_reference | — | ISSUE-016 |
| Customer experiences | Warm Approach; Smart Access; Door Awareness; Video Doorbell; Garage Control (5) | CC/PF | Conflict | 05 has 4 differently grouped; Layout back=4 | experiences + presentation map | Count 5 vs 4 | ISSUE-009 |
| Door Awareness claim | Know state of main entry | PF/CC | Conflict | No door contact capability; Smart Lock ≠ door open/closed | capability link or revise claim | — | **ISSUE-001** |
| Scope headings | Approach; Inside; Access; Light; Garage | PC/PF | Partial | capabilities exist, no groups | scope_groups/items | — | ISSUE-011 |
| Scope content | PIR; indoor presence; lock+doorbell; switch; garage relay | PF | Ready as facts | 06 + BOM validate | scope_items → capabilities | — | — |
| Expand Further | Away; CCTV; Protection Bonus | PF | Missing | no relationship table | relationships + bonus requirements | — | ISSUE-010 |
| Permitted Add-ons | Smart Lock; Wireless Video Doorbell; Garage Door Control | PF | Partial | 11 eligibility; no featured order | featured_addons + 11 | — | ISSUE-014 |
| Installation assumptions | Door/lock/circuits/Wi-Fi/garage dry contact; intercom quoted | PF/CC | Partial | rules partial | installation_assumptions + content | — | ISSUE-016 |
| Price | $2,499 installed incl GST | PF | Ready numeric | 10 = 2499 | product_prices | display quals missing | ISSUE-012 |
| Theme | Unified green | PC | Conflict | 17 `#B68A4A` | channel tokens | — | ISSUE-006 |
| Image | Entry residential crop | PC | Partial | `/assets/products/c-01/hero.jpg` | assets+crops | — | ISSUE-007 |
| Layout | Collection two-sided; 5 back experiences | PC | Conflict | Layout back=4 | layout max derived | — | ISSUE-018 |
| Footer/nav | C-01, V2.06, Collection highlighted | PC | Conflict/Partial | hardcoded + version | release + layout | — | ISSUE-005/018 |

---

## C-02 Living Collection

| A4 element | Approved | Layer | Generate? | Current | Proposed | Issue |
|---|---|---|---|---|---|---|
| Name / ID | Living Collection / C-02 | PF | Ready | 04 | products | — |
| Hero / Subtitle | One space… / The atmosphere… | CC | Ready | 14 | content_entries | — |
| Story title/body | Living isn't just another room. / families reconnect… | CC | Missing/Conflict | 14 differs | content_entries | ISSUE-016 |
| Front moments | Together; Movie Night; Reading; Relax + captions | CC | Missing in 14 | Legacy 12 titles only (no captions) | content_entries; retire 12 | ISSUE-016/017 |
| Problem / Response | (A4 prose) | CC | Missing | none | content_entries | ISSUE-016 |
| Experiences | Quiet Welcome; Movie Night; Reading+Relax; Everyday Comfort; Natural Control (5) | CC/PF | Partial/Conflict | 05 regrouped (Lights Follow You, Climate Comfort, Movie, Reading, Relax); Layout 5 | experience IDs + A4 map | ISSUE-009 |
| Scope | 6 circuits, dimmer, sensing, AC+TV response, curtain≤3m, warm≤3m, speaker | PF | Partial | 06/BOM/Rules; TV action in rules not capability | scope map; do not imply TV hardware | ISSUE-011 |
| Expand Further | Mood Lighting; Climate; Healthy Air | PF | Missing | none | relationships | ISSUE-010 |
| Add-ons | Curtain; Warm Ambient Zone; Split-System Control | PF | Partial | 11 | featured map | ISSUE-014 |
| Price | $2,999 installed incl GST | PF | Ready numeric | 10=2999 | product_prices | ISSUE-012 |
| Theme / Image / Footer | unified green / hero / V2.06 | PC | Conflict/Partial | 17 `#6C7A5C`; generic image | tokens/assets/release | ISSUE-006/007/005 |

---

## C-03 Kitchen Collection

| A4 element | Approved | Layer | Generate? | Current | Proposed | Issue |
|---|---|---|---|---|---|---|
| Name / ID | Kitchen Collection / C-03 | PF | Ready | 04 | products | — |
| Hero / Subtitle | The day begins quietly. / Light where you need it… | CC | Ready | 14 | content_entries | — |
| Story title/body | Kitchen is part of everyday life. / first coffee… | CC | Missing/Conflict | 14 differs | content_entries | ISSUE-016 |
| Front moments | Morning; Cooking; Night; Everyday + captions | CC | Missing | none | content_entries | ISSUE-016 |
| Experiences | Morning Light; Cooking Scene; Night Path; Room Response; Useful Information (5) | CC/PF | Conflict | 05 has 4; Layout back=4 | experience map | ISSUE-009 |
| Scope Worktop warm strip | A4 groups under WORKTOP | PF/CC | **Conflict** | 06 `Warm Kickboard Zone`; BOM WW-STRIP-3 notes `Kickboard` | resolve capability + scope group | **ISSUE-002** |
| Expand Further | Mood Lighting; Healthy Air; **Add-ons** CTA | PF/PC | Missing/Conflict | no relationships; Add-ons is CTA not Experience | relationships + layout CTA field | ISSUE-010/019 |
| Add-ons | Warm Ambient Zone; Smart Display; Smart Appliance Outlet | PF | Partial | 11 | featured | ISSUE-014 |
| Price | $2,499 | PF | Ready numeric | 10=2499 | product_prices | ISSUE-012 |
| Theme/Image/Layout/Footer | green / hero / 5 exp vs layout 4 / V2.06 | PC | Conflict | 17 `#9A7B4F` | tokens/layout/release | ISSUE-006/007/018/005 |

---

## C-04 Bedroom Collection

| A4 element | Approved | Layer | Generate? | Current | Proposed | Issue |
|---|---|---|---|---|---|---|
| Name / ID | Bedroom Collection / C-04 | PF | Ready | 04 | products | — |
| Hero | The world can wait until morning. | CC | Ready | 14 | content_entries | — |
| Subtitle | Designed around deeper rest and gentler mornings. | CC | Conflict | 14 adds “and quiet control” | migrate A4 exact | ISSUE-016 |
| Story title/body | Bedroom is part of everyday life. / settles without… | CC | Missing/Conflict | 14 differs | content_entries | ISSUE-016 |
| Front moments | Good Night; Night Path; Gentle Wake; Privacy + captions | CC | Conflict/Missing | Legacy 12 has Sleep Comfort set | migrate A4; Legacy archive | ISSUE-016/017 |
| Experiences | Good Night; Night Path; Gentle Wake; Quiet Privacy; Restful Audio (5) | CC/PF | Conflict | 05 has 4; Layout 4 | experience map | ISSUE-009 |
| Scope | switch, dimmer, sensor, curtain≤3m, two remotes, warm zone, speaker | PF | Ready as facts | 06/BOM/Rules | scope groups | ISSUE-011 |
| Expand Further | Mood Lighting; Climate; Healthy Air | PF | Missing | none | relationships | ISSUE-010 |
| Add-ons | Curtain; Bedside Remote; Split-System Control | PF | Partial | 11 | featured | ISSUE-014 |
| Price | $2,699 | PF | Ready numeric | 10=2699 | product_prices | ISSUE-012 |
| Theme/Image/Layout/Footer | green / hero / counts / V2.06 | PC | Conflict | 17 `#4D6073` | tokens/layout/release | ISSUE-006/007/018/005 |

---

## C-05 Bathroom Collection

| A4 element | Approved | Layer | Generate? | Current | Proposed | Issue |
|---|---|---|---|---|---|---|
| Name / ID | Bathroom Collection / C-05 | PF | Ready | 04 | products | — |
| Hero / Subtitle | Every day begins… / Light and ventilation… | CC | Ready | 14 | content_entries | — |
| Story title/body | Bathroom is part of everyday life. / Morning warmth… | CC | Missing/Conflict | 14 differs | content_entries | ISSUE-016 |
| Front moments | Welcome; Night; Shower; Renew + captions | CC | Missing | none | content_entries | ISSUE-016 |
| Experiences | Welcome Light; Night Path; Shower Mode; Ventilation; Warm-up Routine (5) | CC/PF | Conflict | 05 has 3; Layout back=3 | experience map | ISSUE-009 |
| Scope “up to six lighting circuits” | A4 lighting-only wording | PF | **Conflict** | 06 notes: Compatible lighting / fan / heating circuits | generate from capability qualifier | **ISSUE-003** |
| Expand Further | Mood Lighting; Healthy Air; Add-ons CTA | PF/PC | Missing/Conflict | none | relationships + CTA | ISSUE-010/019 |
| Add-ons | Warm Ambient Zone; Occupancy Sensor; Exhaust Fan Control | PF | Partial | 11 | featured | ISSUE-014 |
| Price | $2,199 | PF | Ready numeric | 10=2199 | product_prices | ISSUE-012 |
| Theme/Image/Layout/Footer | green / hero / 5 vs 3 / V2.06 | PC | Conflict | 17 `#6E8F9C` | tokens/layout/release | ISSUE-006/007/018/005 |

---

## C-06 Away Collection

| A4 element | Approved | Layer | Generate? | Current | Proposed | Issue |
|---|---|---|---|---|---|---|
| Name / ID | Away Collection / C-06 | PF | Ready | 04 | products | — |
| Hero | Leave knowing home has settled. | CC | Ready | 14 | content_entries | — |
| Subtitle | A clear departure. A quieter return. | CC | Minor conflict | 14 punctuation differs (comma) | migrate A4 exact | ISSUE-016 |
| Story title/body | Away is part of everyday life. / shared departure state… | CC | Missing/Conflict | 14 differs | content_entries | ISSUE-016 |
| Front moments | Leave; Settle; Aware; Return + captions | CC | Conflict/Missing | Legacy 12: Leave with Confidence / Home Check / Holiday Mode / Return Home | migrate A4; archive 12 | ISSUE-016/017 |
| Experiences | One-Touch Away; Existing-Room Setback; Opening Awareness; **Return Routine**; Clear Boundary (5) | CC/PF | Conflict | 05: Leave Home, Home Check, Away Mode, Holiday Mode (4); Layout 4 | experience map | ISSUE-009/015 |
| Return Routine | A4 customer experience | PF/CC | **Conflict / Missing** | **Not in 19_Automation_Library** | add automation fact or remove claim (PO) | **ISSUE-004** |
| Scope return response | A4 | PF | Partial/Conflict | not structurally defined | automation + scope | ISSUE-004 |
| Expand Further | Entry; CCTV; Protection Bonus | PF | Missing | Layout Show Compatible Packs=FALSE | relationships + bonus | ISSUE-010/018 |
| Add-ons | Additional Door / Window Contact | PF | Ready eligibility | 11 AO-018 | featured optional | ISSUE-014 |
| Installation assumptions | Foundation, existing Collection, contacts, Zigbee coverage, not alarm | PF/CC/TC | Partial | rules; Zigbee is technical leak into customer layer | split customer vs technical wording | ISSUE-020 |
| Price | $1,499 installed incl GST | PF | Ready numeric | 10=1499 (not placeholder 2499) | product_prices | ISSUE-012 |
| Theme/Image/Layout/Footer | green / hero / Expand Further vs flag / V2.06 | PC | Conflict | 17 `#475569` | tokens/layout/release | ISSUE-006/007/018/005 |

---

## Six-Collection checklist
- Entry mapped: Yes  
- Living mapped: Yes  
- Kitchen mapped: Yes  
- Bedroom mapped: Yes  
- Bathroom mapped: Yes  
- Away mapped: Yes  

Approved A4 copy was **not** rewritten. Page-expression wording was not converted into new product facts.
