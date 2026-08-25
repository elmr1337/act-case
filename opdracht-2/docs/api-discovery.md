# Storyteq API — wat we ontdekten

> Levend document, bijgehouden tijdens het bouwen.
> Laatste update: 25 augustus 2026, na een volledige ronde tegen de productie-API.

De opdracht waarschuwt dat de API "niet volledig gedocumenteerd" is en dat
verkennen erbij hoort. Dat klopt — maar de verkenning liep anders dan verwacht,
en dat is het eerste dat hier hoort te staan.

---

## 1. Hoe we binnenkwamen

**Eerste poging: de docs lezen.** `https://developer.storyteq.com` levert bij een
gewone fetch niets bruikbaars op: één `<title>` en verder een lege pagina. Ook
`docs.storyteq.com` en de oude Apiary-pagina geven alleen marketing-taal terug —
"templates zijn data-driven video projects", "stuur een POST" — zonder één
concreet pad of headernaam.

**Wat het wel bleek te zijn.** De portal is geen documentatiesite maar een
**Swagger UI**. In de rauwe HTML staan de spec-bestanden die hij inlaadt:

```
./specs/storyteq-api_v4_openapi.yaml     Storyteq API v4 (Creative Automation)
./specs/cmp-v2-34_openapi.yaml           Content Management Platform API V2
./specs/CAPI_openapi.yaml                Canopy API V1 (deprecated, niet in het menu)
```

Los op te halen:

```bash
curl -sSL https://developer.storyteq.com/specs/storyteq-api_v4_openapi.yaml
```

De v4-spec staat als kopie in
[`docs/specs/storyteq-api_v4_openapi.yaml`](specs/storyteq-api_v4_openapi.yaml)
zodat dit document te controleren is.

**De les:** voordat je endpoints gaat raden, kijk of de "lege" docs-pagina niet
gewoon een JS-renderer is met een machine-leesbare spec eronder. `curl` + `grep`
op `.yaml|.json` kostte twee minuten en scheelde een middag trial & error.

**Welke van de drie?** Alleen v4 gaat over creatie van media uit templates. CMP V2
is een DAM-API met een heel ander auth-model (OAuth 2.0 via `/token`, met
client-id, username, password en een `CMP-Tenant`-header) die expliciet zegt geen
polling te ondersteunen. Canopy V1 is deprecated.

**En toen bleek de spec op belangrijke punten onvolledig.** Wat volgt is wat er
uit echte calls kwam, met een eigen bearer-token op één company.

---

## 2. Authenticatie — de spec vertelt de helft

De spec zegt: `Authorization: Bearer <token>`. Dat klopt, maar is niet genoeg.

Alle varianten op `GET /content/templates/`, met dezelfde geldige token:

| Variant | Resultaat |
|---|---|
| `Authorization: Bearer <token>` | **403** — zie hieronder |
| `Authorization: <token>` | 401 `Unauthenticated.` |
| `Authorization: Token <token>` | 401 `Unauthenticated.` |
| `X-Api-Key: <token>` | 401 `Unauthenticated.` |
| geen auth | 401 `Unauthenticated.` |
| `Bearer <onzin>` | 401 `[Keycloak] Wrong number of segments` |

Twee dingen die nergens gedocumenteerd staan:

**1. `X-Company-Id` is verplicht zodra een token bij meerdere companies mag.**
Met alleen de bearer-token:

```
403 {"message":"This user has access to multiple companies.
     Please provide a X-Company-Id header or company_id query parameter"}
```

De v4-spec noemt geen company-parameter en suggereert dat de token de scope
bepaalt. Voor een persoonlijke medewerkers-token gaat dat niet op. `Company`
komt in de spec alleen voor in het webhook-payload-schema.

→ `STORYTEQ_COMPANY_ID` is dus **geen optioneel extraatje maar een vereiste**
voor dit soort tokens. De client stuurt hem als `X-Company-Id`; zie
[`lib/storyteq-transport.ts`](../lib/storyteq-transport.ts).

