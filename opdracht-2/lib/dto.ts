/**
 * De vorm die de browser te zien krijgt.
 *
 * Bewust een eigen laag tussen Storyteq en de UI: de API is deels
 * ongedocumenteerd en kan veranderen, en rauwe API-output hoort niet in de
 * interface. Alle vertaalslag en alle giswerk zit hier, op één plek.
 */
import type { Media, Template, TemplateParameter } from "./schemas";
import { normalizeStatus, type MediaStatus } from "./schemas";

/** Hoe een veld in de UI getoond wordt. */
export type FieldKind =
  | "text"
  | "longtext"
  | "image"
  | "video"
  | "color"
  | "number"
  | "boolean"
  | "url"
  | "unknown";

export type FormField = {
  /** De sleutel die terug moet in `template_parameters`. */
  name: string;
  /** Mensvriendelijk label. Valt terug op een opgeschoonde `name`. */
  label: string;
  kind: FieldKind;
  /** Wat Storyteq zelf zei; blijft zichtbaar in de discovery-docs, niet in de UI. */
  rawType: string | null;
  placeholder?: string;
};

export type TemplateSummary = {
  id: string;
  name: string;
  fieldCount: number;
  updatedAt: string | null;
  thumbnailUrl: string | null;
};

export type TemplateDetail = TemplateSummary & {
  fields: FormField[];
};

/** De fasen die de gebruiker in stap 3 ziet. */
export type AssetPhase = MediaStatus;

export type AssetState = {
  id: string;
  templateId: string | null;
  phase: AssetPhase;
  /** 0–100. Een schatting: Storyteq geeft geen percentage terug. */
  progress: number;
  done: boolean;
  failed: boolean;
  /** Wat we kunnen tonen zodra het klaar is. */
  result: {
    kind: "video" | "image";
    /** Onze eigen proxy-URL, niet die van Storyteq. */
    previewUrl: string;
    downloadUrl: string;
    fileName: string;
  } | null;
};

/**
 * Storyteq's `type` is in de spec alleen `string`, zonder enum. Deze mapping is
 * afgeleid uit de echte responses (zie docs/api-discovery.md) en bewust
 * tolerant: onbekende types worden een gewoon tekstveld in plaats van een crash.
 */
const KIND_RULES: Array<[RegExp, FieldKind]> = [
  [/^(text|string|line|headline|title|copy)$/i, "text"],
  [/(textarea|paragraph|multiline|long_?text|body)/i, "longtext"],
  [/(image|photo|picture|logo|asset|media)/i, "image"],
  [/(video|clip|footage)/i, "video"],
  [/(colou?r|hex)/i, "color"],
  [/(number|int|float|duration|size|count)/i, "number"],
  [/(bool|toggle|switch|checkbox|visible|enabled)/i, "boolean"],
  [/(url|link|href|cta_?link)/i, "url"],
];

export function fieldKind(rawType: string | null | undefined, name = ""): FieldKind {
  const haystack = `${rawType ?? ""}`;
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(haystack)) return kind;
  }
  // Geen match op type? Dan mag de naam nog een hint geven.
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(name)) return kind;
  }
  return rawType ? "unknown" : "text";
}

/** Afkortingen die als afkorting horen te blijven staan, niet als "Cta". */
const ACRONYMS = new Set(["cta", "url", "usp", "qr", "pdf", "cta1", "cta2"]);

/** `scene_1.headline_text` → `Headline text`, `scene_2.cta_link` → `CTA link`. */
export function humanizeName(name: string): string {
  const tail = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  const words = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\-\s]+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase();
    })
    .join(" ");
}

function toField(param: TemplateParameter): FormField {
  const label = param.label?.trim() || humanizeName(param.name);
  const kind = fieldKind(param.type, param.name);
  return {
    name: param.name,
    label,
    kind,
    rawType: param.type ?? null,
    placeholder: kind === "color" ? "#000000" : undefined,
  };
}

/**
 * Storyteq documenteert geen thumbnail-veld. We kijken op de plekken waar er
 * in de praktijk een afbeelding-URL kan staan en vallen anders netjes terug.
 */
function findThumbnail(template: Template): string | null {
  const candidates: unknown[] = [
    (template as Record<string, unknown>).thumbnail,
    (template as Record<string, unknown>).thumbnail_url,
    (template as Record<string, unknown>).preview_url,
    (template as Record<string, unknown>).poster,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

export function toTemplateSummary(template: Template): TemplateSummary {
  return {
    id: template.id,
    name: template.name?.trim() || `Template ${template.id}`,
    fieldCount: template.parameters?.length ?? 0,
    updatedAt: template.updated_at ?? null,
    thumbnailUrl: findThumbnail(template),
  };
}

export function toTemplateDetail(template: Template): TemplateDetail {
  return {
    ...toTemplateSummary(template),
    fields: (template.parameters ?? []).map(toField),
  };
}

/** Ruwe schatting; Storyteq geeft geen voortgangspercentage. */
const PHASE_PROGRESS: Record<AssetPhase, number> = {
  queued: 8,
  rendering: 45,
  uploading: 85,
  finished: 100,
  failed: 100,
  unknown: 25,
};

function pickResultUrl(media: Media): { kind: "video" | "image"; url: string } | null {
  // De spec noemt zowel `urls` als `download_urls`; we pakken wat er is.
  for (const bag of [media.download_urls, media.urls]) {
    if (!bag) continue;
    const video = bag.video;
    if (typeof video === "string" && video) return { kind: "video", url: video };
    const image = bag.image ?? bag.gif ?? bag.banner;
    if (typeof image === "string" && image) return { kind: "image", url: image };
  }
  return null;
}

export function toAssetState(media: Media): AssetState {
  const phase = normalizeStatus(media.current_status);
  const source = pickResultUrl(media);
  const finished = phase === "finished";

  return {
    id: media.id,
    templateId: media.template_id ?? null,
    phase,
    progress: PHASE_PROGRESS[phase],
    done: finished,
    failed: phase === "failed",
    result:
      finished && source
        ? {
            kind: source.kind,
            previewUrl: `/api/assets/${media.id}/download?disposition=inline`,
            downloadUrl: `/api/assets/${media.id}/download`,
            fileName: fileNameFor(media, source),
          }
        : null,
  };
}

export function fileNameFor(
  media: Media,
  source: { kind: "video" | "image"; url: string },
): string {
  const fromUrl = source.url.split("?")[0].split("/").pop() ?? "";
  const ext = /\.[a-z0-9]{2,4}$/i.test(fromUrl)
    ? fromUrl.slice(fromUrl.lastIndexOf("."))
    : source.kind === "video"
      ? ".mp4"
      : ".png";
  const base = (media.name?.trim() || `storyteq-${media.id}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || `asset-${media.id}`}${ext}`;
}

/** De URL waar het bestand écht staat — alleen server-side gebruikt. */
export function sourceUrlFor(media: Media) {
  return pickResultUrl(media);
}
