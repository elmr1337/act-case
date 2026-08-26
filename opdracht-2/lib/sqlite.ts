import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Persistentie is optioneel. Zonder `JOBS_DB` draait de app precies zoals hij
 * was: je joblijst leeft dan alleen in je eigen browser. Mét `JOBS_DB` bewaart
 * de server hem er ook, gekoppeld aan een anonieme sessie-cookie — dan overleeft
 * je overzicht het legen van je browseropslag.
 *
 * SQLite in plaats van een tweede service: `node:sqlite` zit sinds Node 22 in de
 * runtime, dus dit kost geen dependency, geen container en geen compose-bestand.
 * De keerzijde: het is in Node 22 nog experimenteel — vandaar de
 * ExperimentalWarning bij het opstarten. In Node 24 is het stabiel.
 *
 * Wat dit níét is: een database voor de app. Er staat één tabel in met
 * media-id's per sessie. De assets zelf blijven bij Storyteq.
 */
let db: DatabaseSync | null = null;
let attempted = false;

export function isPersistenceConfigured() {
  return Boolean(process.env.JOBS_DB?.trim());
}

export function getDb(): DatabaseSync | null {
  if (!isPersistenceConfigured()) return null;
  if (db) return db;
  // Eén poging: is het bestand niet te openen, dan werkt de app browser-only
  // verder in plaats van bij elke request opnieuw te struikelen.
  if (attempted) return null;
  attempted = true;

  const file = process.env.JOBS_DB!.trim();
  try {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

    const next = new DatabaseSync(file);
    // WAL houdt lezen en schrijven uit elkaars vaarwater; busy_timeout vangt
    // de korte overlap op als twee requests tegelijk schrijven.
    next.exec("PRAGMA journal_mode = WAL");
    next.exec("PRAGMA busy_timeout = 5000");
    next.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        session_id TEXT NOT NULL,
        id         TEXT NOT NULL,
        payload    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, id)
      )
    `);
    next.exec("CREATE INDEX IF NOT EXISTS jobs_expiry ON jobs (expires_at)");

    db = next;
    return db;
  } catch (err) {
    console.error("[jobs] SQLite openen mislukt, verder zonder:", err);
    return null;
  }
}
