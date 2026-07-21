export interface CollectionExperience {
  title: string;
  text: string;
}

export interface CollectionIncluded {
  title: string;
  items: string[];
}

export interface LivingCollection {
  code: string;
  type: string;
  title: string;
  accentColor: string;
  brandName: string;
  heroImage: string;
  heroImageAlt: string;
  heroStatement: string;
  subtitle: string;
  story: string[];
  moments: string[];
  closingQuote: string;
  priceLabel: string;
  price: string;
  collectionSubtitle: string;
  experiences: CollectionExperience[];
  included: CollectionIncluded[];
  compatibleExperiencePacks: string[];
  footer: string;
  footerSmall: string;
}
