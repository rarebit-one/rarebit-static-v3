// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://rarebit.one",
  output: "static",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Old /notes slug → /field-notes. Only already-published paths need an entry.
  redirects: {
    "/notes": "/field-notes/",
    "/notes/this-site-was-built-by-the-farm": "/field-notes/this-site-was-built-by-the-farm/",
  },
});
