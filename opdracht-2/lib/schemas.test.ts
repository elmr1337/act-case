import { describe, expect, it } from "vitest";

import {
  listTemplatesSchema,
  normalizeStatus,
  singleMediaSchema,
  validationErrorSchema,
} from "./schemas";

/**
 * Hier zit het echte risico van dit project: de Storyteq API is deels
 * ongedocumenteerd, dus onze aannames over de response-vorm kunnen fout zijn.
 * Deze tests leggen vast dat we tolerant blijven waar het mag, en streng waar
 * het moet.
 */

describe("listTemplatesSchema", () => {
  it("accepteert de vorm uit de OpenAPI-spec", () => {
    const parsed = listTemplatesSchema.parse({
      data: [
        {
          id: 42,
          name: "Zomeractie",
          created_at: "2026-01-02T10:00:00Z",
          parameters: [{ name: "scene_1.title", label: "Titel", type: "text" }],
        },
      ],
    });

    // Ids komen als integer binnen maar leven in de URL: altijd string bij ons.
    expect(parsed.data[0].id).toBe("42");
    expect(parsed.data[0].parameters?.[0].name).toBe("scene_1.title");
  });

  it("breekt niet op onbekende velden — de API mag groeien", () => {
    const parsed = listTemplatesSchema.parse({
      data: [{ id: 1, name: "X", brand_new_field: { nested: true } }],
      meta: { total: 1 },
    });
    expect(parsed.data).toHaveLength(1);
  });

  it("accepteert een template zonder parameters", () => {
    const parsed = listTemplatesSchema.parse({ data: [{ id: 7 }] });
    expect(parsed.data[0].parameters).toBeUndefined();
  });

  it("weigert een response zonder data-envelope", () => {
    expect(() => listTemplatesSchema.parse([{ id: 1 }])).toThrow();
  });
});

describe("singleMediaSchema", () => {
  it("leest zowel urls als download_urls", () => {
    const withUrls = singleMediaSchema.parse({
      data: { id: 5, current_status: "finished", urls: { video: "https://x/y.mp4" } },
    });
    expect(withUrls.data.urls?.video).toBe("https://x/y.mp4");

    const withDownloadUrls = singleMediaSchema.parse({
      data: {
        id: 5,
        current_status: "finished",
        download_urls: { image: "https://x/y.png", gif: "https://x/y.gif" },
      },
    });
    expect(withDownloadUrls.data.download_urls?.image).toBe("https://x/y.png");
  });

  it("overleeft een null-urls-veld", () => {
    const parsed = singleMediaSchema.parse({
      data: { id: 5, current_status: "queued", urls: null },
    });
    expect(parsed.data.urls).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("kent de statussen uit de webhook-schemas", () => {
    for (const status of ["queued", "rendering", "uploading", "finished", "failed"]) {
      expect(normalizeStatus(status)).toBe(status);
    }
  });

  it("valt terug op unknown in plaats van te crashen", () => {
    expect(normalizeStatus("iets_nieuws")).toBe("unknown");
    expect(normalizeStatus(null)).toBe("unknown");
    expect(normalizeStatus(undefined)).toBe("unknown");
  });

  it("is ongevoelig voor hoofdletters en spaties", () => {
    expect(normalizeStatus(" Finished ")).toBe("finished");
  });
});

describe("validationErrorSchema", () => {
  it("leest de per-parameter fouten van een 422", () => {
    const parsed = validationErrorSchema.parse({
      message: "The given data was invalid.",
      errors: { "scene_1.title": ["The title field is required."] },
    });
    expect(parsed.errors?.["scene_1.title"]).toEqual([
      "The title field is required.",
    ]);
  });
});
