import { describe, expect, it } from "vitest";

import { fieldKind, humanizeName, toAssetState, toTemplateDetail } from "./dto";
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
        name: "Zomer actie",
        current_status: "finished",
        urls: { video: "https://cdn.storyteq.com/secret/x.mp4" },
      }),
    );
    expect(finished.result?.downloadUrl).toBe("/api/assets/9/download");
    expect(JSON.stringify(finished)).not.toContain("cdn.storyteq.com");
    expect(finished.result?.fileName).toBe("zomer-actie.mp4");
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
