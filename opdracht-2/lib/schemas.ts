import { z } from "zod";

/**
 * Zod-schemas voor de Storyteq v4 API.
 *
 * Startpunt: de OpenAPI-spec in docs/specs/storyteq-api_v4_openapi.yaml.
 * Daarna bijgesteld op wat de API in werkelijkheid teruggeeft — zie
 * docs/api-discovery.md voor de verschillen die we tegenkwamen.
 *
 * Bewust *loose*: onbekende velden mogen erbij zitten zonder dat de app breekt.
 * Een API die we niet volledig kennen mag geen harde parse-fout opleveren.
 */

/** Statussen uit de webhook-schemas van de spec. `unknown` vangt alles wat we nog niet zagen. */
export const MEDIA_STATUSES = [
  "queued",
  "rendering",
  "uploading",
  "finished",
  "failed",
] as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[number] | "unknown";

export function normalizeStatus(raw: unknown): MediaStatus {
  const value = String(raw ?? "").toLowerCase().trim();
  return (MEDIA_STATUSES as readonly string[]).includes(value)
    ? (value as MediaStatus)
    : "unknown";
}

/** Keuzelijst bij `type: "enum"`: `meta.values` bevat label/value-paren. */
export const parameterMetaSchema = z.looseObject({
  values: z
    .array(
      z.looseObject({
        label: z.string().nullish(),
        value: z.union([z.string(), z.number()]).transform(String),
      }),
    )
    .nullish(),
  labels: z.boolean().nullish(),
  managingScene: z.boolean().nullish(),
});

export const templateParameterSchema = z.looseObject({
  name: z.string(),
  label: z.string().nullish(),
  type: z.string().nullish(),
  /** Komt als 0/1 binnen, niet als boolean. */
  required: z.union([z.boolean(), z.number(), z.string()]).nullish(),
  order: z.number().nullish(),
  default: z.string().nullish(),
  value: z.string().nullish(),
  meta: parameterMetaSchema.nullish(),
  /** Toont dit veld alleen bij een bepaalde waarde van een ander veld. */
  show_if: z.unknown().nullish(),
  input_type: z.string().nullish(),
});

/** `required` komt als 0/1, "1", of boolean binnen — allemaal hetzelfde bedoeld. */
export function isRequired(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

export const templateSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  parameters: z.array(templateParameterSchema).nullish(),
  project_dir: z.string().nullish(),
  blueprint: z.unknown().nullish(),
  /** Staat niet in de spec, maar zit er wel in — ook op het lijst-endpoint. */
  thumbnail_url: z.string().nullish(),
  /** Geschatte rendertijd in seconden. Alleen op het detail-endpoint. */
  processing_time: z.number().nullish(),
  main_media_type: z.string().nullish(),
  /** Welke formaten deze template oplevert: video, banner en/of image. */
  media_types: z.array(z.looseObject({ type: z.string().nullish() })).nullish(),
  archive: z.boolean().nullish(),
  media_count: z.number().nullish(),
});

export const mediaParameterSchema = z.looseObject({
  name: z.string(),
  label: z.string().nullish(),
  type: z.string().nullish(),
  value: z.unknown().nullish(),
});

/**
 * De spec noemt `urls` (Media) én `download_urls` (MediaEvent) alsof het
 * alternatieven zijn. In werkelijkheid bestaan ze allebei en betekenen ze iets
 * anders: `urls` wijst naar de CDN om te bekíjken, `download_urls` naar
 * `/v4/open/media/{hash}/download/{format}` om te downloaden.
 */
const urlBagSchema = z
  .looseObject({
    image: z.string().nullish(),
    video: z.string().nullish(),
    gif: z.string().nullish(),
    banner: z.string().nullish(),
    preview_video: z.string().nullish(),
  })
  .nullish();

export const mediaSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform(String),
  template_id: z.union([z.number(), z.string()]).transform(String).nullish(),
  hash: z.string().nullish(),
  current_status: z.string().nullish(),
  name: z.string().nullish(),
  urls: urlBagSchema,
  download_urls: urlBagSchema,
  parameters: z.array(mediaParameterSchema).nullish(),
  duration: z.number().nullish(),
  main_media_type: z.string().nullish(),
  /**
   * Ongedocumenteerd: tijdstempels per fase. Hiermee is de werkelijke duur van
   * eerdere renders te berekenen, en dus een eerlijke verwachting te geven.
   */
  events: z
    .array(z.looseObject({ type: z.string().nullish(), created_at: z.string().nullish() }))
    .nullish(),
  /** De media-response draagt de template mee — handig voor een nette bestandsnaam. */
  template: z.looseObject({ name: z.string().nullish() }).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

/** Laravel-paginatie; bevestigd op /content/templates/{id}/media. */
export const paginationMetaSchema = z.looseObject({
  current_page: z.number().nullish(),
  last_page: z.number().nullish(),
  per_page: z.number().nullish(),
  total: z.number().nullish(),
});

/** Alle v4-responses zitten in een `data`-envelope. */
export const envelope = <T extends z.ZodTypeAny>(inner: T) =>
  z.looseObject({ data: inner });

export const listTemplatesSchema = envelope(z.array(templateSchema));
export const listMediaSchema = envelope(z.array(mediaSchema));
export const singleTemplateSchema = envelope(templateSchema);
export const createdMediaSchema = z.looseObject({
  message: z.string().nullish(),
  data: mediaSchema,
});
export const singleMediaSchema = envelope(mediaSchema);

/** 422: per-parameter foutmeldingen, keys in de vorm `scene.parameter`. */
export const validationErrorSchema = z.looseObject({
  message: z.string().nullish(),
  errors: z.record(z.string(), z.array(z.string())).nullish(),
});

/** 4XX: `{ error: { message } }`. */
export const genericErrorSchema = z.looseObject({
  error: z.looseObject({ message: z.string().nullish() }).nullish(),
  message: z.string().nullish(),
});

export type Template = z.infer<typeof templateSchema>;
export type TemplateParameter = z.infer<typeof templateParameterSchema>;
export type Media = z.infer<typeof mediaSchema>;
