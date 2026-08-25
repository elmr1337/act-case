import { describe, expect, it } from "vitest";

import {
  downloadSourceFor,
  isFieldValid,
  fieldKind,
  humanizeName,
  previewSourceFor,
  toAssetState,
  toTemplateDetail,
} from "./dto";
import type { FormField } from "./dto";
import { mediaSchema, templateSchema } from "./schemas";

describe("fieldKind", () => {
  it("herkent de types die we in de praktijk tegenkwamen", () => {
    expect(fieldKind("text")).toBe("text");
    expect(fieldKind("textarea")).toBe("longtext");
    expect(fieldKind("image")).toBe("image");
    expect(fieldKind("video")).toBe("video");
    expect(fieldKind("color")).toBe("color");
  });

  it("valt terug op de naam als het type niets zegt", () => {
    expect(fieldKind("param", "scene_1.background_image")).toBe("image");
    expect(fieldKind("param", "cta_link")).toBe("url");
  });

  it("maakt van een onbekend type geen crash", () => {
    expect(fieldKind("holografische_kubus")).toBe("unknown");
    expect(fieldKind(null)).toBe("text");
  });
});

describe("humanizeName", () => {
  it("maakt van een parameterpad een leesbaar label", () => {
    expect(humanizeName("scene_1.headline_text")).toBe("Headline text");
    expect(humanizeName("ctaLabel")).toBe("CTA label");
    expect(humanizeName("scene_2.cta_link")).toBe("CTA link");
  });
});

describe("toTemplateDetail", () => {
  it("gebruikt het label van de API en anders de naam", () => {
    const template = templateSchema.parse({
      id: 1,
      name: "Zomer",
      parameters: [
        { name: "scene_1.title", label: "Kop", type: "text" },
        { name: "scene_1.bg_image", type: "image" },
      ],
    });

    const detail = toTemplateDetail(template);
    expect(detail.fields[0].label).toBe("Kop");
    expect(detail.fields[1].label).toBe("Bg image");
    expect(detail.fields[1].kind).toBe("image");
  });
});

describe("toAssetState", () => {
  it("geeft pas een resultaat als de render klaar is", () => {
    const rendering = toAssetState(
      mediaSchema.parse({
        id: 9,
        current_status: "rendering",
        urls: { video: "https://cdn/x.mp4" },
      }),
    );
    expect(rendering.done).toBe(false);
    expect(rendering.result).toBeNull();
  });

  it("wijst naar onze eigen proxy, nooit naar de Storyteq-URL", () => {
    const finished = toAssetState(
      mediaSchema.parse({
        id: 9,
        name: "26943410",
        template: { name: "Opdracht 2" },
        current_status: "finished",
        urls: { video: "https://assets.api.europe-west1.storyteq.com/v1/assets/geheim" },
        download_urls: {
          video: "https://api.europe-west1.storyteq.com/v4/open/media/hash/download/video",
        },
      }),
    );

    expect(finished.result?.downloadUrl).toBe("/api/assets/9/download");
    expect(finished.result?.previewUrl).toBe("/api/assets/9/download?variant=preview");
    expect(JSON.stringify(finished)).not.toContain("storyteq.com");
    // `media.name` is in de praktijk het id opnieuw; de templatenaam is bruikbaarder.
    expect(finished.result?.fileName).toBe("opdracht-2-9.mp4");
  });

  it("kiest video boven afbeelding als beide er zijn", () => {
    const finished = toAssetState(
      mediaSchema.parse({
        id: 3,
        current_status: "finished",
        download_urls: { image: "https://cdn/x.png", video: "https://cdn/x.mp4" },
      }),
    );
    expect(finished.result?.kind).toBe("video");
  });

  it("markeert een mislukte render", () => {
    const failed = toAssetState(
      mediaSchema.parse({ id: 4, current_status: "failed" }),
    );
    expect(failed.failed).toBe(true);
    expect(failed.result).toBeNull();
  });
});

