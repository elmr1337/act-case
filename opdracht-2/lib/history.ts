import type { Media } from "./schemas";
import { normalizeStatus } from "./schemas";

/**
 * Wat een template in de praktijk doet, afgeleid uit zijn eigen eerdere media.
 *
 * De API geeft twee dingen niet:
 *   1. hoe lang een render duurt (`processing_time` is de rendertijd zonder
 *      wachtrij — gemeten was 94 tegen 220 seconden werkelijk);
 *   2. hoe een keuze uit een `enum` eruitziet — er zit geen voorbeeldbeeld bij
 *      de opties, alleen een label.
 *
 * Allebei zijn ze wél af te leiden uit `GET /content/templates/{id}/media`: die
 * bevat afgeronde renders mét gekozen parameterwaardes, thumbnails en
 * (ongedocumenteerd) een `events`-lijst met een tijdstempel per fase.
 */

export type DurationEstimate = {
  /** Wat je in de helft van de gevallen haalt. */
  medianSeconds: number;
  /** De staart: 9 van de 10 renders zijn hierbinnen klaar. */
  p90Seconds: number;
  sampleSize: number;
};

export type TemplateHistory = {
  estimate: DurationEstimate | null;
  /**
   * Per parameternaam, per gekozen waarde: het id van een eerdere media die die
   * waarde gebruikte. De UI maakt daar een thumbnail-URL van.
   */
  optionExamples: Record<string, Record<string, string>>;
};

/** Duur van één render, bij voorkeur uit `events` en anders uit de tijdstempels. */
function durationOf(media: Media): number | null {
  const events = media.events ?? [];
  const stamps = events
    .map((e) => Date.parse(String(e.created_at ?? "").replace(" ", "T") + "Z"))
    .filter(Number.isFinite);

  if (stamps.length >= 2) {
    return (Math.max(...stamps) - Math.min(...stamps)) / 1000;
  }

  const start = Date.parse(media.created_at ?? "");
  const end = Date.parse(media.updated_at ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 1000;
}

function quantile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[index]);
}

export function buildHistory(mediaList: Media[]): TemplateHistory {
  const durations: number[] = [];
  const optionExamples: Record<string, Record<string, string>> = {};

  for (const media of mediaList) {
    if (normalizeStatus(media.current_status) !== "finished") continue;

    const duration = durationOf(media);
    // Renders van meer dan een uur zijn vrijwel zeker blijven hangen; die
    // zouden de verwachting onnodig somber maken.
    if (duration !== null && duration > 0 && duration < 3600) durations.push(duration);

    // Alleen media met een eigen beeld kunnen als voorbeeld dienen.
    if (!media.urls?.image) continue;

    for (const parameter of media.parameters ?? []) {
      const value = typeof parameter.value === "string" ? parameter.value : "";
      if (!value) continue;

      const perValue = (optionExamples[parameter.name] ??= {});
      // De lijst komt nieuwste-eerst binnen; het eerste voorbeeld is het meest recente.
      perValue[value] ??= media.id;
    }
  }

  durations.sort((a, b) => a - b);

  return {
    // Onder de vijf renders is een mediaan meer suggestie dan cijfer.
    estimate:
      durations.length >= 5
        ? {
            medianSeconds: quantile(durations, 0.5),
            p90Seconds: quantile(durations, 0.9),
            sampleSize: durations.length,
          }
        : null,
    optionExamples,
  };
}
