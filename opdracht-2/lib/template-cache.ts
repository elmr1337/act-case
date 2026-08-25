import type { Template } from "./schemas";

/**
 * De thumbnail-URL van een template staat al in de lijst-response. Zonder deze
 * cache zou de thumbnail-proxy voor élke kaart een apart `GET
 * /content/templates/{id}` moeten doen — veertien extra calls bij het openen
 * van de eerste pagina.
 *
 * Alleen de URL wordt onthouden, niet de template zelf.
 */
const TTL_MS = 10 * 60_000;

const thumbnails = new Map<string, { url: string; expiresAt: number }>();

export function rememberThumbnails(templates: Template[]) {
  const expiresAt = Date.now() + TTL_MS;
  for (const template of templates) {
    if (typeof template.thumbnail_url === "string" && template.thumbnail_url) {
      thumbnails.set(template.id, { url: template.thumbnail_url, expiresAt });
    }
  }
}

export function getRememberedThumbnail(id: string): string | null {
  const entry = thumbnails.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    thumbnails.delete(id);
    return null;
  }
  return entry.url;
}

/** Alleen voor tests. */
export function clearThumbnailCache() {
  thumbnails.clear();
}
