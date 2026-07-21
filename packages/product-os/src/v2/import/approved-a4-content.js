/**
 * Approved six-Collection A4 customer copy (DEC-012) — verbatim from
 * Better_Home_Collections_A4_Review_Set_V1.pdf text layer (not OCR, not sheet 12).
 *
 * Soft line-wraps within a sentence are joined with a single space (non-semantic).
 * Apostrophes/quotes preserved as Unicode from the PDF text layer.
 *
 * Source fingerprint must match APPROVED_SOURCES a4_review_pdf.
 */

const A4_CONTENT_SOURCE = Object.freeze({
  a4Pdf: "docs/product-os/source/Better_Home_Collections_A4_Review_Set_V1.pdf",
  a4PdfSha256: "f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8",
  mappingReview: "docs/product-os/source/A4_Content_Mapping_Review_V1.md",
  mappingReviewSha256: "a68587aadff15df830b570ee5d83a30db7c3e1b398623980455e217c663b77a8",
  decision: "DEC-012",
  locale: "en-AU",
  languageLayer: "CUSTOMER"
});

const VALUE_FOOTER = "Technology should quietly support everyday life.";

/** @type {Readonly<Record<string, object>>} */
const APPROVED_COLLECTION_A4 = Object.freeze({
  "C-01": Object.freeze({
    productName: "Entry Collection",
    frontPage: 1,
    backPage: 2,
    hero: "Some welcomes don’t need words.",
    subtitle: "Before you step inside, home is already waiting.",
    storyTitle: "Entry is part of everyday life.",
    storyBody:
      "Arrival begins before the door opens. Light, access and awareness come together without making the entrance feel technical.",
    moments: Object.freeze([
      { sequence: 1, title: "WELCOME", caption: "Approach Light" },
      { sequence: 2, title: "ARRIVE", caption: "Smart Access" },
      { sequence: 3, title: "CONNECT", caption: "Video Doorbell" },
      { sequence: 4, title: "RETURN", caption: "A Familiar Entry" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "Dark approaches and separate door devices make arrival feel less certain.",
    betterHomeResponse:
      "The entrance prepares light, access and awareness while every important action remains deliberate.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "A WARM APPROACH",
        body: "Outdoor movement can prepare the way home.",
        libraryMatchHint: "Outdoor Welcome"
      },
      {
        sequence: 2,
        title: "SMART ACCESS",
        body: "The door is ready when you choose to unlock it.",
        libraryMatchHint: "Smart Access"
      },
      {
        sequence: 3,
        title: "DOOR AWARENESS",
        body: "Know the state of the main entry.",
        libraryMatchHint: null,
        plannedFactRef: "DELTA-C01-DOOR"
      },
      {
        sequence: 4,
        title: "VIDEO DOORBELL",
        body: "See who is waiting at the door.",
        libraryMatchHint: "Door Communication"
      },
      {
        sequence: 5,
        title: "GARAGE CONTROL",
        body: "Open or close deliberately - never automatically.",
        libraryMatchHint: null,
        capabilityHint: "Garage Door Relay"
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "APPROACH",
        lines: Object.freeze(["Outdoor movement sensing", "Entry lighting response"])
      },
      {
        heading: "INSIDE",
        lines: Object.freeze(["Indoor presence sensing", "Arrival awareness"])
      },
      {
        heading: "ACCESS",
        lines: Object.freeze(["1 smart lock", "1 video doorbell"])
      },
      {
        heading: "LIGHT",
        lines: Object.freeze(["Up to 6 lighting circuits", "1 room switch"])
      },
      {
        heading: "GARAGE",
        lines: Object.freeze(["1 deliberate door relay", "Setup + handover"])
      }
    ]),
    installationAssumptions:
      "Compatible door, lock preparation, lighting circuits, Wi-Fi and garage dry contact required. Wired intercom and special door work are quoted.",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  }),

  "C-02": Object.freeze({
    productName: "Living Collection",
    frontPage: 3,
    backPage: 4,
    hero: "One space. Many ways to live.",
    subtitle: "The atmosphere follows your life.",
    storyTitle: "Living isn't just another room.",
    storyBody:
      "It is where families reconnect, conversations become memories, and ordinary evenings matter most.",
    moments: Object.freeze([
      { sequence: 1, title: "TOGETHER", caption: "Family Time" },
      { sequence: 2, title: "MOVIE NIGHT", caption: "Cinema Scene" },
      { sequence: 3, title: "READING", caption: "Focused Light" },
      { sequence: 4, title: "RELAX", caption: "Evening Comfort" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "One room holds conversation, television, reading and quiet evenings. Ordinary controls treat every moment the same.",
    betterHomeResponse:
      "The room welcomes you, changes with the moment and settles when everyone leaves. Movie, Reading and Relax each feel distinct.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "A QUIET WELCOME",
        body: "Light arrives with you and settles when the room is empty.",
        libraryMatchHint: "Lights Follow You"
      },
      {
        sequence: 2,
        title: "MOVIE NIGHT",
        body: "One touch lets the whole space become quieter.",
        libraryMatchHint: "Movie"
      },
      {
        sequence: 3,
        title: "READING + RELAX",
        body: "Clearer light to read. Softer light to unwind.",
        libraryMatchHint: "Reading"
      },
      {
        sequence: 4,
        title: "EVERYDAY COMFORT",
        body: "A compatible split system follows the room scene.",
        libraryMatchHint: "Climate Comfort"
      },
      {
        sequence: 5,
        title: "NATURAL CONTROL",
        body: "Call for the scene without interrupting the moment.",
        libraryMatchHint: null
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "ROOM LIGHT",
        lines: Object.freeze(["Up to 6 lighting circuits", "1 dimmable lighting circuit"])
      },
      {
        heading: "ROOM RESPONSE",
        lines: Object.freeze(["Presence sensing", "Compatible AC + TV response"])
      },
      {
        heading: "PRIVACY",
        lines: Object.freeze(["1 automated straight curtain", "Track up to 3m"])
      },
      {
        heading: "WARMTH",
        lines: Object.freeze(["1 dimmable warm light detail", "Up to 3m"])
      },
      {
        heading: "EVERYDAY USE",
        lines: Object.freeze(["Voice access", "Scenes, setup + handover"])
      }
    ]),
    installationAssumptions:
      "Existing compatible split AC and TV only. Double curtains require two tracks. Tracks over 3m, curved tracks, unusual access and non-standard electrical work are quoted separately.",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  }),

  "C-03": Object.freeze({
    productName: "Kitchen Collection",
    frontPage: 5,
    backPage: 6,
    hero: "The day begins quietly.",
    subtitle: "Light where you need it. Calm when you don’t.",
    storyTitle: "Kitchen is part of everyday life.",
    storyBody:
      "From the first coffee to the final glass of water, the kitchen changes with the hour while work light remains clear and useful.",
    moments: Object.freeze([
      { sequence: 1, title: "MORNING", caption: "A Gentle Start" },
      { sequence: 2, title: "COOKING", caption: "Clear Task Light" },
      { sequence: 3, title: "NIGHT", caption: "A Softer Path" },
      { sequence: 4, title: "EVERYDAY", caption: "Useful Control" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "Worktops can be poorly lit, while strong general light feels harsh early or late.",
    betterHomeResponse:
      "The kitchen shifts between useful task light, a quiet night scene and simple control of a compatible appliance.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "MORNING LIGHT",
        body: "Begin the day without waking the whole room.",
        libraryMatchHint: null
      },
      {
        sequence: 2,
        title: "COOKING SCENE",
        body: "Clearer light where preparation happens.",
        libraryMatchHint: null
      },
      {
        sequence: 3,
        title: "NIGHT PATH",
        body: "Move through the kitchen with less glare.",
        libraryMatchHint: null
      },
      {
        sequence: 4,
        title: "ROOM RESPONSE",
        body: "Light follows use and settles when empty.",
        libraryMatchHint: null
      },
      {
        sequence: 5,
        title: "USEFUL INFORMATION",
        body: "Keep everyday control and information close.",
        libraryMatchHint: null
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "ROOM LIGHT",
        lines: Object.freeze(["Up to 6 lighting circuits", "1 dimmable circuit"])
      },
      {
        heading: "RESPONSE",
        lines: Object.freeze(["Presence sensing", "Programmed room scenes"])
      },
      {
        heading: "WORKTOP",
        lines: Object.freeze(["1 warm light detail", "Up to 3m"]),
        note: "Presentation group WORKTOP; technical capability is Warm Kickboard Ambient Zone (DEC-002) — mapping must not imply strip under worktop"
      },
      {
        heading: "INFORMATION",
        lines: Object.freeze(["1 smart display", "Setup included"])
      },
      {
        heading: "APPLIANCE",
        lines: Object.freeze(["1 safe smart outlet", "Setup + handover"])
      }
    ]),
    installationAssumptions:
      "Suitable cabinetry, mounting surface, compatible lighting circuit and safe plug-in appliance required. Joinery changes and appliance supply are excluded.",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  }),

  "C-04": Object.freeze({
    productName: "Bedroom Collection",
    frontPage: 7,
    backPage: 8,
    hero: "The world can wait until morning.",
    subtitle: "Designed around deeper rest and gentler mornings.",
    storyTitle: "Bedroom is part of everyday life.",
    storyBody:
      "The bedroom settles without a sequence of switches and wakes without demanding attention.",
    moments: Object.freeze([
      { sequence: 1, title: "GOOD NIGHT", caption: "The Room Settles" },
      { sequence: 2, title: "NIGHT PATH", caption: "Warm Low Light" },
      { sequence: 3, title: "GENTLE WAKE", caption: "Morning Arrives" },
      { sequence: 4, title: "PRIVACY", caption: "Curtain Control" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "Harsh night light and repeated bedside switching interrupt the room’s natural rhythm.",
    betterHomeResponse:
      "Warm low light, privacy and two identical bedside controls make night and morning feel calmer.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "GOOD NIGHT",
        body: "One scene lets the room settle.",
        libraryMatchHint: null
      },
      {
        sequence: 2,
        title: "NIGHT PATH",
        body: "Low warm light helps you move without fully waking.",
        libraryMatchHint: null
      },
      {
        sequence: 3,
        title: "GENTLE WAKE",
        body: "Light and curtain can welcome the morning.",
        libraryMatchHint: null
      },
      {
        sequence: 4,
        title: "QUIET PRIVACY",
        body: "The curtain closes without another trip across the room.",
        libraryMatchHint: null
      },
      {
        sequence: 5,
        title: "RESTFUL AUDIO",
        body: "Music or sound can become part of the routine.",
        libraryMatchHint: null
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "ROOM LIGHT",
        lines: Object.freeze(["Up to 6 lighting circuits", "1 dimmable circuit"])
      },
      {
        heading: "RESPONSE",
        lines: Object.freeze(["Presence sensing", "Night and morning scenes"])
      },
      {
        heading: "PRIVACY",
        lines: Object.freeze(["1 automated straight curtain", "Track up to 3m"])
      },
      {
        heading: "BEDSIDE",
        lines: Object.freeze(["2 matching scene remotes", "Four scenes each"])
      },
      {
        heading: "REST",
        lines: Object.freeze(["Warm night light + speaker", "Setup + handover"])
      }
    ]),
    installationAssumptions:
      "Curtain fabric and sheers excluded. Double curtains require two tracks. Tracks over 3m, curved tracks, TV control and unusual access are quoted.",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  }),

  "C-05": Object.freeze({
    productName: "Bathroom Collection",
    frontPage: 9,
    backPage: 10,
    hero: "Every day begins and ends in comfort.",
    subtitle: "Light and ventilation settle into the room’s rhythm.",
    storyTitle: "Bathroom is part of everyday life.",
    storyBody:
      "Morning warmth, a quieter night path and ventilation that follows use make ordinary routines feel more considered.",
    moments: Object.freeze([
      { sequence: 1, title: "WELCOME", caption: "Light Arrives" },
      { sequence: 2, title: "NIGHT", caption: "A Softer Path" },
      { sequence: 3, title: "SHOWER", caption: "One Clear Mode" },
      { sequence: 4, title: "RENEW", caption: "The Room Recovers" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "Harsh night light, forgotten ventilation and separate controls make simple routines feel busy.",
    betterHomeResponse:
      "The room welcomes you softly, supports a deliberate Shower Mode and helps ventilation continue after use.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "WELCOME LIGHT",
        body: "The room prepares itself when you arrive.",
        libraryMatchHint: null
      },
      {
        sequence: 2,
        title: "NIGHT PATH",
        body: "Warm low light avoids unnecessary glare.",
        libraryMatchHint: null
      },
      {
        sequence: 3,
        title: "SHOWER MODE",
        body: "One deliberate scene prepares connected comfort.",
        libraryMatchHint: null
      },
      {
        sequence: 4,
        title: "VENTILATION",
        body: "An existing fan can continue while the room recovers.",
        libraryMatchHint: null
      },
      {
        sequence: 5,
        title: "WARM-UP ROUTINE",
        body: "Compatible existing heat can join the shower scene.",
        libraryMatchHint: null
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "ROOM LIGHT",
        lines: Object.freeze(["Up to 6 lighting circuits", "1 dimmable circuit"]),
        note: "Customer scope; circuit qualifier DEC-003 (not lighting-only)"
      },
      {
        heading: "RESPONSE",
        lines: Object.freeze(["Presence sensing", "Bathroom scenes"])
      },
      {
        heading: "NIGHT",
        lines: Object.freeze(["1 warm light detail", "Up to 3m"])
      },
      {
        heading: "VENTILATION",
        lines: Object.freeze(["Control of 1 existing fan", "Fan body excluded"])
      },
      {
        heading: "COMFORT",
        lines: Object.freeze(["Shower Mode programming", "Setup + handover"])
      }
    ]),
    installationAssumptions:
      "Fan, heater, heat lamp and floor heating equipment are not supplied. Existing equipment and circuits must be compatible and compliant.",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  }),

  "C-06": Object.freeze({
    productName: "Away Collection",
    frontPage: 11,
    backPage: 12,
    hero: "Leave knowing home has settled.",
    subtitle: "A clear departure. A quieter return.",
    storyTitle: "Away is part of everyday life.",
    storyBody:
      "Away gives the rooms you already chose one shared departure state, without pretending to be a monitored alarm.",
    moments: Object.freeze([
      { sequence: 1, title: "LEAVE", caption: "One Clear Action" },
      { sequence: 2, title: "SETTLE", caption: "Existing Rooms" },
      { sequence: 3, title: "AWARE", caption: "Doors + Windows" },
      { sequence: 4, title: "RETURN", caption: "A Familiar Welcome" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "Lights and connected equipment can remain on, while doors and windows are easily overlooked.",
    betterHomeResponse:
      "One deliberate command settles existing Better Home rooms and reports four selected openings.",
    experiences: Object.freeze([
      {
        sequence: 1,
        title: "ONE-TOUCH AWAY",
        body: "Leave without checking every room separately.",
        libraryMatchHint: "Leave Home"
      },
      {
        sequence: 2,
        title: "EXISTING-ROOM SETBACK",
        body: "Chosen Collections move to their away state.",
        libraryMatchHint: "Away Mode"
      },
      {
        sequence: 3,
        title: "OPENING AWARENESS",
        body: "Four selected doors or windows report their state.",
        libraryMatchHint: "Home Check"
      },
      {
        sequence: 4,
        title: "RETURN ROUTINE",
        body: "Arrival restores only the response you selected.",
        libraryMatchHint: null,
        plannedFactRef: "DELTA-C06-RETURN"
      },
      {
        sequence: 5,
        title: "CLEAR BOUNDARY",
        body: "No new room control and no monitored alarm claim.",
        libraryMatchHint: null
      }
    ]),
    scopeGroups: Object.freeze([
      {
        heading: "WHOLE HOME",
        lines: Object.freeze(["Logic across purchased", "Better Home Collections"])
      },
      {
        heading: "AWARENESS",
        lines: Object.freeze(["4 wireless door or", "window contacts"])
      },
      {
        heading: "DEPARTURE",
        lines: Object.freeze(["One programmed Away state", "Existing controls only"])
      },
      {
        heading: "RETURN",
        lines: Object.freeze(["Programmed arrival response", "No automatic garage action"])
      },
      {
        heading: "HANDOVER",
        lines: Object.freeze(["Setup, testing and", "customer training"])
      }
    ]),
    installationAssumptions:
      "Requires Foundation and at least one compatible Collection. Contact positions and Zigbee coverage must be suitable. Not a monitored alarm.",
    installationAssumptionsCustomer:
      "Requires Foundation and at least one compatible Collection. Contact positions and coverage must be suitable. Not a monitored alarm.",
    installationAssumptionsTechnical:
      "Zigbee coverage must be suitable for wireless contacts (technical layer — ISSUE-020).",
    investmentSupportingCopy: "INSTALLED  •  INCL GST"
  })
});

module.exports = {
  A4_CONTENT_SOURCE,
  APPROVED_COLLECTION_A4,
  VALUE_FOOTER
};
