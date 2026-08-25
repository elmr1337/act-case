/**
 * De vorm die de browser te zien krijgt.
 *
 * Bewust een eigen laag tussen Storyteq en de UI: de API is deels
 * ongedocumenteerd en kan veranderen, en rauwe API-output hoort niet in de
 * interface. Alle vertaalslag en alle giswerk zit hier, op één plek.
 */
import type { Media, Template, TemplateParameter } from "./schemas";
import { isRequired, normalizeStatus, type MediaStatus } from "./schemas";

/** Hoe een veld in de UI getoond wordt. */
export type FieldKind =
  | "text"
  | "longtext"
  | "select"
  | "image"
  | "video"
  | "color"
  | "number"
  | "boolean"
  | "url"
  | "unknown";

export type FieldOption = { label: string; value: string };

/**
 * Grove categorie voor de visuele groepering in het formulier. We groeperen
 * alleen *opeenvolgende* velden van dezelfde categorie, zodat de volgorde die
 * de template zelf aangeeft (`order`) intact blijft.
 */
export type FieldGroup = "keuze" | "tekst" | "beeld" | "overig";

export function groupOf(kind: FieldKind): FieldGroup {
  if (kind === "select" || kind === "boolean" || kind === "color") return "keuze";
  if (kind === "text" || kind === "longtext" || kind === "number") return "tekst";
  if (kind === "image" || kind === "video" || kind === "url") return "beeld";
  return "overig";
}

export type FormField = {
  /** De sleutel die terug moet in `template_parameters`. */
  name: string;
  /** Mensvriendelijk label. Valt terug op een opgeschoonde `name`. */
  label: string;
  kind: FieldKind;
  /** Wat Storyteq zelf zei; blijft zichtbaar in de discovery-docs, niet in de UI. */
  rawType: string | null;
  required: boolean;
  group: FieldGroup;
  /** Alleen bij `select`: de keuzes uit `meta.values`. */
  options?: FieldOption[];
  /** Voorinvulling uit `default` of `value`. */
  initialValue: string;
  placeholder?: string;
};

export type TemplateSummary = {
  id: string;
  name: string;
  /** Wat er uit deze template komt: een video, een banner of een afbeelding. */
  mediaKind: "video" | "banner" | "image" | null;
  /** Hoe vaak er al iets mee gemaakt is. */
  usageCount: number | null;
  updatedAt: string | null;
  thumbnailUrl: string | null;
};

export type TemplateDetail = TemplateSummary & {
  /** Geschatte rendertijd in seconden, uit `processing_time`. */
  estimatedSeconds: number | null;
  fields: FormField[];
};

/** De fasen die de gebruiker in stap 3 ziet. */
export type AssetPhase = MediaStatus;

export type AssetState = {
  id: string;
  templateId: string | null;
  phase: AssetPhase;
  /**
   * Wanneer Storyteq de render aannam. Hiermee klopt de verstreken tijd ook na
   * een refresh of als je de link later opnieuw opent.
   */
  startedAt: string | null;
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
  [/^(enum|select|dropdown|choice|list)$/i, "select"],
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
  const options = (param.meta?.values ?? [])
    .map((option) => ({
      label: option.label?.trim() || option.value,
      value: option.value,
    }))
    .filter((option) => option.value !== "");

  // Een enum zonder keuzes is geen keuzelijst; dan maar een tekstveld.
  const kind =
    fieldKind(param.type, param.name) === "select" && options.length === 0
      ? "text"
      : fieldKind(param.type, param.name);

  return {
    name: param.name,
    label: param.label?.trim() || humanizeName(param.name),
    kind,
    group: groupOf(kind),
    rawType: param.type ?? null,
    required: isRequired(param.required),
    options: kind === "select" ? options : undefined,
    initialValue: param.default?.trim() || param.value?.trim() || "",
    placeholder: kind === "color" ? "#000000" : undefined,
  };
}

/**
 * De OpenAPI-spec kent geen thumbnail, maar de API geeft `thumbnail_url` wél
 * terug — ook op het lijst-endpoint. Die URL is publiek (302 naar de CDN),
 * maar we sturen hem niet naar de browser: die haalt hem via onze eigen proxy
 * op, net als al het andere.
 */
function findThumbnail(template: Template): string | null {
  const url = template.thumbnail_url;
  const hasThumbnail = typeof url === "string" && /^https?:\/\//.test(url);
  return hasThumbnail ? `/api/templates/${encodeURIComponent(template.id)}/thumbnail` : null;
}

/**
 * Het lijst-endpoint geeft geen `parameters` terug — alleen het detail-endpoint
 * doet dat. Op de kaart tonen we daarom niet het aantal velden maar wat er
 * uitkomt: `media_types` bevat bijvoorbeeld ["image", "video"], waarbij de
 * afbeelding de poster van de video is.
 */
function mediaKindOf(template: Template): TemplateSummary["mediaKind"] {
  const kinds = new Set(
    (template.media_types ?? []).map((m) => m.type?.toLowerCase()).filter(Boolean),
  );
  const main = template.main_media_type?.toLowerCase();
  if (main === "video" || kinds.has("video")) return "video";
  if (main === "banner" || kinds.has("banner")) return "banner";
  if (kinds.has("image")) return "image";
  return null;
}

