import { z } from "zod";

import { handler, ok } from "@/lib/api";
import {
  addJobs,
  clearFinished,
  persistenceEnabled,
  readJobs,
  storedJobSchema,
  updateJob,
} from "@/lib/job-store.server";
import { getOrCreateSessionId, getSessionId } from "@/lib/session";

/**
 * Jouw joblijst, server-side bewaard — maar alleen als `REDIS_URL` gezet is.
 * Staat dat niet aan, dan antwoordt dit endpoint `enabled: false` en houdt de
 * browser het zelf bij. De client stopt dan met synchroniseren.
 */
export const GET = handler(async () => {
  if (!persistenceEnabled()) return ok({ enabled: false, jobs: [] });

  const sessionId = await getSessionId();
  return ok({ enabled: true, jobs: sessionId ? await readJobs(sessionId) : [] });
});

export const POST = handler(async (request: Request) => {
  if (!persistenceEnabled()) return ok({ enabled: false, jobs: [] });

  const parsed = z.array(storedJobSchema).max(200).safeParse(await request.json());
  if (!parsed.success) return ok({ enabled: true, jobs: [] });

  const sessionId = await getOrCreateSessionId();
  return ok({ enabled: true, jobs: await addJobs(sessionId, parsed.data) });
});

const patchSchema = z.object({
  id: z.string().min(1),
  phase: z.string().max(32).optional(),
  seen: z.boolean().optional(),
});

export const PATCH = handler(async (request: Request) => {
  if (!persistenceEnabled()) return ok({ enabled: false, jobs: [] });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return ok({ enabled: true, jobs: [] });

  const sessionId = await getSessionId();
  if (!sessionId) return ok({ enabled: true, jobs: [] });

  const { id, ...patch } = parsed.data;
  return ok({ enabled: true, jobs: await updateJob(sessionId, id, patch) });
});

export const DELETE = handler(async () => {
  if (!persistenceEnabled()) return ok({ enabled: false, jobs: [] });

  const sessionId = await getSessionId();
  return ok({ enabled: true, jobs: sessionId ? await clearFinished(sessionId) : [] });
});
