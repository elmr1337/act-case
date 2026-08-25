# Opdracht 2 — Storyteq Template Builder

Een Next.js-app waarmee iemand zonder technische achtergrond in vier stappen een
asset maakt: **kies een template → vul in → wacht → download**. Geen dashboard,
geen instellingen, geen jargon.

---

## Aanpak in vijf regels

1. **Discovery eerst.** Eerst uitzoeken wat de Storyteq API écht doet, pas daarna
   bouwen. Dat leverde een OpenAPI-spec op die niet in de documentatie stond —
   zie [`docs/api-discovery.md`](docs/api-discovery.md).
2. **Alles via een proxy.** De browser praat uitsluitend met onze eigen route
   handlers. De API-key blijft server-side, en elke call komt langs één plek waar
   hij gelogd kan worden.
3. **Eén lineaire flow.** Vier stappen met de id in de URL, zodat verversen en
   delen werken.
4. **Tolerant parsen, streng presenteren.** Zod accepteert onbekende velden;
   de UI krijgt alleen onze eigen datavorm en nooit rauwe API-output.
5. **Draaien zonder toolchain.** Multi-stage Docker-image, `.env.local` als
   runtime-env.

---

## Snel starten

### Met Node

```bash
cp .env.example .env.local   # vul STORYTEQ_API_KEY in
npm install
npm run dev                  # http://localhost:3000
```

### Met alleen Docker

```bash
cp .env.example .env.local   # vul STORYTEQ_API_KEY in
make docker-build
make docker-run              # http://localhost:3000
```

De image draait als non-root en heeft geen Node-toolchain op de host nodig.
`GET /api/health` vertelt of de app draait én of de Storyteq-config compleet is:

```bash
curl -s localhost:3000/api/health
# {"status":"ok","storyteq":"configured","region":"europe-west1","uptime":12}
```

---

## Toolkeuzes, en waarom

| Keuze | Waarom |
|---|---|
| **Next.js (App Router, TypeScript)** | Gevraagd in de opdracht. De route handlers zijn hier meteen de proxy-laag, dus er is geen aparte backend nodig. |
| **Route handlers als proxy** | Drie vliegen: de key blijft server-side, alle traffic komt langs één punt (discovery-logging), en de download kan een eigen `Content-Disposition` krijgen zodat hij écht met één klik binnenkomt. |
| **TanStack Query, geen state manager** | Alles in deze app *is* server state: templates, de aanmaak-actie, de renderstatus. Het pollen is één regel — `refetchInterval` als functie van de status, die vanzelf stopt bij `finished`/`failed`. Er is geen client state die Zustand of Redux zou rechtvaardigen: één wizard-stap (die in de URL staat) en de formuliervelden. |
| **shadcn/ui primitives, geen blocks** | Alleen button, input, textarea, card, progress, skeleton, label en sonner — de bouwstenen, met een eigen theme erop. Bewust géén sidebar- of dashboard-blocks: de opdracht vraagt letterlijk om geen technisch dashboard. |
| **Tailwind v4** | Theme als CSS-variabelen, geen config-bestand nodig. |
| **Zod op de route handlers** | Een API die we niet volledig kennen levert onbetrouwbare responses. Loose schemas: onbekende velden mogen erbij, ontbrekende velden breken de app niet. |
| **Docker multi-stage op `output: 'standalone'`** | De beoordelaar draait de app zonder Node te installeren. |

### Design

Eigen theme op de primitives: warm papier in plaats van steriel wit, diep
inktblauw als tekstkleur, en één accentkleur (indigo) die alleen gebruikt wordt
voor de handeling die je moet doen. Amber betekent "er wordt gewerkt", groen
"klaar". Typografie is Bricolage Grotesque voor de koppen en Instrument Sans voor
alles wat je leest en invult — expliciet geen Inter-op-alles.

De flow is lineair, dus mobiel werkt vrijwel gratis: één kolom, grote raakvlakken,
en de stappenbalk toont op smalle schermen alleen het label van de huidige stap.

---

## Hoe de API verkend is

Het volledige verhaal staat in [`docs/api-discovery.md`](docs/api-discovery.md).
De korte versie:

De documentatiesite gaf bij een gewone fetch niets terug — één `<title>` en verder
niets. Dat bleek geen kapotte pagina maar een **Swagger UI**: in de rauwe HTML
staan drie OpenAPI-specs die los op te halen zijn. Eén daarvan, *Storyteq API v4
(Creative Automation)*, beschrijft precies wat deze opdracht nodig heeft: base
URL per region, bearer-auth, de vier endpoints en de webhook-statussen.

