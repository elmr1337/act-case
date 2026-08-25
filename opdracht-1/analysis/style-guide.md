# Style guide — gemergde versie

De merge van [human.md](human.md) (menselijk oog) en
[ai/aggregated-style-guide.md](ai/aggregated-style-guide.md) (AI, 23 beelden),
met de conflicten beslecht in [delta.md](delta.md) via een fotocheck op de
originelen. Goedgekeurd door Elmar; dit document + `style-prompt.txt` voeden
alle generatie.

## Licht

Wisselend Hollands daglicht: van bewolkt grijs-blauw (zacht, diffuus, weinig
schaduw) tot fris zonnig blauw (direct, crisp highlights). Warm-neutraal
(~4800–5800K). Nooit gouden-uur-dramatiek, nooit studiolicht, geen crushed
shadows — schaduwen blijven open.

## Kleur & grading

Twee lagen, niet verwarren:

1. **Styling is verzadigd**: kleding, props en interieur in roze, geel, groen,
   oranje, lila — ook bij oudere modellen. Geen witte muren, geen zwart/wit.
2. **De grade is natuurlijk / mid**: neutrale huidtinten, luchten niet gepusht,
   geen filter-look. Niet flets, niet knallend.

Referentie-palet (AI): `#4789C6` lucht/kleding-blauw · `#1D4A2B` groen ·
`#F2A2B3` roze accent · `#E39C16` amber · `#E09C7B` huid.

## Compositie & kadrering

- Camera **net onder ooghoogte** (licht kikvors, nooit extreem), soms juist
  hoog/vogelvlucht voor lig-shots.
- **Snapshot-kadrering**: subject uit het midden, diagonale assen, horizon mag
  scheef. Nooit statisch-symmetrisch op ooghoogte.
- **1 of 2 mensen, nooit figuranten** — achtergrond zonder mensen.
- Voorgrond-elementen (hand, telefoon, blad) breken de rand van het kader.
- Focus op gezicht en lach.

## Lens & scherptediepte

Groothoek **24–35mm, dicht op het onderwerp** (nooit tele/compressie). Open
diafragma: scherp gezicht in het midden-plan, zwaar geblurde voorgrond
(blur–focus–blur), zachte achtergrond-falloff.

## Onderwerp & casting

- Elk beeld bevat een **connectiviteitsmoment**: muziek (earbuds), bellen,
  videobellen, selfie, tablet/scrollen — vaak mid-beweging.
- Casting **van jong tot oud, divers** — het is voor iedereen.
- **Dagelijkse kleding**, nooit zakelijk.
- **Nederlandse context**: baksteen, rijtjeshuizen, polder, achtertuin, tram.
- Sfeer: bliss, echt, spontaan — gewone mensen, geen mannequins.

## Do's

- Groothoek dichtbij, net onder ooghoogte, geblurde voorgrond-hand of -prop
- Wisselende Hollandse luchten; zacht diffuus óf fris zonnig
- Verzadigde casual styling over een natuurlijke mid-grade, warme huid
- 1–2 blije mensen in een verbonden moment, mid-beweging
- Scheve, candid snapshot-kadrering; gezicht en lach scherp
- NL-omgeving als decor, lege achtergrond

## Don'ts

- Geen tele/85mm+-compressie of plat perspectief
- Geen statisch eye-level of perfecte symmetrie
- Geen figuranten of mensen op de achtergrond
- Geen zakelijke kleding, geen zwart/wit styling, geen witte muren
- Geen oververzadigde filter-look én geen flets/moody grading
- Geen gouden uur, geen studio, geen crushed shadows
- Geen mannequin-poses; niets statisch

## De style prompt

Staat in [`style-prompt.txt`](style-prompt.txt) (leest de worker automatisch;
de content-regels hierboven gaan per prompt mee via matrix.yaml):

> Candid wide-angle photo (24-35mm look), camera just below eye level, close
> to the subject; sharp face, blurred hand or prop in the immediate
> foreground, shallow depth of field. Everyday Dutch setting under changeable
> skies (overcast grey-blue or fresh sunny blue). Colorful casual clothing and
> pastel props over a natural mid-saturation grade, warm skin, off-center
> tilted snapshot framing, joyful spontaneous mood. Natural unretouched skin
> texture, candid documentary realism, subtle imperfections; never a plastic,
> airbrushed or CGI-smooth look.