**2. De backend is Keycloak.** De foutmelding "Wrong number of segments" bij een
onzin-token verraadt dat het om een JWT gaat, niet om een opaak API-sleuteltje.
De token verloopt dus waarschijnlijk — iets om rekening mee te houden bij een
langer lopende integratie.

---

## 3. Endpoints

Base URL: `https://api.{region}.storyteq.com/v4`, region ∈ `europe-west1` |
`us-east4`. Er is ook een legacy `https://api.storyteq.com/v4`, in de spec als
deprecated gemarkeerd.

### Gedocumenteerd en bevestigd

| Methode | Pad | Waarvoor |
|---|---|---|
| `GET` | `/content/templates/` | alle templates voor deze company |
| `GET` | `/content/templates/{id}` | één template **inclusief** parameters |
| `POST` | `/content/templates/{id}/media` | media aanmaken (start de render) |
| `GET` | `/content/templates/{id}/media` | media van een template, 50 per pagina |
| `GET` | `/content/media/{id}` | status en resultaat-URL's |

### Ongedocumenteerd, wel aanwezig

Afgetast met `npm run explore`:

| Pad | Status |
|---|---|
| `GET /content/templates` (zonder slash) | 200 — werkt gewoon |
| `GET /content/templates/?page=2` | 200 — paginatie |
| `GET /content/media/` | 200 — media over alle templates heen |
| `GET /companies` | 200 |
| `GET /content/folders/` | 200 |
| `GET /content/templates/{id}/versions` | 200 |
| `GET /me`, `GET /user` | 404 |
| `GET /content/templates/{id}/preview` | 404 |
| `GET /content/templates/{id}/parameters` | 404 |
| `GET /content/templates/0` | 404 — nette foutvorm |

### Paginatie — bevestigd

Standaard Laravel-paginatie, met `?page=N`:

```json
"meta":  { "current_page": 1, "last_page": 1, "per_page": 50, "total": 40 },
"links": { "first": "…?page=1", "last": "…?page=1", "prev": null, "next": null }
```

---

## 4. Het grote gat: de parameter-configuratie

Dit is waar de spec het meest tekortschiet. Volgens de spec heeft een
`TemplateParameter` precies drie velden:

```yaml
TemplateParameter:
  properties:
    name:  { type: string }
    label: { type: string }
    type:  { type: string }     # geen enum
```

In werkelijkheid komen er **achttien** velden terug. De relevante:

| Veld | Wat het is | Waarom het uitmaakt |
|---|---|---|
| `required` | `0` of `1` — een integer, geen boolean | Verplichte velden zijn nu vóór het versturen af te vangen |
| `order` | integer | De API levert parameters niet in de volgorde die de template bedoelt |
| `meta.values` | `[{ label, value }]` bij `type: "enum"` | Dit maakt van een tekstveld een keuzelijst |
| `default` / `value` | voorinvulling | Minder werk voor de gebruiker |
| `show_if` | voorwaardelijke zichtbaarheid | Nog niet gebruikt; was `null` in alles wat we zagen |
| `validation_rules` | validatie | Idem, altijd `null` in onze data |
| `input_type` | preciezer dan `type` | Idem |

En verder `id`, `value_meta`, `mediavariations`, `product_group`,
`content_feed_group`, `content_feed_cursor`, `text_style_rules` — allemaal
buiten scope voor deze opdracht.

### Parameter-types die we tegenkwamen

`text`, `enum`, `image`. Meer niet, in de templates waar deze token bij mag.
Er is geen enum in de spec, dus dit is een waarneming en geen garantie —
`fieldKind()` in [`lib/dto.ts`](../lib/dto.ts) valt daarom terug op een gewoon
tekstveld bij alles wat hij niet herkent.

