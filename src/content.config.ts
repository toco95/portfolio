import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['Product', 'Design', 'Branding', 'Webdesign', 'Achievement']),
    group: z.enum(['Hyperline', 'Shine', 'Freelance']),
    featured: z.boolean().default(false),
    order: z.number().default(99),
    hasDetailPage: z.boolean().default(false),
    externalUrl: z.string().optional(),
    cover: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
  }),
});

const milestones = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/data/milestones' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    externalUrl: z.string().optional(),
  }),
});

export const collections = { projects, milestones };
