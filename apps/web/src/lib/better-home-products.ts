import importPlan from '../../../../packages/product-os/generated/import-plan-v2.07.json';
import { getCustomerPrice } from './product-pricing';

const slugByCode: Record<string, string> = {
  'F-01': 'foundation',
  'C-01': 'entry',
  'C-02': 'living',
  'C-03': 'kitchen',
  'C-04': 'bedroom',
  'C-05': 'bathroom',
  'C-06': 'away',
  'E-01': 'mood-lighting',
  'E-02': 'climate',
  'E-03': 'healthy-air',
  'E-04': 'garden-care',
  'E-05': 'cctv',
  'E-06': 'smart-toilet',
};

const imageByCode: Record<string, string> = {
  'F-01': '/images/better-home/foundation-hero.png',
  'C-01': '/images/better-home/collections/entry.jpg',
  'C-02': '/images/better-home/collections/living.jpg',
  'C-03': '/images/better-home/collections/kitchen.jpg',
  'C-04': '/images/better-home/collections/bedroom.jpg',
  'C-05': '/images/better-home/collections/bathroom.jpg',
  'C-06': '/images/better-home/collections/away.jpg',
  'E-01': '/images/better-home/collections/living.jpg',
  'E-02': '/images/better-home/collections/living.jpg',
  'E-03': '/images/better-home/collections/bedroom.jpg',
  'E-04': '/images/better-home/collections/entry.jpg',
  'E-05': '/images/better-home/collections/away.jpg',
  'E-06': '/images/better-home/collections/bathroom.jpg',
};

const products = importPlan.products as Array<{
  productCode: string;
  canonicalName: string;
  productKind: string;
  commercialRole: string;
  coverage: string;
  coreValue: string;
}>;

const content = importPlan.contentEntries as Array<{
  productCode: string;
  contentKind: string;
  title: string | null;
  body: string | null;
}>;

const experiences = importPlan.experiences as Array<{
  productCode: string;
  sequence: number;
  title: string;
  description: string;
}>;

const capabilities = importPlan.capabilities as Array<{
  productCode: string;
  capabilityName: string;
  customerLayer: string;
  includedQty: number;
  notes: string | null;
}>;

function contentValue(productCode: string, kind: string, field: 'title' | 'body') {
  return content.find((entry) => entry.productCode === productCode && entry.contentKind === kind)?.[field] || '';
}

export const betterHomeProducts = products
  .filter((product) => slugByCode[product.productCode])
  .map((product) => ({
    ...product,
    slug: slugByCode[product.productCode],
    href: product.productKind === 'COLLECTION'
      ? `/better-home/${slugByCode[product.productCode]}`
      : `/products/${slugByCode[product.productCode]}`,
    image: imageByCode[product.productCode],
    hero: contentValue(product.productCode, 'HERO', 'title'),
    subtitle: contentValue(product.productCode, 'SUBTITLE', 'title'),
    storyTitle: contentValue(product.productCode, 'STORY_BODY', 'title'),
    storyBody: contentValue(product.productCode, 'STORY_BODY', 'body'),
    price: getCustomerPrice(product.productCode),
    experiences: experiences
      .filter((item) => item.productCode === product.productCode)
      .sort((a, b) => a.sequence - b.sequence),
    capabilities: capabilities.filter((item) => item.productCode === product.productCode),
  }));

export function getBetterHomeProductBySlug(slug: string) {
  return betterHomeProducts.find((product) => product.slug === slug);
}
