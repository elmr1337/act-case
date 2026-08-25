import "server-only";
import { z } from "zod";

import { ConfigError } from "./config";
import { shapeOf } from "./discovery";
import { AppError, codeForStatus, humanizeFieldError } from "./errors";
import { rawRequest, type RawResult } from "./storyteq-transport";
import {
  createdMediaSchema,
  genericErrorSchema,
  listTemplatesSchema,
  singleMediaSchema,
  singleTemplateSchema,
  validationErrorSchema,
} from "./schemas";

/**
 * Dunne client op de Storyteq v4 API (Creative Automation).
 *
 * Base URL:  https://api.{region}.storyteq.com/v4
 * Auth:      Authorization: Bearer <token>
 *
 * Deze module is de ENIGE plek die de token aanraakt. Hij draait uitsluitend
 * server-side (`server-only`), zodat de key nooit in een client bundle belandt.
 */

type RequestOptions<T extends z.ZodTypeAny> = {
  method?: "GET" | "POST";
  body?: unknown;
  schema: T;
  note?: string;
};

async function request<T extends z.ZodTypeAny>(
  path: string,
  { method = "GET", body, schema, note }: RequestOptions<T>,
): Promise<z.infer<T>> {
  let raw: RawResult;
  try {
    raw = await rawRequest(path, { method, body, note });
  } catch (err) {
    if (err instanceof ConfigError) {
      throw new AppError("config", { detail: err.issues.join(", "), cause: err });
    }
    throw err;
  }

  if (!raw.ok) {
    throw errorFromResponse(raw);
  }

  const parsed = schema.safeParse(raw.body);
  if (!parsed.success) {
    // De app breekt hier niet stilletjes: we willen dit in de logs zien staan,
    // want het betekent dat docs/api-discovery.md achterloopt op de API.
    console.error(`[storyteq] onverwachte response-vorm op ${path}`, {
      shape: shapeOf(raw.body),
      issues: parsed.error.issues.slice(0, 5),
    });
    throw new AppError("shape", { detail: parsed.error.message });
  }
  return parsed.data;
}

function errorFromResponse(raw: RawResult): AppError {
  const code = codeForStatus(raw.status);

  if (code === "validation") {
    const parsed = validationErrorSchema.safeParse(raw.body);
    const upstreamFields = parsed.success ? parsed.data.errors : undefined;

    // Vertaald naar het Nederlands; de originele tekst blijft in `detail`.
    const fieldErrors = upstreamFields
      ? Object.fromEntries(
          Object.entries(upstreamFields).map(([field, messages]) => [
            field,
            [humanizeFieldError(messages)],
          ]),
        )
      : undefined;

    return new AppError("validation", {
      fieldErrors,
      detail: raw.bodyText.slice(0, 500),
    });
  }

  const parsed = genericErrorSchema.safeParse(raw.body);
  const upstreamMessage = parsed.success
    ? (parsed.data.error?.message ?? parsed.data.message ?? undefined)
    : undefined;

  return new AppError(code, {
    // Let op: de upstream-tekst gaat naar `detail` (server-side logs),
    // niet naar `message` (dat is wat de gebruiker leest).
    detail: upstreamMessage ?? raw.bodyText.slice(0, 500),
  });
}

export async function listTemplates() {
  const result = await request("/content/templates/", {
    schema: listTemplatesSchema,
    note: "templates ophalen",
  });
  return result.data;
}

export async function getTemplate(templateId: string) {
  const result = await request(`/content/templates/${encodeURIComponent(templateId)}`, {
    schema: singleTemplateSchema,
    note: "template + parameters ophalen",
  });
  return result.data;
}

export async function createMedia(
  templateId: string,
  templateParameters: Record<string, string>,
) {
  const result = await request(
    `/content/templates/${encodeURIComponent(templateId)}/media`,
    {
      method: "POST",
      body: { template_parameters: templateParameters },
      schema: createdMediaSchema,
      note: "media aanmaken",
    },
  );
  return result.data;
}

export async function getMedia(mediaId: string) {
  const result = await request(`/content/media/${encodeURIComponent(mediaId)}`, {
    schema: singleMediaSchema,
    note: "media-status pollen",
  });
  return result.data;
}