### De namen zijn UUID's, de labels zijn menselijk

```json
{ "name": "parameter-5cdb76a4-ddef-400d-9f6c-c256ad0e7f98",
  "label": "Headline", "type": "text", "required": 0, "order": 1 }
```

Uitzondering: `size` heet gewoon `size` en heeft `meta.managingScene: true` —
die bepaalt het uitvoerformaat (bijv. `1920x1080` of `1080x1920`).

Bij een `enum` is de te versturen wáarde óók een UUID:

```json
"meta": { "values": [
  { "label": "Blue",  "value": "parameterValue-773441a6-…" },
  { "label": "Green", "value": "parameterValue-93f1d2f5-…" }
]}
```

→ De UI mag dus nooit `name` tonen (dat is een UUID) en moet bij een enum het
`label` tonen maar de `value` versturen.

> **Let op:** de spec zegt dat 422-foutsleutels de vorm `^[\w-]+\.[\w-]+$`
> hebben, wat suggereert dat parameternamen `scene.parameter` heten. Dat is niet
> zo — de punt komt van het prefix `template_parameters.`, niet uit de naam.

### Het lijst-endpoint geeft géén parameters

`GET /content/templates/` levert wel `thumbnail_url`, `media_types`,
`media_count`, `tags`, `status`, `archive` — maar geen `parameters`. Je hebt dus
altijd de detail-call nodig voordat je een formulier kunt bouwen. Daarom toont
de templatekaart in stap 1 níet "7 velden invullen" maar wat er uitkomt (video,
banner of afbeelding), afgeleid uit `media_types`.

---

## 5. Media aanmaken

```http
POST /content/templates/{id}/media
Authorization: Bearer <token>
X-Company-Id: <id>
Content-Type: application/json

{ "template_parameters": { "<parameternaam>": "<waarde>" } }
```

`notifications` (webhooks) is optioneel; wij gebruiken het niet, want de opdracht
vraagt expliciet om pollen en een webhook vereist een publiek bereikbare URL.

### Een leeg optioneel veld moet je wéglaten

Dit kostte de eerste twee pogingen. Een `image`-parameter met `required: 0`,
meegestuurd als lege string:

```json
{ "template_parameters": { "parameter-0689566e-…": "" } }
```

levert:

```
422 The template parameters.parameter-0689566e-… format is invalid.
```

Een 422 op een veld dat niet verplicht is en dat de gebruiker leeg mócht laten.
De oplossing is het veld helemaal niet mee te sturen; dan gebruikt Storyteq de
standaardwaarde van de template. Zie `withoutEmptyValues()` in
[`lib/storyteq.ts`](../lib/storyteq.ts).

### Foutvormen

| Status | Vorm |
|---|---|
| `4XX` algemeen | `{ "error": { "message": "…" } }` |
| `401` | `{ "message": "Unauthenticated." }` — dus **`message`, niet `error.message`** |
| `403` | `{ "message": "…" }` — idem |
| `422` | `{ "message": "…", "errors": { "template_parameters.<naam>": ["…"] } }` |

De spec belooft overal `{ error: { message } }`; in de praktijk komt bij 401/403
en 422 een plat `message`-veld terug. Ons `genericErrorSchema` accepteert
allebei.

De 422-teksten zijn Engels en noemen de UUID-parameternaam
("The template parameters.parameter-0689566e-… format is invalid"). Die gaan
níet naar de gebruiker: `humanizeFieldError()` in
[`lib/errors.ts`](../lib/errors.ts) maakt er Nederlandse veldfouten van, en de
originele tekst blijft in de server-logs.

---

## 6. Statussen en timing

De spec noemt `queued → rendering → uploading → finished | failed`.

Wat we in werkelijkheid maten, op template 43973 ("Opdracht 2", een
After Effects-video van 1080×1920):

```
   0s   queued
 120s   rendering
 220s   finished
```

Twee dingen:

