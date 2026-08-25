import { toTemplateSummary } from "@/lib/dto";
import { handler, ok } from "@/lib/api";
import { listTemplates } from "@/lib/storyteq";
import { rememberThumbnails } from "@/lib/template-cache";

/** Stap 1: alle templates waar deze token bij mag. */
export const GET = handler(async () => {
  const templates = await listTemplates();

  // De thumbnail-URL's komen hier al binnen; de thumbnail-proxy hergebruikt ze.
  rememberThumbnails(templates);

  return ok({ templates: templates.map(toTemplateSummary) });
});