Dat scheelde een middag endpoints raden. Wat de spec **niet** zegt, en waar de
echte verkenning zit:

- welke waardes `TemplateParameter.type` kan hebben (bepaalt hoe het formulier
  eruitziet — de spec zegt alleen `string`, zonder enum);
- of de statusresponse `urls` of `download_urls` gebruikt — **de spec spreekt
  zichzelf hier tegen**, dus we lezen allebei;
- of de asset-URL's presigned zijn of de bearer-token nodig hebben (de
  download-proxy probeert eerst zonder, dan met);
- of templates thumbnails hebben (niet in de spec — vandaar de gegenereerde
  kleurkaarten als fallback);
- welke queryparameter paginatie stuurt.

Elke aanname die daaruit volgt staat in de code met een verwijzing naar dit
document, en `npm run explore` is het script waarmee ze te bevestigen zijn.

### Het discovery-log

Elke proxy-call landt in `docs/discovery/log.jsonl`: methode, pad, status, timing
en de *vorm* van de response — met de `Authorization`-header geredact en zonder
response-waardes, want dat log wordt gecommit en de token is persoonlijk.

---

## Transparantie over het bouwen

Deze app is gebouwd met **Claude Code**, en dat is een bewuste werkwijze geweest,
geen bijzaak:

- **Plan eerst.** [`../PLAN-2.md`](../PLAN-2.md) is met de hand vastgesteld
  vóórdat er een regel code stond: stack, architectuur, wat bewust *niet* gebouwd
  wordt, en waar menselijke review nodig is.
- **AI heeft gedaan:** de discovery (inclusief het vinden van de OpenAPI-specs),
  de proxy-laag, de zod-schemas en tests, de componenten, de Docker-setup en het
  leeuwendeel van deze documentatie.
- **Mens heeft besloten:** de stack en architectuur, de vorm van de flow, de
  toon van de teksten, het design-oordeel, en de minute-test aan het eind.
- **Bewust niet geautomatiseerd:** het oordeel of de app écht "stupid simple" is.
  Dat is een menselijke test met een stopwatch, geen checklist.

---

## Wat er bewust niet in zit

Geen database, geen accounts, geen auth-laag — de opdracht vraagt er niet om.
Geen state manager (zie hierboven). Geen dashboard-layout. Geen Storybook en geen
e2e-suite; wel unit tests op de zod-parsing, want dáár zit bij een half
gedocumenteerde API het echte risico. Geen websockets: pollen is gevraagd en
volstaat ruim voor renders van tientallen seconden.

---

## Wat beter kan met meer tijd

- **Echte template-previews.** Nu een gegenereerde kleurkaart per template. Met
  een render van de template zelf (of een gecachete eerste asset) wordt kiezen
  een stuk makkelijker.
- **Afbeeldingen uploaden in plaats van een URL plakken.** Nu verwacht een
  image-veld een link. Een upload naar een eigen bucket, en dan die URL
  doorgeven, is voor de eindgebruiker veel natuurlijker.
- **Presets per merk.** Kleuren, logo en CTA's die al goed staan, zodat er nog
  minder in te vullen valt.
- **Batch-generatie.** De API ondersteunt het; de opdracht vroeg om één asset.
- **Webhooks in plaats van pollen** voor lange renders, met een e-mail of
  push zodra hij klaar is — dan hoeft het tabblad niet open te blijven.
- **Paginatie op templates**, zodra een account er meer heeft dan één pagina.
- **i18n.** De UI is nu volledig Nederlands.

---

## Projectstructuur

```
app/
  page.tsx                     stap 1 — templates
  maken/[templateId]/          stap 2 — invullen
  asset/[assetId]/             stap 3 en 4 — wachten en downloaden
  api/                         de proxy (templates, assets, download, health)
components/                    UI, incl. shadcn-primitives in components/ui/
lib/
  config.ts                    env inlezen en valideren
  storyteq-transport.ts        de enige plek met de token
  storyteq.ts                  de vier endpoints, zod-geparsed
  dto.ts                       API-vorm → UI-vorm (alle aannames zitten hier)
  discovery.ts                 request/response-logging, auth geredact
  errors.ts                    één foutentaxonomie, menselijke teksten
  queries.ts                   TanStack Query hooks incl. polling
docs/
  api-discovery.md             wat we over de API ontdekten
  specs/                       de opgehaalde OpenAPI-spec
  discovery/log.jsonl          request/response-vormen
  screenshots/
scripts/explore.ts             handmatige API-verkenning
```