describe("previewSourceFor / downloadSourceFor", () => {
  // De spec presenteert `urls` en `download_urls` als alternatieven, maar in
  // werkelijkheid bestaan ze allebei en betekenen ze iets anders.
  const media = mediaSchema.parse({
    id: 1,
    current_status: "finished",
    urls: {
      image: "https://assets.api/v1/assets/x/transforms/custom-thumbnail",
      video: "https://assets.api/v1/assets/x?filename=render.mp4",
    },
    download_urls: {
      video: "https://api/v4/open/media/hash/download/video",
      image: "https://api/v4/open/media/hash/download/image",
    },
  });

  it("toont vanaf de CDN en downloadt via het open-endpoint", () => {
    expect(previewSourceFor(media)?.url).toContain("assets.api");
    expect(downloadSourceFor(media)?.url).toContain("/open/media/");
  });

  it("valt terug op de andere set als er maar één is", () => {
    const onlyCdn = mediaSchema.parse({
      id: 2,
      current_status: "finished",
      urls: { video: "https://assets.api/v1/assets/y" },
    });
    expect(downloadSourceFor(onlyCdn)?.url).toContain("assets.api");
  });
});

describe("toTemplateDetail — velden die niet in de spec staan", () => {
  const template = templateSchema.parse({
    id: 43973,
    name: "Opdracht 2",
    processing_time: 94,
    thumbnail_url: "https://assets.api/v1/assets/x/transforms/custom-thumbnail",
    parameters: [
      { name: "b", label: "Tweede", type: "text", required: 0, order: 2 },
      {
        name: "a",
        label: "Eerste",
        type: "enum",
        required: 1,
        order: 1,
        meta: {
          values: [
            { label: "Blauw", value: "parameterValue-1" },
            { label: "Groen", value: "parameterValue-2" },
          ],
        },
      },
    ],
  });

  it("sorteert op order in plaats van op volgorde van de API", () => {
    const detail = toTemplateDetail(template);
    expect(detail.fields.map((f) => f.label)).toEqual(["Eerste", "Tweede"]);
  });

  it("maakt van een enum een keuzelijst met labels", () => {
    const field = toTemplateDetail(template).fields[0];
    expect(field.kind).toBe("select");
    expect(field.options).toEqual([
      { label: "Blauw", value: "parameterValue-1" },
      { label: "Groen", value: "parameterValue-2" },
    ]);
  });

  it("leest required als 0/1 en neemt de thumbnail en rendertijd over", () => {
    const detail = toTemplateDetail(template);
    expect(detail.fields[0].required).toBe(true);
    expect(detail.fields[1].required).toBe(false);
    expect(detail.estimatedSeconds).toBe(94);
    // De browser krijgt onze proxy-URL, niet die van de Storyteq-CDN.
    expect(detail.thumbnailUrl).toBe("/api/templates/43973/thumbnail");
    expect(JSON.stringify(detail)).not.toContain("assets.api");
  });

  it("maakt van een enum zonder keuzes gewoon een tekstveld", () => {
    const zonder = templateSchema.parse({
      id: 1,
      parameters: [{ name: "x", type: "enum", meta: { values: [] } }],
    });
    expect(toTemplateDetail(zonder).fields[0].kind).toBe("text");
  });
});

describe("isFieldValid", () => {
  const field = (over: Partial<FormField>): FormField => ({
    name: "x",
    label: "X",
    kind: "text",
    group: "tekst",
    rawType: null,
    required: false,
    initialValue: "",
    ...over,
  });

  it("noemt een leeg veld nooit goed ingevuld", () => {
    expect(isFieldValid(field({}), "   ")).toBe(false);
  });

  it("controleert kleur, link en getal op vorm", () => {
    expect(isFieldValid(field({ kind: "color" }), "#1a2b3c")).toBe(true);
    expect(isFieldValid(field({ kind: "color" }), "blauw")).toBe(false);
    expect(isFieldValid(field({ kind: "image" }), "https://x.nl/a.png")).toBe(true);
    expect(isFieldValid(field({ kind: "image" }), "plaatje.png")).toBe(false);
    expect(isFieldValid(field({ kind: "number" }), "12")).toBe(true);
    expect(isFieldValid(field({ kind: "number" }), "twaalf")).toBe(false);
  });

  it("accepteert bij een keuze alleen een bestaande optie", () => {
    const keuze = field({
      kind: "select",
      options: [{ label: "Groen", value: "parameterValue-1" }],
    });
    expect(isFieldValid(keuze, "parameterValue-1")).toBe(true);
    expect(isFieldValid(keuze, "Groen")).toBe(false);
  });

  it("laat gewone tekst met rust", () => {
    expect(isFieldValid(field({}), "Zomer bij ACT")).toBe(true);
  });
});
