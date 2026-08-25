import { handler, ok } from "@/lib/api";
import { toAssetState } from "@/lib/dto";
import { getMedia } from "@/lib/storyteq";

/** Stap 3: de status waar de UI op pollt. */
export const GET = handler(
  async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const media = await getMedia(id);
    return ok({ asset: toAssetState(media) });
  },
);
