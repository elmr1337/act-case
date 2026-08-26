"use client";

import type { AssetPhase } from "./dto";

/**
 * De renders die jij hebt gestart.
 *
 * De wachtrij zelf is die van Storyteq; wij houden alleen bij wélke media-id's
 * van jou zijn, zodat je ze kunt volgen zonder op één pagina te blijven staan.
 *
 * Local-first: standaard leeft deze lijst in localStorage — geen database, geen
 * account. Staat `JOBS_DB` op de server, dan spiegelt hij bovendien naar
 * `/api/jobs` onder een anonieme sessie-cookie, zodat je overzicht het legen van
 * je browseropslag overleeft. Werkt dat niet, dan merkt de gebruiker er niets
 * van: de browser blijft de bron.
 *
 * Bewust een kleine store met `useSyncExternalStore` in plaats van een state
 * manager: het is één lijst met een handvol operaties.
 */

const STORAGE_KEY = "storyteq.jobs.v1";
const MAX_JOBS = 60;

export type Job = {
  id: string;
  templateId: string;
  templateName: string;
  /** Waar de gebruiker hem aan herkent: de eerste ingevulde tekst. */
  label: string;
  createdAt: number;
  phase: AssetPhase;
  /** Of de gebruiker de melding "klaar" al gezien heeft. */
  seen: boolean;
};

let jobs: Job[] = [];
let loaded = false;
const listeners = new Set<() => void>();

const EMPTY: Job[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // Privémodus of vol quotum: de app werkt door, alleen zonder geheugen.
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  // Fire-and-forget: de app werkt al met wat er lokaal staat.
  void hydrate();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      jobs = parsed.filter(
        (job): job is Job =>
          typeof job?.id === "string" && typeof job?.templateId === "string",
      );
    }
  } catch {
    jobs = [];
  }
}

/** Onbekend tot de eerste call; daarna weten we of de server meedoet. */
let persistence: "unknown" | "enabled" | "disabled" = "unknown";

async function callServer(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<Job[] | null> {
  if (persistence === "disabled") return null;
  try {
    const response = await fetch("/api/jobs", {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { enabled?: boolean; jobs?: Job[] };
    persistence = data.enabled ? "enabled" : "disabled";
    return data.enabled ? (data.jobs ?? []) : null;
  } catch {
    // Server onbereikbaar: local-first betekent dat dit geen probleem is.
    return null;
  }
}

/**
 * Haalt de server-lijst op en vult aan wat deze browser nog niet kent. De
 * lokale staat wint bij een conflict: de poller hier is live, de server niet.
 */
async function hydrate() {
  const remote = await callServer("GET");
  if (!remote?.length) return;

  const known = new Set(jobs.map((job) => job.id));
  const extra = remote.filter((job) => !known.has(job.id));
  if (extra.length === 0) return;

  jobs = [...jobs, ...extra].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS);
  persist();
  emit();
}

export function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Job[] {
  load();
  return jobs;
}

/** De server rendert nooit een joblijst — die bestaat alleen in de browser. */
export function getServerSnapshot(): Job[] {
  return EMPTY;
}

export function addJobs(newJobs: Array<Omit<Job, "phase" | "seen" | "createdAt">>) {
  load();
  const now = Date.now();
  const stamped: Job[] = newJobs.map((job, index) => ({
    ...job,
    // Volgorde binnen één batch bewaren zonder per stuk de klok te lezen.
    createdAt: now + index,
    phase: "queued",
    seen: false,
  }));
  jobs = [...stamped.reverse(), ...jobs].slice(0, MAX_JOBS);
  persist();
  emit();
  void callServer("POST", stamped);
}

export function updateJob(id: string, patch: Partial<Pick<Job, "phase" | "seen">>) {
  load();
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) return;

  const next = { ...jobs[index], ...patch };
  if (next.phase === jobs[index].phase && next.seen === jobs[index].seen) return;

  jobs = [...jobs.slice(0, index), next, ...jobs.slice(index + 1)];
  persist();
  emit();
  // Alleen echte overgangen komen hier langs — hierboven wordt gelijk-blijven
  // al afgevangen, dus dit spamt de server niet bij elke poll.
  void callServer("PATCH", { id, ...patch });
}

export function markAllSeen() {
  load();
  if (!jobs.some((job) => !job.seen)) return;
  jobs = jobs.map((job) => (job.seen ? job : { ...job, seen: true }));
  persist();
  emit();
}

export function clearFinishedJobs() {
  load();
  const remaining = jobs.filter((job) => !isDone(job));
  if (remaining.length === jobs.length) return;
  jobs = remaining;
  persist();
  emit();
  void callServer("DELETE");
}

export const isDone = (job: Job) => job.phase === "finished" || job.phase === "failed";
export const isRunning = (job: Job) => !isDone(job);
