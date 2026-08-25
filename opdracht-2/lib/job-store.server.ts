import "server-only";
import { z } from "zod";

import { getRedis, isRedisConfigured } from "./redis";
import { SESSION_TTL_SECONDS } from "./session";

/**
 * Server-side opslag van jouw joblijst. Alleen actief als `REDIS_URL` gezet is;
 * anders is de browser de enige plek waar de lijst leeft en doen al deze
 * functies niets.
 *
 * Er staat bewust geen render-inhoud in — alleen media-id's, de templatenaam en
 * een label. De assets zelf blijven bij Storyteq.
 */
export const storedJobSchema = z.object({
  id: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64),
  templateName: z.string().max(200),
  label: z.string().max(200),
  createdAt: z.number(),
  phase: z.string().max(32),
  seen: z.boolean(),
});

export type StoredJob = z.infer<typeof storedJobSchema>;

const MAX_JOBS = 60;
const key = (sessionId: string) => `storyteq:jobs:${sessionId}`;

export function persistenceEnabled() {
  return isRedisConfigured();
}

export async function readJobs(sessionId: string): Promise<StoredJob[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.get(key(sessionId));
    if (!raw) return [];
    const parsed = z.array(storedJobSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch (err) {
    console.error("[jobs] lezen mislukt", err);
    return [];
  }
}

async function writeJobs(sessionId: string, jobs: StoredJob[]) {
  const redis = await getRedis();
  if (!redis) return;

  try {
    await redis.set(key(sessionId), JSON.stringify(jobs.slice(0, MAX_JOBS)), {
      expiration: { type: "EX", value: SESSION_TTL_SECONDS },
    });
  } catch (err) {
    // De browser heeft de lijst ook; dit mag nooit een request laten falen.
    console.error("[jobs] schrijven mislukt", err);
  }
}

/** Voegt toe en houdt de nieuwste vooraan, zonder dubbelingen. */
export async function addJobs(sessionId: string, incoming: StoredJob[]) {
  const existing = await readJobs(sessionId);
  const ids = new Set(incoming.map((job) => job.id));
  const merged = [...incoming, ...existing.filter((job) => !ids.has(job.id))].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  await writeJobs(sessionId, merged);
  return merged;
}

export async function updateJob(
  sessionId: string,
  id: string,
  patch: Partial<Pick<StoredJob, "phase" | "seen">>,
) {
  const jobs = await readJobs(sessionId);
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) return jobs;

  const next = [...jobs];
  next[index] = { ...next[index], ...patch };
  await writeJobs(sessionId, next);
  return next;
}

export async function clearFinished(sessionId: string) {
  const jobs = await readJobs(sessionId);
  const remaining = jobs.filter(
    (job) => job.phase !== "finished" && job.phase !== "failed",
  );
  await writeJobs(sessionId, remaining);
  return remaining;
}
