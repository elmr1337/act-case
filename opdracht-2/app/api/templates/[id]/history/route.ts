import { handler, ok } from "@/lib/api";
import { buildHistory } from "@/lib/history";
import { getCachedHistory, cacheHistory } from "@/lib/template-cache";
import { listTemplateMedia } from "@/lib/storyteq";

/**
 * Wat deze template in de praktijk doet: hoe lang een render duurt en hoe de
 * keuzes eruitzien. Allebei afgeleid uit eerdere media, want de API vertelt het
 * niet — zie docs/api-discovery.md §6 en §4.
 *
 * Dit is aanvullende informatie: als het misgaat werkt de rest van de flow
 * gewoon door, dus een fout hier levert een lege historie op in plaats van een
 * foutscherm.
 */
export const GET = handler(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    const cached = getCachedHistory(id);
    if (cached) return ok(cached);

    try {
      const history = buildHistory(await listTemplateMedia(id));
      cacheHistory(id, history);
      return ok(history);
    } catch (err) {
      console.error("[history] kon de historie niet opbouwen", err);
      return ok({ estimate: null, optionExamples: {} });
    }
  },
);