- **`uploading` kwam niet voorbij.** Mogelijk te kort om tussen twee polls van
  2 seconden te vallen, mogelijk wordt hij bij dit templatetype overgeslagen.
  De UI behandelt hem daarom als "kan voorkomen", niet als "komt altijd".
- **De wachtrij is het grootste deel van de wachttijd.** `processing_time` op de
  template stond op `94` seconden; van knop tot bestand duurde het 220. Dat veld
  is dus de *rendertijd*, niet de doorlooptijd.

Er is geen voortgangspercentage in de API — alleen de fase. De balk in stap 3 is
daarom een schatting per fase (8 / 45 / 85 / 100%) met een langzame kruip
ertussen, zodat hij nooit minutenlang stilstaat, en de copy belooft "één tot drie
minuten" in plaats van iets preciezers.

---

## 7. `urls` versus `download_urls` — de spec spreekt zichzelf tegen

Het `Media`-schema heeft `urls: { image, video }`. Het `MediaEvent`-schema (de
webhooks) heeft `download_urls: { image, gif, video, banner }`. Het leest als
twee namen voor hetzelfde ding.

Dat is het niet. Ze bestaan **allebei tegelijk** en betekenen iets anders:

```json
"urls": {
  "image":         "https://assets.api.<region>.storyteq.com/v1/assets/<uuid>/transforms/custom-thumbnail?filename=render.jpg",
  "video":         "https://assets.api.<region>.storyteq.com/v1/assets/<uuid>?filename=render.mp4",
  "preview_video": "https://assets.api.<region>.storyteq.com/v1/assets/<uuid>/transforms/custom-video-preview?filename=render.mp4"
},
"download_urls": {
  "image":  "https://api.<region>.storyteq.com/v4/open/media/<hash>/download/image",
  "gif":    "…/download/gif",
  "video":  "…/download/video",
  "banner": "…/download/banner"
}
```

- `urls` → de CDN. Om te **bekijken**; ondersteunt Range-requests, dus de
  videospeler kan ermee spoelen. Bevat ook een `preview_video` die de spec niet noemt.
- `download_urls` → `/v4/open/media/{hash}/download/{formaat}`. Om te
  **downloaden**.

Allebei zijn ze **publiek**: zonder `Authorization` geven ze een `302` naar
`assets.api.<region>.storyteq.com`. De docs noemen ze "secure URLs" die 30 dagen
blijven staan; ze zijn dus wel *unguessable*, maar niet afgeschermd.

De app gebruikt `urls` voor de speler en `download_urls` voor de downloadknop —
allebei door onze eigen proxy, zodat de browser nooit rechtstreeks met Storyteq
praat. Zie `previewSourceFor()` en `downloadSourceFor()` in `lib/dto.ts`.

Verder is `media.name` in de praktijk gewoon het id nog een keer ("26943410"),
dus voor de bestandsnaam gebruiken we `media.template.name` — een veld dat de
spec ook niet noemt.

---

## 8. Thumbnails — bestaan wél

`Template` heeft in de spec geen preview-veld. In werkelijkheid zit
`thumbnail_url` op zowel het lijst- als het detail-endpoint, en wijst naar
dezelfde publieke CDN. Dertien van de veertien templates hadden er een.

De app haalt ze op via `/api/templates/{id}/thumbnail`. Dat is niet omdat ze
afgeschermd zijn — dat zijn ze niet — maar omdat de afspraak is dat de browser
alleen met onze eigen API praat, en het scheelt Storyteq een lijst van welke
templates iemand zit te bekijken. De URL's uit de lijst-call worden tien minuten
onthouden zodat de proxy er geen detail-call per kaart voor hoeft te doen.

---

## 9. Wat nog open staat

