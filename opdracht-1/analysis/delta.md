# Delta — menselijke analyse vs AI-analyse

**Proces:** [human.md](human.md) is geschreven vóór de AI-analyse draaide. Daarna
zijn de 23 referentiebeelden per stuk geanalyseerd (gemini-3.6-flash, strikte
content/style-scheiding, totaal $0,037) en geaggregeerd naar
[ai/aggregated-style-guide.md](ai/aggregated-style-guide.md). Waar mens en AI
elkaar tegenspraken is een **steekproef van 4 originelen** (35, 36, 49, 60)
opnieuw bekeken door Claude als scheidsrechter. Dit document is de vergelijking;
de merge naar [style-guide.md](style-guide.md) gebeurt samen.

## Waar mens en AI het eens zijn

| Onderwerp | Mens (Elmar) | AI | Fotocheck |
|---|---|---|---|
| Camerastandpunt | "net onder ooghoogte, niet té laag" | low-angle in 15/23 analyses; don't: "eye level, static" | ✓ klopt |
| Scherptediepte | "open diafragma, blur–focus–blur met onscherpe voorgrond" | "sharp midground face, heavy blurred foreground bokeh" | ✓ klopt, letterlijk hetzelfde beeld |
| Kadrering | "snapshot, subject uit het midden, horizon scheef" | "off-axis, diagonal, subject offsets, candid dynamic framing" | ✓ klopt (niet in élke foto, wel de teneur) |
| Focus | "gezicht en lach" | "sharp focus on facial features", mood joyful | ✓ klopt |
| Sfeer | "bliss, echt, mid-beweging, geen mannequins" | "vibrant, optimistic, candid, spontaneously authentic" | ✓ klopt |
| Styling | "kleurrijk, geen witte muren / zwart-wit kleding" | vivid pinks/greens/blues/oranges in wardrobe en props | ✓ klopt |

Opvallend: de mens en de AI beschrijven de voorgrond-blur exact gelijk — dit is
hét handschrift van de campagne en moet zwaar wegen in generatie.

## De drie conflicten

### 1. Lens — AI wint

- **Mens:** "ik gok 50–70mm."
- **AI:** 22/23 analyses zeggen groothoek (8× 24mm, 10× 28mm, 4× 35mm); don't:
  "geen tele (85mm+), geen gecomprimeerd plat perspectief."
- **Fotocheck:** de handen met telefoon in de voorgrond van 35/36 zijn véél te
  groot t.o.v. het gezicht — dat is groothoek van dichtbij, met een tele kan dit
  beeld niet bestaan.
- **Verdict:** groothoek 24–35mm, dicht op het onderwerp. Leerzaam: het
  menselijk oog voelde het *effect* goed aan ("mensen voelen groter", veel
  blur) maar wees het verkeerde *mechanisme* aan — de blur komt van dichtbij +
  open diafragma, niet van brandpuntscompressie.

### 2. Luchten & licht — gelijkspel, allebei te absoluut

- **Mens:** "geen strakblauw, bewolkt, soms grijs-blauwig."
- **AI:** warm 4800–5800K zonlicht; don't: "geen vlakke, bewolkte grijze
  luchten" — het omgekeerde.
- **Fotocheck:** 35 en 36 hebben onmiskenbaar bewolkte grijs-blauwe luchten
  (mens gelijk), maar 49 heeft strakblauwe lucht met harde zon (AI gelijk).
- **Verdict:** de set bevat **wisselend Hollands weer** — van bewolkt
  grijs-blauw tot fris zonnig blauw. Beide absolute regels sneuvelen. Voor de
  merge: "veranderlijk daglicht, zacht-diffuus bij bewolking, fris en direct
  bij zon; nooit gouden-uur-dramatiek of studiolicht."

### 3. Verzadiging — gelijkspel, twee lagen

- **Mens:** "mid, niet flets, niet knallend — echt."
- **AI:** ~19/23 zeggen "high saturation / vibrant"; de guide schrijft
  "vibrant high-saturation color grading" voor.
- **Fotocheck:** de kléding en props zijn verzadigd (roze, geel, groen, oranje,
  lila — zelfs de oudere man draagt oranje met lila), maar de grade zelf is
  natuurlijk: huidtinten neutraal, luchten niet gepusht, schaduwen open.
- **Verdict:** de kleur zit in de **styling**, niet in een filter. Mens
  beschreef de grade (klopt: mid/natuurlijk), AI beschreef de garderobe
  (klopt: verzadigd) — maar de AI-formulering "high-saturation grading" zou
  bij generatie tot oververzadigde beelden leiden en moet in de merge worden
  herschreven naar: "verzadigde kleuren in kleding/props óver een natuurlijke
  mid-verzadigde grade."

## Wat alleen de mens zag

De AI-analyse was bewust style-only, maar deze menselijke observaties zijn
regels die generatie moeten sturen en horen dus in de merged guide:

- **Het onderwerp is connectiviteit**: muziek, bellen, selfies, tablet — elk
  beeld bevat een verbonden moment.
- **1 of 2 mensen, nooit figuranten** — de achtergrond is altijd leeg van
  mensen. (Compositieregel die de AI volledig miste.)
- **Nederlandse context**: huizen, polder, baksteen, kleding.
- **Casting van jong tot oud, divers** — "voor iedereen".
- **Dagelijkse kleding, nooit zakelijk.**
- **Mid-beweging**: hand bij het oor, lach halverwege, interactie.

## Wat alleen de AI zag (of kon)

- **Meetbare specificaties**: hex-palet met rollen (`#4789C6` lucht/kleding,
  `#1D4A2B` groen, `#F2A2B3` roze accent, `#E39C16` amber, `#E09C7B` huid) en
  Kelvin-ranges — voor deck en LUT-referentie.
- **Voorgrond-framing als techniek benoemd**: handen/bladeren die de rand van
  het kader breken om diepte te maken.
- **Grading-details**: high-key belichting, open schaduwen, crisp highlights,
  subtiele film-achtige highlight roll-off.
- **Bruikbare don'ts**: geen tele-compressie, geen statisch eye-level, geen
  crushed shadows.

## Concept voor de merge (ter review, daarna samen naar style-guide.md)

Gecombineerde style prompt (~60 woorden, EN voor de generatiemodellen):

> Candid wide-angle photo (24–35mm look), camera just below eye level, close
> to the subject; sharp face, blurred hand or prop in the immediate
> foreground, shallow depth of field. Everyday Dutch setting under changeable
> skies (overcast grey-blue or fresh sunny blue). Colorful casual clothing and
> pastel props over a natural mid-saturation grade, warm skin, off-center
> tilted snapshot framing, joyful spontaneous mood.

Plus de content-regels uit de menselijke analyse (1–2 personen, geen
figuranten, connectiviteitsmoment, NL-context, diverse casting) als vaste
prompt-bouwstenen naast de stijl.
