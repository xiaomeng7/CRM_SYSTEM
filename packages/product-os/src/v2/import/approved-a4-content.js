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

const FOUNDATION_A4_SOURCE = Object.freeze({
  a4Pdf: "Foundation_A4_V1.pdf",
  a4PdfSha256: "d129ed38167e3e10cb0eb9f212dddef087d7511acf51c6d6bdcc707399ca3d3c",
  decision: "APPROVED_FOUNDATION_A4_V1",
  locale: "en-AU",
  languageLayer: "CUSTOMER",
  contentVersion: "foundation-a4-v1"
});

const APPROVED_FOUNDATION_A4 = Object.freeze({
  "F-01": Object.freeze({
    source: FOUNDATION_A4_SOURCE,
    productName: "Foundation",
    frontPage: 1,
    backPage: 2,
    hero: "The quiet beginning of every Better Home.",
    subtitle: "One dependable base. Everything works together.",
    storyTitle: "Foundation is designed around life.",
    storyBody:
      "Foundation is the part you rarely notice. It gives every chosen room, experience and future addition one dependable home.",
    moments: Object.freeze([
      { sequence: 1, title: "ONE HOME", caption: "A Shared System" },
      { sequence: 2, title: "READY", caption: "Room to Grow" },
      { sequence: 3, title: "CONNECTED", caption: "Quietly Together" },
      { sequence: 4, title: "SUPPORTED", caption: "Professionally Set Up" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem:
      "Separate devices create separate controls, inconsistent behaviour and no shared logic.",
    betterHomeResponse:
      "Foundation gives every Better Home product one operating layer, professionally commissioned for the home.",
    experiences: Object.freeze([
      { sequence: 1, title: "ONE CLEAR HOME", body: "Collections and Experiences work from the same foundation.", libraryMatchHint: null },
      { sequence: 2, title: "CONSISTENT CONTROL", body: "Scenes, schedules and room responses behave as one system.", libraryMatchHint: null },
      { sequence: 3, title: "READY TO GROW", body: "New Better Home products can be added without starting again.", libraryMatchHint: null },
      { sequence: 4, title: "VISIBLE WHEN NEEDED", body: "A central screen keeps important control close.", libraryMatchHint: null },
      { sequence: 5, title: "PROFESSIONAL HANDOVER", body: "The system is programmed, tested and explained.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "CORE", lines: Object.freeze(["One Better Home project", "System infrastructure"]) },
      { heading: "CONTROL", lines: Object.freeze(["One 10-inch screen", "Central home access"]) },
      { heading: "CONNECTION", lines: Object.freeze(["Network and system interfaces"]) },
      { heading: "COMMISSIONING", lines: Object.freeze(["Programming, testing and customer handover"]) },
      { heading: "FUTURE", lines: Object.freeze(["Ready for Collections and Experiences"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "COLLECTIONS", body: "Begin with the rooms that matter most." },
      { sequence: 2, title: "EXPERIENCES", body: "Add atmosphere, comfort, health or care." },
      { sequence: 3, title: "ADD-ONS", body: "Extend products already in the home." }
    ]),
    featuredAddonCodes: Object.freeze(["AO-026", "AO-027", "AO-030"]),
    installationAssumptions:
      "Suitable cabinet position, network, power and cable pathways are required. Complex second cabinets or separate buildings are quoted."
  })
});

const APPROVED_EXPERIENCE_A4 = Object.freeze({
  "E-01": Object.freeze({
    source: Object.freeze({ a4Pdf: "Mood_Lighting_A4_V1.pdf", a4PdfSha256: "231b4e1f7243aec58174deb835ebd19a4a2e789af89a6c4e6001aac049a19ec1", decision: "APPROVED_MOOD_LIGHTING_A4_V1", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "mood-lighting-a4-v1" }),
    productName: "Mood Lighting",
    hero: "Let the evening find its own colour.",
    subtitle: "Atmosphere for the moments that deserve more.",
    storyTitle: "Mood Lighting is designed around life.",
    storyBody: "Colour should not fill the room with noise. Used carefully, it gives an ordinary evening more depth, warmth and feeling.",
    moments: Object.freeze([
      { sequence: 1, title: "ROMANCE", caption: "A Softer Evening" },
      { sequence: 2, title: "CALM", caption: "Colour With Restraint" },
      { sequence: 3, title: "CELEBRATE", caption: "A Different Energy" },
      { sequence: 4, title: "NIGHT", caption: "A Sense of the Hour" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "White light supports everyday tasks, but cannot always create the atmosphere or gentle cues a moment needs.",
    betterHomeResponse: "Two restrained colour zones join the scenes already used in a compatible room. Colour remains deliberate, never decorative noise.",
    experiences: Object.freeze([
      { sequence: 1, title: "A RICHER EVENING", body: "Colour adds depth without taking over the room.", libraryMatchHint: null },
      { sequence: 2, title: "ROMANCE", body: "A warmer, quieter scene changes the mood naturally.", libraryMatchHint: null },
      { sequence: 3, title: "CELEBRATION", body: "The same room can hold a more expressive moment.", libraryMatchHint: null },
      { sequence: 4, title: "HOUR-BY-COLOUR", body: "At night, colour can offer a gentle sense of the hour.", libraryMatchHint: null },
      { sequence: 5, title: "SCENE-LINKED COLOUR", body: "The room changes as one composed experience.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "COLOUR", lines: Object.freeze(["2 independent RGBW zones", "Up to 5m each"]) },
      { heading: "TOTAL", lines: Object.freeze(["Maximum 10m", "of silicone light"]) },
      { heading: "LAMPS", lines: Object.freeze(["2 compatible", "colour bulbs"]) },
      { heading: "POWER", lines: Object.freeze(["Suitable 24V power", "and controllers"]) },
      { heading: "FINISH", lines: Object.freeze(["Scenes, installation", "and handover"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "LIVING", body: "Give shared evenings more emotional range." },
      { sequence: 2, title: "BEDROOM", body: "Use colour gently around rest and night." },
      { sequence: 3, title: "BATHROOM", body: "Create a more atmospheric bathing ritual." }
    ]),
    featuredAddonCodes: Object.freeze(["AO-004", "AO-032"]),
    installationAssumptions: "Requires a compatible Collection. Concealed cable paths, mounting surfaces and power capacity must be suitable. Flexible silicone strip is used without aluminium channel."
  }),
  "E-02": Object.freeze({
    source: Object.freeze({ a4Pdf: "Climate_A4_V1.pdf", a4PdfSha256: "c4e972042f89a1f5789b6adecdeacb609cd07443202e77061dc1a926bc6eebba", decision: "APPROVED_CLIMATE_A4_V1", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "climate-a4-v1" }),
    productName: "Climate",
    hero: "Comfort should never ask for attention.",
    subtitle: "The whole home settles into the right rhythm.",
    storyTitle: "Climate is designed around life.",
    storyBody: "Comfort is most successful when no one has to think about it. Climate lets existing zones respond to rooms, routines and time.",
    moments: Object.freeze([
      { sequence: 1, title: "MORNING", caption: "Comfort Before Rush" },
      { sequence: 2, title: "DAY", caption: "Only Where Needed" },
      { sequence: 3, title: "EVENING", caption: "Rooms Settle Together" },
      { sequence: 4, title: "AWAY", caption: "A Quieter Setback" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "Ducted systems often condition unused zones and operate separately from the way rooms are actually lived in.",
    betterHomeResponse: "One compatible ducted system and up to six existing zones join Better Home scenes, schedules and room-temperature awareness.",
    experiences: Object.freeze([
      { sequence: 1, title: "ZONED COMFORT", body: "Comfort follows the parts of the home being used.", libraryMatchHint: null },
      { sequence: 2, title: "SCENE-LINKED CLIMATE", body: "Daily routines can request the right setting.", libraryMatchHint: null },
      { sequence: 3, title: "ROOM AWARENESS", body: "Existing room sensing contributes temperature context.", libraryMatchHint: null },
      { sequence: 4, title: "AWAY SETBACK", body: "The home can reduce unnecessary conditioning when empty.", libraryMatchHint: null },
      { sequence: 5, title: "SCHEDULED COMFORT", body: "Comfort can be ready before it is requested.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "SYSTEM", lines: Object.freeze(["1 compatible existing", "ducted HVAC system"]) },
      { heading: "ZONES", lines: Object.freeze(["Up to 6 existing", "operational zones"]) },
      { heading: "CONTROL", lines: Object.freeze(["TIS AC and zone", "control equipment"]) },
      { heading: "AWARENESS", lines: Object.freeze(["Uses compatible room", "temperature sensing"]) },
      { heading: "FINISH", lines: Object.freeze(["Installation, setup", "and commissioning"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "LIVING", body: "Make shared spaces comfortable before they ask." },
      { sequence: 2, title: "BEDROOM", body: "Let comfort follow rest and waking." },
      { sequence: 3, title: "AWAY", body: "Reduce unnecessary conditioning when the home settles." }
    ]),
    featuredAddonCodes: Object.freeze(["AO-019"]),
    installationAssumptions: "Existing air conditioner, zone motors, ducting and mechanical performance are excluded and must be compatible and operational. Manufacturer limitations apply."
  }),
  "E-03": Object.freeze({
    source: Object.freeze({ a4Pdf: "Better_Home_A4_Product_Sheets_Print_V2.pdf", decision: "APPROVED_PRINT_V2", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "healthy-air-a4-v2" }),
    productName: "Healthy Air",
    hero: "A healthy home restores itself.",
    subtitle: "Freshness returns quietly, while life carries on.",
    storyTitle: "Healthy Air is designed around life.",
    storyBody: "When outside air can help, the room should know. Healthy Air measures the space and exchanges air deliberately, without relying on an open window alone.",
    moments: Object.freeze([
      { sequence: 1, title: "FRESHEN", caption: "Air Begins to Recover" },
      { sequence: 2, title: "NIGHT", caption: "Use Cooler Outside Air" },
      { sequence: 3, title: "EXTRACT", caption: "When Supply Is Unsuitable" },
      { sequence: 4, title: "AWARE", caption: "Know the Room Better" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "Stale air, retained heat, odours and humidity can remain even when outside conditions could help.",
    betterHomeResponse: "A health sensor and paired supply-and-extract fans create a measured room-level air-exchange experience.",
    experiences: Object.freeze([
      { sequence: 1, title: "AIR AWARENESS", body: "CO, CO2, VOC, temperature and humidity inform the room.", libraryMatchHint: null },
      { sequence: 2, title: "FRESH-AIR EXCHANGE", body: "Supply and extract can work together.", libraryMatchHint: null },
      { sequence: 3, title: "NIGHT COOLING", body: "Cooler outside air may reduce the need for mechanical cooling.", libraryMatchHint: null },
      { sequence: 4, title: "EXTRACT-ONLY RESPONSE", body: "When outside air is unsuitable, the room may only exhaust.", libraryMatchHint: null },
      { sequence: 5, title: "QUIET ALERTS", body: "Unhealthy conditions can be brought to attention.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "SENSE", lines: Object.freeze(["1 room health sensor", "Air and comfort readings"]) },
      { heading: "EXCHANGE", lines: Object.freeze(["Paired supply and", "extract fans"]) },
      { heading: "DUCT", lines: Object.freeze(["2 flexible ducts", "Up to 6m each"]) },
      { heading: "TERMINATION", lines: Object.freeze(["4 grilles", "No filter included"]) },
      { heading: "FINISH", lines: Object.freeze(["Controls, installation", "and commissioning"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "BEDROOM", body: "Help the room recover freshness through the night." },
      { sequence: 2, title: "LIVING", body: "Use outdoor conditions when shared spaces hold heat." },
      { sequence: 3, title: "KITCHEN + BATH", body: "Support recovery after odour or humidity." }
    ]),
    installationAssumptions: "From-zero installation with suitable wall or roof routes. No filters and no PM2.5 claim. Supply and extract terminations require at least 3m separation. Complex penetrations are quoted."
  }),
  "E-04": Object.freeze({
    source: Object.freeze({ a4Pdf: "Better_Home_A4_Product_Sheets_Print_V2.pdf", decision: "APPROVED_PRINT_V2", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "garden-care-a4-v2" }),
    productName: "Garden Care",
    hero: "A beautiful garden quietly looks after itself.",
    subtitle: "Ready for the irrigation your landscaper creates.",
    storyTitle: "Garden Care is designed around life.",
    storyBody: "Garden Care prepares the control layer for front and rear irrigation, while the landscaper remains responsible for everything that carries water.",
    moments: Object.freeze([
      { sequence: 1, title: "MORNING", caption: "Water at the Right Time" },
      { sequence: 2, title: "FRONT", caption: "One Garden Rhythm" },
      { sequence: 3, title: "REAR", caption: "Ready to Grow" },
      { sequence: 4, title: "PAUSE", caption: "Weather Has a Say" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "Manual watering is easily forgotten, while the boundary between electrical control and landscape plumbing is often unclear.",
    betterHomeResponse: "Two Better Home control boxes prepare front and rear garden zones for the irrigation system installed by the landscaper.",
    experiences: Object.freeze([
      { sequence: 1, title: "SCHEDULED WATERING", body: "Four zones follow a deliberate garden routine.", libraryMatchHint: null },
      { sequence: 2, title: "FRONT + REAR", body: "Control is prepared at both sides of the home.", libraryMatchHint: null },
      { sequence: 3, title: "WEATHER-AWARE PAUSE", body: "Watering can pause when conditions make it unnecessary.", libraryMatchHint: null },
      { sequence: 4, title: "MANUAL START", body: "A chosen zone can still be started deliberately.", libraryMatchHint: null },
      { sequence: 5, title: "READY TO EXPAND", body: "The installed control hardware can support up to eight zones.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "FRONT", lines: Object.freeze(["1 outdoor control box", "4 relay outputs"]) },
      { heading: "REAR", lines: Object.freeze(["1 outdoor control box", "4 relay outputs"]) },
      { heading: "STANDARD", lines: Object.freeze(["4 irrigation zones", "programmed"]) },
      { heading: "CAPACITY", lines: Object.freeze(["Hardware ready for", "up to 8 zones"]) },
      { heading: "FINISH", lines: Object.freeze(["BUS connection, setup", "and commissioning"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "LANDSCAPING", body: "Your landscaper creates the water-side system." },
      { sequence: 2, title: "WEATHER", body: "Schedules respond more intelligently to conditions." },
      { sequence: 3, title: "MORE ZONES", body: "Use existing spare capacity as the garden grows." }
    ]),
    featuredAddonCodes: Object.freeze(["AO-021"]),
    installationAssumptions: "Landscaper supplies valves, compatible coils, valve wiring, pipes, sprinklers, trenching and water connection. Better Home provides a 24V DC control interface."
  }),
  "E-05": Object.freeze({
    source: Object.freeze({ a4Pdf: "Better_Home_A4_Product_Sheets_Print_V2.pdf", decision: "APPROVED_PRINT_V2", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "cctv-a4-v2" }),
    productName: "CCTV",
    hero: "See what happened. Know what matters.",
    subtitle: "Professional local recording, with room to grow.",
    storyTitle: "CCTV is designed around life.",
    storyBody: "CCTV should feel dependable, not dramatic. It keeps a clear local record and, when the full Better Home system is present, helps the front of the home make its presence known.",
    moments: Object.freeze([
      { sequence: 1, title: "SEE", caption: "Four Clear Views" },
      { sequence: 2, title: "RECORD", caption: "Kept at Home" },
      { sequence: 3, title: "NIGHT", caption: "Colour When Needed" },
      { sequence: 4, title: "RESPOND", caption: "The Front Becomes Visible" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "Consumer cameras often depend on subscriptions, while conventional CCTV remains separate from the home.",
    betterHomeResponse: "Four professional PoE cameras record locally. A compatible event can connect camera white light with selected front-visible Better Home lights.",
    experiences: Object.freeze([
      { sequence: 1, title: "LOCAL RECORDING", body: "Footage remains on the property’s NVR.", libraryMatchHint: null },
      { sequence: 2, title: "FOUR CLEAR VIEWS", body: "Standard coverage begins with four 8MP cameras.", libraryMatchHint: null },
      { sequence: 3, title: "NIGHT VISIBILITY", body: "Smart Hybrid Light supports useful colour detail.", libraryMatchHint: null },
      { sequence: 4, title: "REMOTE VIEWING", body: "Review the system through the configured app.", libraryMatchHint: null },
      { sequence: 5, title: "VISIBLE RESPONSE", body: "Eligible homes can make the front visibly react without a siren.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "CAMERAS", lines: Object.freeze(["4 HiLook 8MP", "PoE cameras"]) },
      { heading: "RECORD", lines: Object.freeze(["8-channel PoE NVR", "4TB local storage"]) },
      { heading: "EVENT", lines: Object.freeze(["Better Home digital", "input connection"]) },
      { heading: "INSTALL", lines: Object.freeze(["Standard cable routes", "and camera positions"]) },
      { heading: "HANDOVER", lines: Object.freeze(["Configuration, testing", "and customer training"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "ENTRY", body: "Connect visibility with the home’s main arrival point." },
      { sequence: 2, title: "AWAY", body: "Let the home understand a deliberate departure." },
      { sequence: 3, title: "PROTECTION BONUS", body: "Entry + Away + CCTV unlock visible response." }
    ]),
    featuredAddonCodes: Object.freeze(["AO-022", "AO-023", "AO-024"]),
    installationAssumptions: "Standard accessible positions and cable routes. Audio is disabled. Internet service and customer display devices are excluded. Difficult access, trenching and detached buildings are quoted."
  }),
  "E-06": Object.freeze({
    source: Object.freeze({ a4Pdf: "Better_Home_A4_Product_Sheets_Print_V2.pdf", decision: "APPROVED_PRINT_V2", locale: "en-AU", languageLayer: "CUSTOMER", contentVersion: "smart-toilet-a4-v2" }),
    productName: "Smart Toilet",
    hero: "Comfort, cleanliness and quiet convenience.",
    subtitle: "A complete personal-comfort product, supplied on its own.",
    storyTitle: "Smart Toilet is designed around life.",
    storyBody: "The TIS FS80 brings washing, drying and heated comfort into one purpose-designed product. It can be purchased without the Better Home Foundation.",
    moments: Object.freeze([
      { sequence: 1, title: "WASH", caption: "Personal Cleanliness" },
      { sequence: 2, title: "DRY", caption: "Everyday Ease" },
      { sequence: 3, title: "WARM", caption: "Quiet Comfort" },
      { sequence: 4, title: "CARE", caption: "One Complete Product" }
    ]),
    valueFooter: VALUE_FOOTER,
    problem: "A conventional toilet cannot provide integrated washing, drying and heated personal comfort.",
    betterHomeResponse: "The TIS FS80 combines these functions in one standalone product, ready for installation by the customer’s licensed plumber.",
    experiences: Object.freeze([
      { sequence: 1, title: "INTEGRATED WASHING", body: "Personal washing functions are built into the product.", libraryMatchHint: null },
      { sequence: 2, title: "DRYING COMFORT", body: "The routine continues without separate products.", libraryMatchHint: null },
      { sequence: 3, title: "HEATED COMFORT", body: "Warmth supports everyday ease.", libraryMatchHint: null },
      { sequence: 4, title: "PURPOSE-DESIGNED", body: "Functions are integrated into one complete toilet.", libraryMatchHint: null },
      { sequence: 5, title: "STANDALONE PURCHASE", body: "Foundation is not required.", libraryMatchHint: null }
    ]),
    scopeGroups: Object.freeze([
      { heading: "PRODUCT", lines: Object.freeze(["1 TIS-WC-FS80", "Smart Toilet"]) },
      { heading: "SUPPLY", lines: Object.freeze(["Product supply only", "No installation"]) },
      { heading: "PLUMBING", lines: Object.freeze(["Customer-appointed", "licensed plumber"]) },
      { heading: "ELECTRICAL", lines: Object.freeze(["Suitable power may be", "quoted separately"]) },
      { heading: "SUPPORT", lines: Object.freeze(["Better Home coordinates", "product warranty contact"]) }
    ]),
    expandFurther: Object.freeze([
      { sequence: 1, title: "POWER", body: "Better Home can quote a suitable electrical point." },
      { sequence: 2, title: "BATHROOM", body: "Consider the wider Bathroom Collection separately." },
      { sequence: 3, title: "DELIVERY", body: "Confirmed with Better Home before ordering." }
    ]),
    installationAssumptions: "Delivery, plumbing and electrical work are excluded. Compatibility, isolation, drainage and power must be confirmed. Removal or reinstallation for warranty access is a customer plumbing cost, subject to consumer law."
  })
});

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
    backSubtitle: "One living room. One clear installed scope.",
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
  FOUNDATION_A4_SOURCE,
  APPROVED_FOUNDATION_A4,
  APPROVED_EXPERIENCE_A4,
  APPROVED_COLLECTION_A4,
  VALUE_FOOTER
};
