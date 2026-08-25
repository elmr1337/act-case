import { AppError, handler } from "@/lib/api";
import { getRememberedThumbnail } from "@/lib/template-cache";
import { getTemplate } from "@/lib/storyteq";

/**
 * Thumbnails lopen ook door de proxy. Ze zijn publiek — `thumbnail_url` is een
 * 302 naar de CDN zonder auth — maar de afspraak is dat de browser alleen met
 * onze eigen API praat. Dat scheelt bovendien een derde partij die meekijkt
 * welke templates iemand bekijkt.
 */
export const GET = handler(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;

    // Meestal al bekend uit de lijst-call; anders alsnog ophalen.
    const source = getRememberedThumbnail(id) ?? (await getTemplate(id)).thumbnail_url;
    if (!source) {
      throw new AppError("not_found", { message: "Deze template heeft geen voorbeeld." });
    }

    const upstream = await fetch(source, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      throw new AppError("upstream", {
        message: "Het voorbeeld kon niet geladen worden.",
        detail: `thumbnail ${upstream.status}`,
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Thumbnails veranderen zelden; een uur cachen scheelt veel calls.
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
);
