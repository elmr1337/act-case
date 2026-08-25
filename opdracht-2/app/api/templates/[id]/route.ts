import { toTemplateDetail } from "@/lib/dto";
import { handler, ok } from "@/lib/api";
import { getTemplate } from "@/lib/storyteq";

/** Stap 2: de parameter-configuratie waar het formulier uit gebouwd wordt. */
export const GET = handler(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const template = await getTemplate(id);
    return ok({ template: toTemplateDetail(template) });
  },
);
