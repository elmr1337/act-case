import "server-only";
import { z } from "zod";

import { getDb, isPersistenceConfigured } from "./sqlite";
import { SESSION_TTL_SECONDS } from "./session";

/**
 * Server-side opslag van jouw joblijst. Alleen actief als `JOBS_DB` gezet is;
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

export function persistenceEnabled() {
  return isPersistenceConfigured();
}

const now = () => Math.floor(Date.now() / 1000);

/** Ruimt verlopen sessies op. Goedkoop genoeg om bij elke lees-actie te doen. */
function sweep(db: NonNullable<ReturnType<typeof getDb>>) {
  db.prepare("DELETE FROM jobs WHERE expires_at < ?").run(now());
}

export function readJobs(sessionId: string): StoredJob[] {
  const db = getDb();
  if (!db) return [];

  try {
    sweep(db);
    const rows = db
      .prepare(
        "SELECT payload FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(sessionId, MAX_JOBS) as Array<{ payload: string }>;

    return rows
      .map((row) => storedJobSchema.safeParse(JSON.parse(row.payload)))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data);
  } catch (err) {
    console.error("[jobs] lezen mislukt", err);
    return [];
  }
}

export function addJobs(sessionId: string, incoming: StoredJob[]): StoredJob[] {
  const db = getDb();
  if (!db) return [];

  try {
    const expires = now() + SESSION_TTL_SECONDS;
    const insert = db.prepare(
      `INSERT INTO jobs (session_id, id, payload, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (session_id, id) DO UPDATE SET payload = excluded.payload`,
    );

    // Eén transactie: een batch van veertig regels hoort in zijn geheel te
    // landen of helemaal niet.
    db.exec("BEGIN");
    try {
      for (const job of incoming) {
        insert.run(sessionId, job.id, JSON.stringify(job), job.createdAt, expires);
      }
      // Alleen de nieuwste MAX_JOBS bewaren.
      db.prepare(
        `DELETE FROM jobs WHERE session_id = ? AND id NOT IN (
           SELECT id FROM jobs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?
         )`,
      ).run(sessionId, sessionId, MAX_JOBS);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    // De browser heeft de lijst ook; dit mag nooit een request laten falen.
    console.error("[jobs] schrijven mislukt", err);
  }

  return readJobs(sessionId);
}

export function updateJob(
  sessionId: string,
  id: string,
  patch: Partial<Pick<StoredJob, "phase" | "seen">>,
): StoredJob[] {
  const db = getDb();
  if (!db) return [];

  try {
    const row = db
      .prepare("SELECT payload FROM jobs WHERE session_id = ? AND id = ?")
      .get(sessionId, id) as { payload: string } | undefined;

    if (row) {
      const parsed = storedJobSchema.safeParse(JSON.parse(row.payload));
      if (parsed.success) {
        const next = { ...parsed.data, ...patch };
        db.prepare("UPDATE jobs SET payload = ? WHERE session_id = ? AND id = ?").run(
          JSON.stringify(next),
          sessionId,
          id,
        );
      }
    }
  } catch (err) {
    console.error("[jobs] bijwerken mislukt", err);
  }

  return readJobs(sessionId);
}

export function clearFinished(sessionId: string): StoredJob[] {
  const db = getDb();
  if (!db) return [];

  try {
    // De fase zit in de JSON; SQLite kan daar met json_extract bij.
    db.prepare(
      `DELETE FROM jobs
       WHERE session_id = ?
         AND json_extract(payload, '$.phase') IN ('finished', 'failed')`,
    ).run(sessionId);
  } catch (err) {
    console.error("[jobs] opruimen mislukt", err);
  }

  return readJobs(sessionId);
}