export function toTemplateSummary(template: Template): TemplateSummary {
  return {
    id: template.id,
    name: template.name?.trim() || `Template ${template.id}`,
    mediaKind: mediaKindOf(template),
    usageCount: template.media_count ?? null,
    updatedAt: template.updated_at ?? null,
    thumbnailUrl: findThumbnail(template),
  };
}

export function toTemplateDetail(template: Template): TemplateDetail {
  const parameters = [...(template.parameters ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  return {
    ...toTemplateSummary(template),
    /** Geschatte rendertijd in seconden; gebruikt in de copy van stap 3. */
    estimatedSeconds: template.processing_time ?? null,
    fields: parameters.map(toField),
  };
}

/**
 * Of een ingevulde waarde er goed uitziet. Bewust mild: we weten niet wat
 * Storyteq precies accepteert (zie docs/api-discovery.md §9), dus dit stuurt
 * alleen het vinkje in de UI en blokkeert nooit het versturen — behalve bij een
 * leeg verplicht veld.
 */
export function isFieldValid(field: FormField, raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;

  switch (field.kind) {
    case "color":
      return /^#[0-9a-f]{3,8}$/i.test(value);
    case "url":
    case "image":
    case "video":
      return /^https?:\/\/\S+\.\S+/i.test(value);
    case "number":
      return Number.isFinite(Number(value));
    case "select":
      return (field.options ?? []).some((option) => option.value === value);
    default:
      return true;
  }
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

export type AssetSource = { kind: "video" | "image"; url: string };

function firstUrl(
  bag: Media["urls"],
  keys: Array<"video" | "preview_video" | "image" | "gif" | "banner">,
): AssetSource | null {
  if (!bag) return null;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value) {
      return { kind: key.includes("video") ? "video" : "image", url: value };
    }
  }
  return null;
}

/**
 * Om te tónen: de CDN-URL's uit `urls`. Die serveren het bestand zelf en
 * ondersteunen Range-requests, dus de videospeler kan ermee spoelen.
 */
export function previewSourceFor(media: Media): AssetSource | null {
  return (
    firstUrl(media.urls, ["video", "preview_video", "image"]) ??
    firstUrl(media.download_urls, ["video", "image", "gif", "banner"])
  );
}

/**
 * Om te downloaden: `download_urls` wijst naar
 * `/v4/open/media/{hash}/download/{formaat}`, het endpoint dat Storyteq
 * daarvoor bedoeld heeft. Valt terug op de CDN-URL als dat er niet is.
 */
export function downloadSourceFor(media: Media): AssetSource | null {
  return (
    firstUrl(media.download_urls, ["video", "image", "gif", "banner"]) ??
    firstUrl(media.urls, ["video", "preview_video", "image"])
  );
}

export function toAssetState(media: Media): AssetState {
  const phase = normalizeStatus(media.current_status);
  const source = downloadSourceFor(media);
  const finished = phase === "finished";

  return {
    id: media.id,
    templateId: media.template_id ?? null,
    phase,
    startedAt: media.created_at ?? null,
    progress: PHASE_PROGRESS[phase],
    done: finished,
    failed: phase === "failed",
    result:
      finished && source
        ? {
            kind: (previewSourceFor(media) ?? source).kind,
            /** Onze eigen proxy, nooit de Storyteq-URL. */
            previewUrl: `/api/assets/${media.id}/download?variant=preview`,
            downloadUrl: `/api/assets/${media.id}/download`,
            fileName: fileNameFor(media, source),
          }
        : null,
  };
}

/**
 * Een nette bestandsnaam. `media.name` is in de praktijk gewoon het id
 * opnieuw, dus de templatenaam levert iets op waar iemand later nog wat aan
 * heeft: `opdracht-2-26943410.mp4`.
 */
export function fileNameFor(media: Media, source: AssetSource): string {
  const fromUrl = source.url.split("?")[0].split("/").pop() ?? "";
  const ext = /\.[a-z0-9]{2,4}$/i.test(fromUrl)
    ? fromUrl.slice(fromUrl.lastIndexOf("."))
    : source.kind === "video"
      ? ".mp4"
      : ".jpg";

  const label = media.template?.name?.trim() || "";
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return base ? `${base}-${media.id}${ext}` : `storyteq-${media.id}${ext}`;
}

/** Alleen het stilstaande beeld — gebruikt voor voorbeelden bij keuzevelden. */
export function thumbnailSourceFor(media: Media): AssetSource | null {
  return firstUrl(media.urls, ["image"]) ?? firstUrl(media.download_urls, ["image"]);
}

export type SourceVariant = "preview" | "download" | "thumbnail";

/** De URL waar het bestand écht staat — alleen server-side gebruikt. */
export function sourceUrlFor(media: Media, variant: SourceVariant) {
  if (variant === "thumbnail") return thumbnailSourceFor(media);
  return variant === "preview" ? previewSourceFor(media) : downloadSourceFor(media);
}
