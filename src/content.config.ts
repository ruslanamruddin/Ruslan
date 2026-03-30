import { defineCollection, z } from "astro:content";

const projectStatus = z.enum([
  "Ongoing",
  "Results ready (writing)",
  "Preparing submission",
  "Under review",
  "Published",
]);

const projectType = z.enum(["Research", "Tool", "Prototype"]);

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string().min(1),
    date: z.coerce.date(),
    last_updated: z.coerce.date(),
    type: projectType,
    status: projectStatus,
    tags: z.array(z.string()).default([]),
    summary: z.string().min(1),
    abstract: z.string().min(1),
    featured_image: z.string().optional(),
    links: z
      .object({
        github: z.string().url().optional(),
        demo: z.string().url().optional(),
        poster: z.string().url().optional(),
        slides: z.string().url().optional(),
        dataset: z.string().url().optional(),
      })
      .default({}),
    venue_target: z.string().optional(),
    updates: z
      .array(
        z.object({
          date: z.coerce.date(),
          note: z.string().min(1),
        }),
      )
      .default([]),
    pinned: z.boolean().optional().default(false),
  }),
});

export const collections = {
  projects,
};

export type ProjectStatus = z.infer<typeof projectStatus>;
export type ProjectType = z.infer<typeof projectType>;
