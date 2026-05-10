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

export const collections = {
  insights,
};

