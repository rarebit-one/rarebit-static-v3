import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { site } from "../data/site";

export async function GET(context) {
  const notes = await getCollection("notes");
  return rss({
    title: "Rarebit — Field notes",
    description:
      "Build logs from the automation farm: what we shipped, what broke, and what we learned.",
    site: context.site,
    items: notes
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((note) => ({
        title: note.data.title,
        description: note.data.description,
        pubDate: note.data.pubDate,
        link: `/notes/${note.id}/`,
      })),
    customData: `<language>en</language><managingEditor>${site.email} (Rarebit)</managingEditor>`,
  });
}
