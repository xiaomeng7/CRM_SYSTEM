import type { LivingCollection } from "./collection";

export const livingCollection: LivingCollection = {
  code: "C-02",
  type: "Living Collection",
  title: "Living Collection",
  accentColor: "#6C7A5C",
  brandName: "BETTER HOME",
  heroImage: "/assets/collections/living/hero.jpg",
  heroImageAlt: "Calm residential living space with warm ambient light",
  heroStatement: "One space.\nMany ways to live.",
  subtitle: "The atmosphere follows your life.",
  story: [
    "Living isn't just another room.",
    "It is where families reconnect after a busy day, where conversations become memories, and where ordinary evenings become the moments we remember most.",
    "Better Home quietly adapts lighting, comfort and atmosphere to the way you live, allowing technology to disappear into the background while life takes centre stage.",
  ],
  moments: ["Together", "Movie Night", "Reading", "Relax"],
  closingQuote: "Technology should quietly support everyday life.",
  priceLabel: "Standard Installed Price",
  price: "$2,999 Installed",
  collectionSubtitle: "Everything included in this Collection.",
  experiences: [
    {
      title: "Lights Follow You",
      text: "The room gently welcomes you as you enter and switches off automatically when everyone leaves.",
    },
    {
      title: "Movie Scene",
      text: "One touch dims the lights, closes the curtain and creates the perfect cinema atmosphere.",
    },
    {
      title: "Reading Scene",
      text: "Comfortable task lighting for reading while keeping the room calm and inviting.",
    },
    {
      title: "Climate Comfort",
      text: "Automatically maintains a comfortable temperature for everyday living.",
    },
    {
      title: "Voice Control",
      text: "Control lighting, scenes and comfort naturally using Google Home or Alexa.",
    },
  ],
  included: [
    {
      title: "Smart Devices",
      items: [
        "10 Function Sensor",
        "Zigbee Smart Switch",
        "Zigbee Dimmer",
        "Curtain Motor",
        "Google Home Speaker",
      ],
    },
    {
      title: "Better Home OS",
      items: [
        "Scene Programming",
        "Living Room Automation",
        "Voice Integration",
        "Remote Access",
      ],
    },
    {
      title: "Professional Installation",
      items: ["Installation", "Programming", "Testing", "Customer Training"],
    },
  ],
  compatibleExperiencePacks: ["Mood Lighting", "HVAC", "Home Security"],
  footer: "Part of the Better Home Residential Operating System",
  footerSmall: "Better Home Technology Pty Ltd",
};
