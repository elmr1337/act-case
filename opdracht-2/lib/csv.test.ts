import { describe, expect, it } from "vitest";

import {
  buildTemplateCsv,
  detectDelimiter,
  mapColumns,
  parseCsv,
  rowsToParameters,
  toCsv,
} from "./csv";
import type { FormField } from "./dto";

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

const FIELDS: FormField[] = [
  field({ name: "p-kop", label: "Kop", required: true }),
  field({
    name: "p-kleur",
    label: "Achtergrond",
    kind: "select",
    group: "keuze",
    options: [
      { label: "Groen", value: "parameterValue-groen" },
      { label: "Blauw", value: "parameterValue-blauw" },
    ],
  }),
  field({ name: "p-logo", label: "Logo tonen", kind: "boolean", group: "keuze" }),
];

describe("parseCsv", () => {
  it("leest een gewone puntkomma-CSV zoals Excel die maakt", () => {
    expect(parseCsv("a;b\r\n1;2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("herkent ook komma's en tabs", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    // Een komma binnen quotes telt niet mee.
    expect(detectDelimiter('"a,b";c')).toBe(";");
  });

  it("respecteert aanhalingstekens, verdubbelde quotes en regeleindes in een cel", () => {
    expect(parseCsv('"met ; erin";"hij zei ""hoi"""\r\n"regel1\nregel2";b')).toEqual([
      ["met ; erin", 'hij zei "hoi"'],
      ["regel1\nregel2", "b"],
    ]);
  });

  it("negeert de BOM en lege slotregels", () => {
    expect(parseCsv("﻿a;b\r\n1;2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("toCsv", () => {
  it("quote't alleen wat gequote moet worden", () => {
    const csv = toCsv([["gewoon", "met ; erin", 'met " erin']]);
    expect(csv).toBe('﻿gewoon;"met ; erin";"met "" erin"');
  });

  it("levert een bestand dat we zelf weer kunnen lezen", () => {
    const rows = [
      ["Kop", "Achtergrond"],
      ['Tekst met ; en "quote"', "Groen"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("buildTemplateCsv", () => {
  it("zet de labels als kop en markeert verplichte velden", () => {
    const [header] = parseCsv(buildTemplateCsv(FIELDS));
    expect(header).toEqual(["Kop *", "Achtergrond", "Logo tonen"]);
  });

  it("vult een voorbeeldregel met een geldige keuze", () => {
    const [, example] = parseCsv(buildTemplateCsv(FIELDS));
    expect(example[1]).toBe("Groen");
  });
});

describe("mapColumns", () => {
  it("koppelt op label, ongeacht sterretje of hoofdletters", () => {
    const mapping = mapColumns(["kop *", "ACHTERGROND"], FIELDS);
    expect(mapping.columns.map((f) => f?.name)).toEqual(["p-kop", "p-kleur"]);
    expect(mapping.missingRequired).toEqual([]);
  });

  it("koppelt ook op de ruwe parameternaam", () => {
    expect(mapColumns(["p-kop"], FIELDS).columns[0]?.name).toBe("p-kop");
  });

  it("meldt ontbrekende verplichte kolommen en onbekende koppen", () => {
    const mapping = mapColumns(["Achtergrond", "Onzin"], FIELDS);
    expect(mapping.missingRequired.map((f) => f.label)).toEqual(["Kop"]);
    expect(mapping.unknownHeaders).toEqual(["Onzin"]);
  });
});

describe("rowsToParameters", () => {
  const run = (rows: string[][]) =>
    rowsToParameters(rows, mapColumns(rows[0], FIELDS), FIELDS);

  it("vertaalt een keuzelabel naar de waarde die Storyteq wil", () => {
    const [row] = run([
      ["Kop", "Achtergrond"],
      ["Zomer", "Groen"],
    ]);
    expect(row.parameters).toEqual({
      "p-kop": "Zomer",
      "p-kleur": "parameterValue-groen",
    });
    expect(row.errors).toEqual([]);
  });

  it("accepteert ook de rauwe waarde uit de API", () => {
    const [row] = run([
      ["Kop", "Achtergrond"],
      ["Zomer", "parameterValue-blauw"],
    ]);
    expect(row.parameters["p-kleur"]).toBe("parameterValue-blauw");
  });

  it("wijst een keuze af die niet bestaat, met de mogelijkheden erbij", () => {
    const [row] = run([
      ["Kop", "Achtergrond"],
      ["Zomer", "Paars"],
    ]);
    expect(row.errors[0]).toContain("geen geldige keuze");
    expect(row.errors[0]).toContain("Groen, Blauw");
  });

  it("meldt een leeg verplicht veld met het regelnummer erbij", () => {
    const [row] = run([
      ["Kop", "Achtergrond"],
      ["", "Groen"],
    ]);
    expect(row.line).toBe(2);
    expect(row.errors).toContain("Kop is verplicht");
  });

  it("leest ja/nee als boolean", () => {
    const rows = [
      ["Kop", "Logo tonen"],
      ["A", "ja"],
      ["B", "nee"],
    ];
    const parsed = rowsToParameters(rows, mapColumns(rows[0], FIELDS), FIELDS);
    expect(parsed[0].parameters["p-logo"]).toBe("true");
    expect(parsed[1].parameters["p-logo"]).toBe("false");
  });

  it("gebruikt de eerste tekstwaarde als herkenbaar label", () => {
    const [row] = run([
      ["Kop", "Achtergrond"],
      ["Zomeractie", "Groen"],
    ]);
    expect(row.label).toBe("Zomeractie");
  });
});
