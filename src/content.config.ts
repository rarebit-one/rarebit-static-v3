import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Field notes — build logs from the farm. Agent-drafted, human-reviewed,
// like everything else that ships here.
const fieldNotes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/field-notes" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
  }),
});

export const collections = { fieldNotes };
