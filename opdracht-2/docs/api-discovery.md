# Storyteq API — wat we ontdekten

> Levend document. Bijgewerkt zolang het project loopt.
> Laatste update: 25 augustus 2026.

De opdracht waarschuwt dat de API "niet volledig gedocumenteerd" is en dat
verkennen erbij hoort. Dat klopt — maar de verkenning liep anders dan verwacht,
en dat is het eerste dat hier hoort te staan.

---

## 1. Hoe we binnenkwamen

**Eerste poging: de docs lezen.** `https://developer.storyteq.com` levert bij een
gewone fetch niets bruikbaars op: één `<title>` en verder een lege pagina. Ook
`docs.storyteq.com` en de oude Apiary-pagina (`storyteq.docs.apiary.io`) geven
alleen marketing-taal terug — "templates zijn data-driven video projects", "stuur
een POST" — zonder één concreet pad of headernaam.

**Wat het wel bleek te zijn.** De portal is geen documentatiesite maar een
**Swagger UI**. In de rauwe HTML staan de spec-bestanden die hij inlaadt:

```
./specs/storyteq-api_v4_openapi.yaml     Storyteq API v4 (Creative Automation)
./specs/cmp-v2-34_openapi.yaml           Content Management Platform API V2
./specs/CAPI_openapi.yaml                Canopy API V1 (deprecated, niet in het menu)
```

Die zijn los op te halen:

```bash
curl -sSL https://developer.storyteq.com/specs/storyteq-api_v4_openapi.yaml
```

Daarmee viel het grootste deel van het giswerk weg. De v4-spec staat als kopie in
[`docs/specs/storyteq-api_v4_openapi.yaml`](specs/storyteq-api_v4_openapi.yaml)
zodat dit document te controleren is.

**De les:** voordat je endpoints gaat raden, kijk of de "lege" docs-pagina niet
gewoon een JS-renderer is met een machine-leesbare spec eronder. `curl` + `grep`
op `.yaml|.json` kostte twee minuten en scheelde een middag trial & error.

**Welke van de drie?** Alleen v4 gaat over creatie van media uit templates. CMP V2
is een DAM/asset-picker-API met een heel ander auth-model (OAuth 2.0 via
`/token`, met client-id, username, password en een `CMP-Tenant`-header) en zegt
expliciet dat hij geen polling ondersteunt. Canopy V1 is deprecated. Voor deze
opdracht is v4 de juiste — en de enige die past bij "één API-key".

---

## 2. Wat er nu bekend is

### Base URL en regions

```
https://api.{region}.storyteq.com/v4      region ∈ { europe-west1, us-east4 }
https://api.storyteq.com/v4               legacy, in de spec als deprecated gemarkeerd
```

De region is dus een echte keuze, geen cosmetiek — vandaar `STORYTEQ_REGION` in
`.env.example`, met `europe-west1` als default.

### Authenticatie

```
Authorization: Bearer <token>
```

`securitySchemes.TokenAuth` = `http` / `bearer` / `bearerFormat: token`. De spec
zegt: "Contact your regular contact person to obtain a token" — er is dus geen
self-service en geen OAuth-dans. Eén statische bearer-token, die daarmee ook
precies zo gevoelig is als een wachtwoord.

### Endpoints

| Methode | Pad | Waarvoor |
|---|---|---|
| `GET` | `/content/templates/` | alle templates voor deze token |
| `GET` | `/content/templates/{templateId}` | één template + parameter-configuratie |
| `POST` | `/content/templates/{templateId}/media` | media aanmaken (start de render) |
| `GET` | `/content/templates/{templateId}/media` | media van een template, 50 per pagina |
| `GET` | `/content/media/{mediaId}` | status en resultaat-URL's van één media |

Alle responses zitten in een `data`-envelope.

### Media aanmaken

```http
POST /content/templates/{templateId}/media
Content-Type: application/json

{
  "template_parameters": { "<parameternaam>": "<waarde>" },
  "notifications": [{ "type": "webhook", "route": "https://…" }]
}
```

`template_parameters` is een platte map van string naar string. De namen komen uit
`GET /content/templates/{id}` — je moet de template dus eerst ophalen.

`notifications` is optioneel. Wij gebruiken het niet: webhooks vragen om een
publiek bereikbare URL, en de opdracht vraagt expliciet om pollen.

### Statussen

Uit de webhook-schemas (`MediaQueued` … `MediaFailed`):

```
queued → rendering → uploading → finished
                              ↘ failed
```

### Foutvormen

| Status | Vorm |
|---|---|
| `4XX` algemeen | `{ "error": { "message": "…" } }` |
| `409` | idem — conflict |
| `422` | `{ "message": "…", "errors": { "<scene>.<parameter>": ["…"] } }` |

De 422-keys volgen `^[\w-]+\.[\w-]+$` — parameternamen zijn dus tweedelig, in de
vorm `scene.parameter`. Dat is de reden dat de UI labels toont en niet de rauwe
namen, en dat de 422-fouten één op één op de formuliervelden gelegd kunnen worden.

---

## 3. Wat de spec níét zegt

Dit is waar de echte discovery zit. Elk punt hieronder is een aanname in de code
die met een echte token bevestigd of weerlegd moet worden.

### 3.1 Welke parameter-types bestaan er? — **open**

`TemplateParameter.type` is in de spec gewoon `type: string`, zonder enum. Maar
juist dat veld bepaalt hoe het formulier eruitziet: een tekstveld, een kleurkiezer
of een URL-veld voor een afbeelding.

