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

export const templateParameterSchema = z.looseObject({
  name: z.string(),
  label: z.string().nullish(),
  type: z.string().nullish(),
});

export const templateSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  parameters: z.array(templateParameterSchema).nullish(),
  project_dir: z.string().nullish(),
  blueprint: z.unknown().nullish(),
});

export const mediaParameterSchema = z.looseObject({
  name: z.string(),
  label: z.string().nullish(),
  type: z.string().nullish(),
  value: z.unknown().nullish(),
});

/** De spec noemt zowel `urls` (Media) als `download_urls` (MediaEvent). We accepteren allebei. */
const urlBagSchema = z
  .looseObject({
    image: z.string().nullish(),
    video: z.string().nullish(),
    gif: z.string().nullish(),
    banner: z.string().nullish(),
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
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

/** Alle v4-responses zitten in een `data`-envelope. */
export const envelope = <T extends z.ZodTypeAny>(inner: T) =>
  z.looseObject({ data: inner });

export const listTemplatesSchema = envelope(z.array(templateSchema));
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