- **Wat is een geldige waarde voor een `image`-parameter?** In alle 40 bestaande
  media van de testtemplate stond `""`. Een URL ligt voor de hand (de UI vraagt
  er nu om), maar dat is niet bevestigd: mogelijk verwacht Storyteq een asset-id
  uit de eigen DAM. Dit is de belangrijkste openstaande vraag.
- **`show_if`, `validation_rules`, `input_type`** waren overal `null`. Onbekend
  wanneer ze gevuld zijn en wat er dan in staat.
- **Verloopt de token?** Het is een Keycloak-JWT, dus waarschijnlijk wel. Niet
  getest hoe lang.
- **`uploading`** hebben we nooit zien langskomen.
- **`/companies`, `/content/folders/`, `/content/media/`** bestaan maar zijn niet
  uitgeplozen — geen van drieën is nodig voor deze flow.

---

## 10. Het discovery-log

Elke call die de proxy doet wordt weggeschreven naar `docs/discovery/log.jsonl`
— één JSON-object per regel:

```json
{"ts":"…","method":"GET","path":"/content/templates/","status":200,"ms":885,
 "requestHeaders":{"authorization":"<redacted:32chars>","x-company-id":"…"},
 "responseShape":{"data":[{"id":"integer","name":"string","thumbnail_url":"string(uri)",
                          "parameters?":[{"name":"string","required":"integer"}]}]}}
```

Drie bewuste keuzes:

1. **De `Authorization`-header wordt geredact** tot `<redacted:Nchars>`. Het log
   wordt gecommit; de token is persoonlijk.
2. **Alleen de *vorm*, niet de *waardes*.** `shapeOf()` maakt van elke response
   een type-boom. Zo is te zien dát een veld bestaat en van welk type het is,
   zonder dat er klantdata in de repo belandt.
3. **Heterogene lijsten worden samengevoegd**, met `?` achter sleutels die niet
   in élk item zaten. Precies zo kwamen we erachter dat het lijst-endpoint geen
   `parameters` heeft en het detail-endpoint wel.

Foutteksten van Storyteq worden wél letterlijk gelogd — dat is juist de
discovery-waarde, en het is de enige plek waar ze terechtkomen: de UI krijgt ze
nooit te zien.

Rauwe responses schrijft het verkenningsscript naar `docs/discovery/raw/`. Die
map staat in `.gitignore`: daar zitten templatenamen en campagneteksten van
klanten in.

---

## 11. Wat de batch- en wachtrij-functies uit de API halen

Twee dingen die de app doet en die niet uit de documentatie komen:

**De tijdsverwachting** in het wachtscherm komt uit `events` op media — een veld
dat in geen enkel schema staat en per fase een tijdstempel bevat:

```json
"events": [
  { "type": "finished",  "created_at": "2026-08-25 11:52:05" },
  { "type": "uploading", "created_at": "2026-08-25 11:52:00" },
  { "type": "rendering", "created_at": "2026-08-25 11:50:00" },
  { "type": "queued",    "created_at": "2026-08-25 11:48:56" }
]
```

Over 44 eerdere renders van template 43973 geeft dat: mediaan 122s, p90 362s.
Dat is de bron voor "nog ongeveer twee minuten" — niet `processing_time`.

**Het invulbestand** gebruikt de `label`-velden als kolomkoppen en de
`meta.values` als toegestane waardes, zodat iemand in Excel "Green" kan invullen
in plaats van `parameterValue-93f1d2f5-a120-4272-b53d-b34051d0cb12`.

Beide functies leunen dus op velden die de spec niet noemt. Als Storyteq ze
weghaalt, verdwijnt de verwachting en valt de app terug op "één tot drie
minuten" — dat is bewust zo gebouwd, niet toevallig.

---

### Zelf verkennen

```bash
npm run explore                  # auth-varianten, templates, detail, ongedocumenteerde paden
npm run explore -- template 43973
npm run explore -- media 27155197
npm run explore -- watch 27155197   # pollen met timings
npm run explore -- create 43973      # let op: dit start een echte render
```