Omgang: `fieldKind()` in [`lib/dto.ts`](../lib/dto.ts) matcht op patronen
(`text`, `textarea`, `image`, `video`, `colour|color`, `number`, `bool|toggle`,
`url`) en valt terug op een gewoon tekstveld bij iets onbekends. Een onbekend
type levert dus nooit een crash op, hooguit een minder passend invoerveld.

`scripts/explore.ts` telt bij `npm run explore -- template <id>` alle voorkomende
types en print ze — daarmee is deze lijst in één run te vullen.

### 3.2 `urls` of `download_urls`? — **de spec spreekt zichzelf tegen**

Het `Media`-schema (wat `GET /content/media/{id}` teruggeeft) heeft:

```yaml
urls: { image: uri, video: uri }
```

Het `MediaEvent`-schema (wat de webhooks sturen) heeft:

```yaml
download_urls: { image: uri, gif: uri, video: uri, banner: uri }
```

Twee verschillende veldnamen, en de webhook-variant kent twee formaten méér.
Omgang: we lezen allebei, in de volgorde `download_urls` → `urls`, en pakken
video boven afbeelding. Zie `pickResultUrl()` in `lib/dto.ts` en de tests in
`lib/dto.test.ts`.

### 3.3 Hebben de asset-URL's auth nodig? — **open**

`docs.storyteq.com` noemt ze "secure URLs" die 30 dagen blijven staan, maar zegt
niet of dat presigned URL's zijn of endpoints achter de bearer-token.

Omgang: de download-proxy probeert eerst zonder `Authorization`-header (een
presigned URL weigert die vaak juist) en pas bij een 401/403 mét. Zie
[`app/api/assets/[id]/download/route.ts`](../app/api/assets/%5Bid%5D/download/route.ts).

### 3.4 Zijn er thumbnails? — **niet in de spec**

`Template` heeft geen preview- of thumbnail-veld. Wel een `blueprint` met
`poster_configuration`, maar dat is een configuratie-object, geen URL.

Omgang: `findThumbnail()` kijkt op vier plausibele plekken (`thumbnail`,
`thumbnail_url`, `preview_url`, `poster`) en valt anders terug op een
gegenereerde kleurvlak-kaart met de initialen van de template. De grid ziet er
dus altijd goed uit, ook zonder previews.

### 3.5 Waar komt `COMPANY_ID` vandaan? — **waarschijnlijk niet uit deze API**

De v4-spec kent geen company-parameter; de token bepaalt de scope. `Company` komt
alleen voor in het webhook-payload-schema. Waar de company-id wél in beeld komt is
`@storyteq/platform-integration`, de iframe-SDK voor het inbedden van Storyteq's
eigen "create media"-formulier — een heel ander integratiepad dan dit.

Omgang: `STORYTEQ_COMPANY_ID` blijft optioneel. Als hij gezet is sturen we hem
mee als `X-Company-Id`; is hij leeg, dan sturen we niets. Voor zover nu bekend
maakt het geen verschil.

### 3.6 Paginatie — **deels open**

`GET /content/templates/{id}/media` zegt "Supports pagination (50 per page)" maar
noemt geen queryparameter. De response heeft `links` en `meta` (allebei
`type: object` zonder velden) — dat ruikt naar Laravel's standaard paginator, wat
`?page=N` zou betekenen. Niet bevestigd.

Voor `GET /content/templates/` staat niets over paginatie. Als een account meer
templates heeft dan één pagina, ziet de gebruiker er mogelijk te weinig. Voor deze
opdracht is dat geen probleem; voor productie wel.

### 3.7 Hoelang duurt een render? — **open**

"Seconds to several minutes, depending on batch size." Geen SLA, geen
voortgangspercentage in de API — alleen de fase.

Omgang: de voortgangsbalk in stap 3 is een *schatting* per fase (8 / 45 / 85 /
100%) met een langzame kruip ertussen, zodat hij nooit minutenlang stilstaat. Na
90 seconden verandert de copy naar "het duurt wat langer dan gebruikelijk". We
doen geen belofte die de API niet kan waarmaken.

---

## 4. Open punten voor de volgende ronde

- [ ] Echte parameter-types verzamelen (`npm run explore -- template <id>`)
- [ ] `urls` vs `download_urls`: welke komt er echt uit `GET /content/media/{id}`?
- [ ] Statusvolgorde en werkelijke timings vastleggen (`npm run explore -- watch <id>`)
- [ ] Asset-URL's: presigned of bearer?
- [ ] Paginatie-parameter bevestigen
- [ ] Bestaan de ongedocumenteerde paden (`/me`, `/content/media/`, `…/preview`)?

Deze punten worden ingevuld zodra er tegen de echte API gedraaid is; het
verkenningsscript print precies wat ervoor nodig is.

---

## 5. Het discovery-log

Elke call die de proxy doet wordt weggeschreven naar
[`docs/discovery/log.jsonl`](discovery/) — één JSON-object per regel:

```json
{"ts":"…","method":"GET","path":"/content/templates/","status":200,"ms":412,
 "requestHeaders":{"authorization":"<redacted:64chars>"},
 "responseShape":{"data":[{"id":"integer","name":"string"}]}}
```

Twee bewuste keuzes:

1. **De `Authorization`-header wordt geredact** tot `<redacted:Nchars>`. Het log
   wordt gecommit; de token is persoonlijk.
2. **Alleen de *vorm*, niet de *waardes*.** `shapeOf()` maakt van elke response
   een type-boom. Zo is te zien dat een veld bestaat en van welk type het is,
   zonder dat er klantdata in de repo belandt.

Rauwe responses (voor eigen inspectie) schrijft het verkenningsscript naar
`docs/discovery/raw/` — dat staat in `.gitignore`.
