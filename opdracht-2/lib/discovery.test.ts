import { describe, expect, it } from "vitest";

import { redactHeaders, shapeOf } from "./discovery";

describe("shapeOf", () => {
  it("houdt de structuur en gooit de waardes weg", () => {
    expect(shapeOf({ id: 1, name: "Zomeractie", ratio: 1.5, live: true })).toEqual({
      id: "integer",
      name: "string",
      ratio: "number",
      live: "boolean",
    });
  });

  it("herkent URL's en datums zonder ze te bewaren", () => {
    const shape = shapeOf({
      url: "https://cdn.storyteq.com/geheim/asset.mp4",
      created_at: "2026-08-25T09:00:00Z",
    });
    expect(shape).toEqual({ url: "string(uri)", created_at: "string(date-time)" });
    expect(JSON.stringify(shape)).not.toContain("geheim");
  });

  it("voegt heterogene lijsten samen en markeert optionele velden", () => {
    expect(
      shapeOf([
        { id: 1, name: "A", project_dir: "/p" },
        { id: 2, name: "B" },
      ]),
    ).toEqual([{ id: "integer", name: "string", "project_dir?": "string" }]);
  });

  it("gaat recursief door geneste lijsten heen", () => {
    expect(
      shapeOf([
        { parameters: [{ name: "x", type: "text" }] },
        { parameters: [{ name: "y", type: "image", label: "L" }] },
      ]),
    ).toEqual([
      { parameters: [{ name: "string", type: "string", "label?": "string" }] },
    ]);
  });

  it("meldt het als een veld van type wisselt", () => {
    const shape = shapeOf([{ id: 1 }, { id: "twee" }]) as Array<Record<string, string>>;
    expect(shape[0].id).toMatch(/^mixed\(/);
  });

  it("overleeft null en lege lijsten", () => {
    expect(shapeOf({ a: null, b: [] })).toEqual({ a: "null", b: [] });
  });
});

describe("redactHeaders", () => {
  it("laat de token nooit in het log belanden", () => {
    const authorization = "Bearer supergeheim-token-abc";
    const redacted = redactHeaders({ Authorization: authorization, Accept: "application/json" });

    expect(redacted.authorization).toBe(`<redacted:${authorization.length}chars>`);
    expect(JSON.stringify(redacted)).not.toContain("supergeheim");
    expect(redacted.accept).toBe("application/json");
  });

  it("redact ook api-key, cookie en de company-id", () => {
    const redacted = redactHeaders({
      "X-Api-Key": "abc",
      Cookie: "session=xyz",
      // Interne identifier; het log wordt gecommit. Verzonnen waarde, juist
      // omdat deze test in de repo staat.
      "X-Company-Id": "424242",
    });
    expect(redacted["x-api-key"]).toMatch(/^<redacted:/);
    expect(redacted.cookie).toMatch(/^<redacted:/);
    expect(redacted["x-company-id"]).toMatch(/^<redacted:/);
    expect(JSON.stringify(redacted)).not.toContain("424242");
  });
});
