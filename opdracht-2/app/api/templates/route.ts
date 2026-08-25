import { toTemplateSummary } from "@/lib/dto";
import { handler, ok } from "@/lib/api";
import { listTemplates } from "@/lib/storyteq";

/** Stap 1: alle templates waar deze token bij mag. */
export const GET = handler(async () => {
  const templates = await listTemplates();
  return ok({ templates: templates.map(toTemplateSummary) });
});
