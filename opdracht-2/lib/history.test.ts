import { describe, expect, it } from "vitest";

import { buildHistory } from "./history";
import { mediaSchema } from "./schemas";

const media = (over: Record<string, unknown>) =>
  mediaSchema.parse({ id: 1, current_status: "finished", ...over });

/** Zoals Storyteq ze teruggeeft: "2026-08-25 11:48:56", zonder tijdzone. */
const events = (start: string, end: string) => [
  { type: "queued", created_at: start },
  { type: "finished", created_at: end },
];

describe("buildHistory — tijdsverwachting", () => {
  it("rekent de duur uit de ongedocumenteerde events", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      media({ id: i, events: events("2026-08-25 12:00:00", "2026-08-25 12:02:00") }),
    );
    expect(buildHistory(list).estimate).toEqual({
      medianSeconds: 120,
      p90Seconds: 120,
      sampleSize: 5,
    });
  });

  it("valt terug op created_at/updated_at als events ontbreken", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      media({
        id: i,
        created_at: "2026-08-25T12:00:00Z",
        updated_at: "2026-08-25T12:01:00Z",
      }),
    );
    expect(buildHistory(list).estimate?.medianSeconds).toBe(60);
  });

  it("geeft geen verwachting bij te weinig gegevens", () => {
    const list = [media({ events: events("2026-08-25 12:00:00", "2026-08-25 12:02:00") })];
    expect(buildHistory(list).estimate).toBeNull();
  });

  it("negeert renders die zijn blijven hangen", () => {
    const normal = Array.from({ length: 5 }, (_, i) =>
      media({ id: i, events: events("2026-08-25 12:00:00", "2026-08-25 12:02:00") }),
    );
    const stuck = media({
      id: 99,
      events: events("2026-08-25 12:00:00", "2026-08-25 20:00:00"),
    });
    expect(buildHistory([...normal, stuck]).estimate?.sampleSize).toBe(5);
  });

  it("telt alleen afgeronde renders mee", () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      media({
        id: i,
        current_status: "rendering",
        events: events("2026-08-25 12:00:00", "2026-08-25 12:02:00"),
      }),
    );
    expect(buildHistory(list).estimate).toBeNull();
  });
});

describe("buildHistory — voorbeelden bij keuzes", () => {
  it("koppelt een gekozen waarde aan een eerdere render met beeld", () => {
    const history = buildHistory([
      media({
        id: 7,
        urls: { image: "https://assets.api/v1/assets/x" },
        parameters: [{ name: "kleur", type: "enum", value: "parameterValue-groen" }],
      }),
    ]);
    expect(history.optionExamples.kleur["parameterValue-groen"]).toBe("7");
  });

  it("houdt de nieuwste render aan — die staat vooraan in de lijst", () => {
    const history = buildHistory([
      media({
        id: 9,
        urls: { image: "https://assets.api/nieuw" },
        parameters: [{ name: "kleur", type: "enum", value: "groen" }],
      }),
      media({
        id: 2,
        urls: { image: "https://assets.api/oud" },
        parameters: [{ name: "kleur", type: "enum", value: "groen" }],
      }),
    ]);
    expect(history.optionExamples.kleur.groen).toBe("9");
  });

  it("slaat renders zonder beeld over", () => {
    const history = buildHistory([
      media({ id: 3, parameters: [{ name: "kleur", type: "enum", value: "groen" }] }),
    ]);
    expect(history.optionExamples).toEqual({});
  });

  it("negeert lege waardes", () => {
    const history = buildHistory([
      media({
        id: 4,
        urls: { image: "https://assets.api/x" },
        parameters: [{ name: "upload", type: "image", value: "" }],
      }),
    ]);
    expect(history.optionExamples).toEqual({});
  });
});
