import { getCollection, type CollectionEntry } from 'astro:content';

export type StandardsEntry = CollectionEntry<'standards'>;

/** Pillar display order and labels for navigation */
export const PILLAR_ORDER = [
  'foundation',
  'visual',
  'experience',
  'collaboration',
  'library',
] as const;

export const PILLAR_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  visual: 'Visual',
  experience: 'Experience',
  collaboration: 'Collaboration',
  library: 'Library',
};

export const PILLAR_DESCRIPTIONS: Record<string, string> = {
  foundation: 'Principles and beliefs',
  visual: 'Photography and visual language',
  experience: 'Client and on-site experience',
  collaboration: 'Builders, designers, partners',
  library: 'Operational standards and SOPs',
};

/** Content entry id → URL slug (strips .md if present) */
export function entrySlug(entry: StandardsEntry): string {
  return entry.id.replace(/\.md$/, '');
}

export function standardsPath(entry: StandardsEntry): string {
  return `/standards/${entrySlug(entry)}`;
}

export async function getPublishedStandards(): Promise<StandardsEntry[]> {
  return getCollection('standards', ({ data }) => !data.draft);
}

export type NavItem = {
  title: string;
  href: string;
  topic: string;
};

export type NavGroup = {
  pillar: string;
  label: string;
  description: string;
  items: NavItem[];
};

export function buildStandardsNav(entries: StandardsEntry[]): NavGroup[] {
  const byPillar = new Map<string, NavItem[]>();

  for (const entry of entries) {
    const pillar = entry.data.pillar;
    const list = byPillar.get(pillar) ?? [];
    list.push({
      title: entry.data.title,
      href: standardsPath(entry),
      topic: entry.data.topic,
    });
    byPillar.set(pillar, list);
  }

  for (const items of byPillar.values()) {
    items.sort((a, b) => a.title.localeCompare(b.title));
  }

  return PILLAR_ORDER.filter((p) => byPillar.has(p)).map((pillar) => ({
    pillar,
    label: PILLAR_LABELS[pillar] ?? pillar,
    description: PILLAR_DESCRIPTIONS[pillar] ?? '',
    items: byPillar.get(pillar) ?? [],
  }));
}

export function findEntryByPath(
  entries: StandardsEntry[],
  path: string,
): StandardsEntry | undefined {
  const normalized = path.replace(/\/$/, '').replace(/\.md$/, '');
  return entries.find((e) => entrySlug(e) === normalized);
}
