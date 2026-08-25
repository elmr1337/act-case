import { cacheMedia, getCachedMedia } from "@/lib/asset-cache";
import { getConfig } from "@/lib/config";
import { AppError, handler } from "@/lib/api";
import { fileNameFor, sourceUrlFor, type SourceVariant } from "@/lib/dto";
import { getMedia } from "@/lib/storyteq";
import { normalizeStatus } from "@/lib/schemas";

/**
 * Stap 4: het bestand zelf.
 *
 * Waarom door de proxy en niet gewoon de Storyteq-URL in een `<a download>`?
 * 1. `download` werkt cross-origin niet — de browser opent dan een tab met een
 *    player in plaats van te downloaden. Met een eigen `Content-Disposition`
 *    is het écht één klik.
 * 2. De Storyteq-URL's zijn "secure URLs" die we niet in de client willen zetten.
 *
 * De bron-URL komt altijd uit de media-response van Storyteq zelf, nooit uit
 * de request — er valt hier dus niets naar een willekeurige host te proxyen.
 */
export const GET = handler(
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    // `preview` = de CDN-URL in de speler, `thumbnail` = alleen het stilstaande
    // beeld (voor voorbeelden bij keuzevelden), anders het download-endpoint.
    const requested = new URL(request.url).searchParams.get("variant");
    const variant: SourceVariant =
      requested === "preview" || requested === "thumbnail" ? requested : "download";

    const media = await resolveMedia(id);
    const source = sourceUrlFor(media, variant);
    if (!source) {
      throw new AppError("not_found", {
        message: "Dit bestand is nog niet klaar om te downloaden.",
      });
    }

    const range = request.headers.get("range");
    const upstream = await fetchAsset(source.url, range);

    if (!upstream.ok && upstream.status !== 206) {
      throw new AppError("upstream", {
        message: "Het bestand kon niet opgehaald worden bij Storyteq.",
        detail: `download ${upstream.status} op ${new URL(source.url).host}`,
      });
    }

    const fileName = fileNameFor(media, source);
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ??
        (source.kind === "video" ? "video/mp4" : "application/octet-stream"),
    );
    headers.set(
      "Content-Disposition",
      `${variant === "download" ? "attachment" : "inline"}; filename="${fileName}"`,
    );
    // Doorgeven zodat de video-player kan spoelen.
    for (const key of ["content-length", "content-range", "accept-ranges", "etag"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    // Thumbnails van eerdere renders veranderen niet meer.
    headers.set(
      "Cache-Control",
      variant === "thumbnail" ? "private, max-age=3600" : "private, max-age=300",
    );

    return new Response(upstream.body, { status: upstream.status, headers });
  },
);

/**
 * Haalt de media op, maar hergebruikt een afgeronde render uit de cache. Dat
 * scheelt een Storyteq-call per Range-request van de videospeler.
 */
async function resolveMedia(id: string) {
  const cached = getCachedMedia(id);
  if (cached) return cached;

  const media = await getMedia(id);
  if (normalizeStatus(media.current_status) === "finished") {
    cacheMedia(id, media);
  }
  return media;
}

/**
 * Of de asset-URL's auth nodig hebben staat nergens gedocumenteerd. We proberen
 * eerst zonder — een presigned URL wil de Authorization-header vaak juist niet —
 * en pas bij een weigering met token.
 */
async function fetchAsset(url: string, range: string | null) {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;

  const anonymous = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (anonymous.status !== 401 && anonymous.status !== 403) return anonymous;

  await anonymous.body?.cancel();
  return fetch(url, {
    headers: { ...headers, Authorization: `Bearer ${getConfig().apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
}
