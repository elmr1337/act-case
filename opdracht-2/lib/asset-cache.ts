import type { Media } from "./schemas";

/**
 * Een videospeler doet tientallen Range-requests op één bestand. Zonder cache
 * zou elke daarvan een aparte `GET /content/media/{id}` bij Storyteq opleveren:
 * traag, en een uitstekende manier om tegen een rate limit aan te lopen.
 *
 * De bron-URL van een afgeronde render verandert niet meer (Storyteq bewaart
 * assets standaard 30 dagen), dus een korte TTL is ruim voldoende. Alleen
 * afgeronde media komen in de cache — een render die nog loopt moet elke keer
 * opnieuw opgehaald worden.
 */
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

type Entry = { media: Media; expiresAt: number };

const cache = new Map<string, Entry>();

export function getCachedMedia(id: string): Media | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(id);
    return null;
  }
  // Opnieuw invoegen zodat de oudste sleutel achteraan blijft staan (LRU-achtig).
  cache.delete(id);
  cache.set(id, entry);
  return entry.media;
}

export function cacheMedia(id: string, media: Media) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(id, { media, expiresAt: Date.now() + TTL_MS });
}

/** Alleen voor tests. */
export function clearMediaCache() {
  cache.clear();
}
