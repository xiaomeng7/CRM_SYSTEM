import { defineCollection, z } from 'astro:content';

const insights = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(10),
    h1: z.string().min(10),
    metaTitle: z.string().min(10),
    metaDescription: z.string().min(20),
    intent: z.enum(['pre_purchase', 'builder', 'service', 'suburb', 'advisory', 'informational']),
    suburb: z.string().optional(),
    serviceType: z.string().optional(),
    publishedAt: z.date(),
    updatedAt: z.date().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    ctaType: z.enum(['pre_purchase', 'builder', 'contact', 'services']).default('contact'),
    relatedLandingPage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const standards = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    h1: z.string(),
    eyebrow: z.string().optional(),
    pillar: z.string(),
    topic: z.string(),
    collection: z.string().optional(),
    series: z.string().optional(),
    metaTitle: z.string(),
    metaDescription: z.string(),
    status: z.enum(['published', 'draft']).default('published'),
    version: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
    roles: z.array(z.string()).default(['all']),
    relatedStandards: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  insights,
  standards,
};

