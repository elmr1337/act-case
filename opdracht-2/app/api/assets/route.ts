import { z } from "zod";

import { AppError, handler, ok } from "@/lib/api";
import { toAssetState } from "@/lib/dto";
import { createMedia } from "@/lib/storyteq";

/**
 * Stap 2 → 3: media aanmaken op een template.
 *
 * We valideren hier alleen de vórm (welke keys, allemaal strings). Wat een
 * geldige *waarde* is weet Storyteq zelf beter; die fouten komen als 422 terug
 * en worden per veld in het formulier getoond.
 */
const createSchema = z.object({
  templateId: z.string().min(1),
  parameters: z.record(z.string(), z.string()),
});

export const POST = handler(async (request: Request) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError("validation", { message: "Het formulier kon niet gelezen worden." });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("validation", {
      message: "Niet alle velden zijn goed ingevuld.",
      detail: parsed.error.message,
    });
  }

  const media = await createMedia(parsed.data.templateId, parsed.data.parameters);
  return ok({ asset: toAssetState(media) });
});
