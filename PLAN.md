# PLAN — ACT.agency Praktijkcase, Opdracht 1: Visuele Stijlkloning

> Dit plan is geschreven voor Claude Code. Werk het fase voor fase af.
> Stop bij elke `🧑 HUMAN` checkpoint en wacht op input van Elmar — die stappen kun je niet zelf doen.

---

## 0. Goal & context

ACT.agency (campagnes voor o.a. Odido en Schiphol) beoordeelt deze case op:

1. **Kwaliteit van de stijlanalyse**
2. **Visuele consistentie van de output**
3. **Onderbouwing van toolkeuze**
4. **Zelfkritisch vermogen**

Harde deliverables opdracht 1:
- Minimaal **3 nieuwe beelden** met andere personen (niet uit de originele set), consistent met de campagnestijl
- **Max 5 slides** (of losse afbeeldingen): aanpak, toolkeuze, resultaat, wat anders met meer tijd/budget
- Alles in een **gedeelde GitHub-repo** (samen met opdracht 2), export van de afbeeldingen

Onze aanpak (besloten):
- **Eén analysefase, drie generatiestrategieën**, elk met LUT aan/uit → 3×2 matrix:
  - `prompt` — prompt-only op **Flux** (zelfde basemodel als de LoRA, zodat de LoRA-delta geïsoleerd is)
  - `multiref` — **Nano Banana Pro** (Gemini image API) met 3–5 campagnebeelden als multi-reference
  - `lora` — style LoRA getraind op de campagneset via **fal.ai**
- **Stijlanalyse dubbel**: eerst Elmars eigen analyse (menselijk oog), daarna AI-analyse, dan mergen tot één style guide + delta-vergelijking
- **LUT**: eenmalig handmatig gemaakt (.cube) uit de originele set; de worker past 'm alleen toe
- Uitvoering via een **standalone Go worker**: Redis queue, S3 in/uit, cost logging per job
- De worker is bewijsmateriaal en herbruikbare infra — de deck en de 3 beelden zijn de deliverable. Bouw de worker als MVP: CLI, geen UI.

---

## 1. Repo-structuur

De case vraagt **één gedeelde repo voor beide opdrachten**. Maak deze structuur (opdracht 2 komt later, laat de folder alvast staan):

```
act-case/
├── README.md                  # root: overzicht beide opdrachten, links
├── .gitignore                 # secrets, outputs cache, binaries, .env
├── opdracht-1/
│   ├── README.md              # aanpak, toolkeuze, run-logs, kosten, verbeterpunten
│   ├── CLAUDE.md              # instructies voor Claude Code in deze codebase
│   ├── worker/                # Go worker (zie §3)
│   │   ├── cmd/worker/        # main: queue consumer
│   │   ├── cmd/enqueue/       # CLI: jobs op de queue zetten
│   │   ├── internal/queue/    # interface: memory (default) | redis (optioneel)
│   │   ├── internal/store/    # interface: local fs (default) | s3 (optioneel)
│   │   ├── internal/provider/ # gemini.go, fal.go (prompt+train+lora-generate)
│   │   ├── internal/lut/      # .cube parser + trilineaire interpolatie
│   │   ├── internal/analyze/  # vision-analyse per image + aggregatie
│   │   ├── internal/cost/     # kosten per job loggen
│   │   ├── Dockerfile         # multi-stage, distroless (zie §6)
│   │   ├── docker-compose.yml # optioneel: alleen voor redis-mode
│   │   ├── Makefile
│   │   ├── .env.example
│   │   └── go.mod
│   ├── analysis/
│   │   ├── human.md           # 🧑 Elmars eigen stijlanalyse
│   │   ├── ai/                # per-image JSON + aggregated-style-guide.md (gegenereerd)
│   │   ├── delta.md           # vergelijking mens vs AI (gegenereerd, door Elmar gereviewd)
│   │   └── style-guide.md     # gemergde versie — voedt alle generatie
│   ├── lut/
│   │   └── campaign.cube      # 🧑 handmatig gemaakt in Photoshop/Resolve
│   ├── outputs/
│   │   ├── prompt/  prompt-lut/
│   │   ├── multiref/  multiref-lut/
│   │   ├── lora/  lora-lut/
│   │   └── costs.json         # gegenereerd door de worker
│   ├── images/final/          # de 3 (of meer) definitieve beelden
│   └── deck/                  # 5 slides (zie §5)
└── opdracht-2/                # placeholder, .gitkeep
```

**Let op:** de repo zelf wordt beoordeeld. Nette commits (conventional-achtig, per fase), geen debug-rommel, geen secrets — ooit, ook niet in history. `.env.example` wel, `.env` in `.gitignore`.

---

## 2. Fase 0 — Setup

- [ ] `git init`, structuur uit §1 aanmaken, eerste commit
- [ ] GitHub repo aanmaken (private tot oplevering): `gh repo create`
- [ ] Go module init (Go 1.22+), deps: `go-redis/v9`, `aws-sdk-go-v2` (S3, werkt met Hetzner endpoint), std lib image
- [ ] `.env.example` schrijven (zie §7)
- [ ] `CLAUDE.md` schrijven: hoe de worker te bouwen/runnen/testen, welke commando's, wat NIET te doen (geen secrets committen, geen outputs verwijderen)
- [ ] 🧑 HUMAN: Elmar zet de originele campagnefoto's in `./data/reference/` (folder staat in `.gitignore` — check of de foto's überhaupt gedeeld mogen worden, waarschijnlijk NIET publiek, dus reference images blijven uit git)

---

## 3. Fase 1 — Go worker

**Local-first.** Twee interfaces met env-gestuurde drivers:

- `Store`: `local` (default — leest `./data/reference/`, schrijft `./outputs/`) | `s3` (optioneel, Hetzner)
- `Queue`: `memory` (default — channel + goroutine worker pool, enqueue en worker in één proces) | `redis` (optioneel)

Default mode is dus een **batch runner**: `worker run matrix.yaml` leest een jobs-definitie, draait alles via de pool, klaar. Nul infra nodig. Redis/S3 zijn een env-var switch voor de productie-story, geen requirement. Providers hebben geen bucket nodig: Gemini krijgt reference images inline (base64), fal heeft een eigen upload-endpoint voor de training-zip.

Job model:

```json
{
  "id": "uuid",
  "type": "analyze | train | generate",
  "client_id": "act-case",
  "variant": "prompt | multiref | lora",
  "lut": true,
  "prompt": "…",
  "created_at": "…"
}
```

Memory driver: buffered channel + worker pool, job status in een sync.Map. Redis driver (optioneel): simpele list (`LPUSH`/`BRPOP`), status via `HSET job:{id}`. Geen framework nodig.

### 3.1 `analyze` job
- Lees alle images via de Store (default: `./data/reference/`)
- Per image → vision model (Gemini of Claude API, kies één, maak provider pluggable): output **gestructureerde JSON**, twee blokken strikt gescheiden:
  - `content`: persoon, actie, setting, kleding (→ dit worden de LoRA-captions)
  - `style`: belichting (richting/hardheid/temperatuur), kleurpalet (hex swatches), compositie/framing, lens-look (brandpunt-indruk, DOF), grading, sfeer
- Aggregeer alle style-blokken → `aggregated-style-guide.md` + do's/don'ts
- Schrijf captions-bestand voor de LoRA-training (content per image, stijl NIET beschrijven — stijl moet in de trigger phrase gebakken worden)
- Schrijf alles via de Store naar `context/` (default landt dat in `analysis/ai/`)
- 🧑 HUMAN checkpoint: Elmar schrijft `analysis/human.md` VÓÓR hij de AI-output leest. Daarna genereert Claude Code `delta.md` (mens vs AI) en mergen we samen naar `style-guide.md`.

### 3.2 `train` job (alleen lora-variant)
- Zip reference images + captions → fal.ai Flux LoRA trainer
- Settings: style-modus (auto-captioning/segmentation UIT), trigger phrase (bijv. `ACTCAMP style`), rank 16–32, ~1000 steps (maak steps configureerbaar; ideaal: 500/1000/2000 runnen voor de overfitting-vergelijking in de deck)
- Poll tot klaar, LoRA-URL + metadata → Store `models/` + job result
- Kosten uit de fal response loggen

### 3.3 `generate` job
- Laad context afhankelijk van variant:
  - `prompt`: style-guide.md meesturen als style prompt → Flux (fal.ai)
  - `multiref`: 3–5 reference images + prompt → Gemini image API (Nano Banana Pro)
  - `lora`: Flux + LoRA-URL + trigger phrase + prompt (fal.ai)
- Als `lut: true` → output door `internal/lut` (parse `campaign.cube`, trilineaire interpolatie, pure Go, geen cgo)
- Schrijf via de Store naar `outputs/{variant}[-lut]/{job_id}.png`
- **Kosten per job** loggen (fal: uit response; Gemini: bekende prijs per image uit config) → append `outputs/costs.json`

### 3.4 Kwaliteit
- [ ] Unit tests voor de LUT (bekende input → verwachte output) en de queue serialisatie
- [ ] Nette error handling: failed job → status `failed` + reden, worker crasht niet
- [ ] `make build`, `make test`, `make run`, `make enqueue ARGS=…`

---

## 4. Fase 2 — De matrix draaien

- [ ] 3 testprompts vaststellen 🧑 HUMAN (andere personen, andere settings, wel campagne-passend — bijv. verschillende leeftijden/contexten om consistentie te bewijzen)
- [ ] Alle 6 cellen × 3 prompts enqueuen = 18 outputs (LoRA-variant: eerst `train`)
- [ ] Contact sheet genereren: script dat per prompt een grid maakt (6 cellen naast elkaar + origineel referentiebeeld) → `deck/assets/grid-{n}.png`
- [ ] Kosten-tabel genereren uit `costs.json` → markdown tabel voor README + deck
- [ ] 🧑 HUMAN checkpoint: Elmar kiest de winnende variant en de 3 finale beelden → `images/final/`. NIET automatisch kiezen.

---

## 5. Fase 3 — Deck (max 5 slides)

Bouw als HTML slides (1920×1080 per slide, export naar PNG + één PDF). Strak, veel beeld, weinig tekst. Geen "AI vibe" formuleringen in de teksten.

1. **Stijlanalyse** — twee kolommen (eigen analyse / AI-analyse), annotaties op de originelen, palette swatches, merged style guide als conclusie
2. **Aanpak** — pipeline-diagram: analyse → 3 strategieën × LUT; één zin waarom drie routes getest i.p.v. één gegokt
3. **Resultaat** — de 3 finale beelden groot naast 2–3 originelen (hero slide)
4. **Vergelijking** — de 6-cel grid van één prompt + kosten per cel
5. **Zelfkritiek + meer tijd/budget** — waar het faalde (content leakage, overfitting, details), en: eenmalig multiref vs. brand-LoRA als klant-asset bij doorlopende samenwerking

🧑 HUMAN checkpoint: Elmar reviewt en herschrijft de teksten in eigen woorden. De deck moet klinken als Elmar, niet als een model.

---

## 6. Docker

Doel: image bouwen en runnen **zonder Go toolchain op de host**.

- Multi-stage Dockerfile: `golang:1.22-alpine` build stage → `gcr.io/distroless/static` (of `scratch`) runtime, statisch gecompileerd (`CGO_ENABLED=0`)
- Default mode = één container, geen compose nodig: `docker run --env-file .env -v ./data:/data -v ./outputs:/outputs act-worker run matrix.yaml`
- `docker-compose.yml` alleen als voorbeeld voor de redis-mode (redis:7-alpine + worker) — documenteren als "zo schaal je 'm", niet als requirement
- Makefile targets: `make docker-build`, `make docker-run ARGS=…`
- README: quickstart in 3 commando's (`cp .env.example .env` → `make docker-build` → `make docker-run ARGS="run matrix.yaml"`)

---

## 7. .env.example

```
# Drivers (defaults: alles lokaal, nul infra)
QUEUE_DRIVER=memory        # memory | redis
STORE_DRIVER=local         # local | s3
DATA_DIR=./data
OUTPUT_DIR=./outputs

# Alleen nodig bij QUEUE_DRIVER=redis
REDIS_URL=

# Alleen nodig bij STORE_DRIVER=s3 (Hetzner Object Storage)
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Providers
FAL_API_KEY=
GEMINI_API_KEY=

# Cost config (prijs per image voor providers zonder cost in response)
GEMINI_IMAGE_COST_USD=0.00

# Optioneel
ANTHROPIC_API_KEY=        # als analyze via Claude loopt
```

---

## 8. README's

**Root README**: wat is deze repo, twee opdrachten, per opdracht een link + one-liner.

**opdracht-1/README.md** (dit lezen de beoordelaars — schrijf 'm alsof het de pitch-bijlage is):
- Aanpak in 5 regels + pipeline diagram
- Toolkeuze-onderbouwing (waarom deze 3 + LUT, waarom Flux als baseline voor eerlijke LoRA-vergelijking)
- Quickstart (Docker, 3 commando's)
- Run-logs samenvatting + kosten-tabel (gegenereerd)
- Wat ik anders zou doen met meer tijd/budget
- Transparantie: welke AI-tooling gebruikt bij het bouwen (Claude Code) — ze moedigen vibecoding aan bij opdracht 2, wees er ook hier gewoon open over

---

## 9. CLAUDE.md (in opdracht-1/)

Schrijf een korte CLAUDE.md voor toekomstige sessies:
- Projectcontext in 3 regels + verwijzing naar dit PLAN
- Commando's: build, test, run, enqueue, docker
- Conventies: waar outputs landen, dat `analysis/human.md` en `images/final/` van Elmar zijn (nooit genereren/overschrijven)
- Nooit: secrets committen, reference images committen, outputs weggooien

---

## 10. Definition of done

- [ ] `make docker-build && make docker-run` werkt op een schone machine met alleen Docker + `.env` — geen Redis, geen S3, geen Go toolchain
- [ ] 18 outputs in `outputs/`, `costs.json` compleet
- [ ] 3+ finale beelden in `images/final/`, geëxporteerd op hoge resolutie
- [ ] 5 slides als PNG + PDF in `deck/`
- [ ] Beide analyses + delta + merged style guide in `analysis/`
- [ ] README's af, repo history schoon, geen secrets, geen reference images in git

## 11. Bewust NIET doen

- Geen web-UI voor de worker
- Geen vector database (context wordt altijd volledig meegestuurd — retrieval lost hier niks op)
- Geen extra providers naast de 3 gekozen varianten
- Geen automatische keuze van de finale beelden — dat is menselijk curatiewerk en hoort bij het zelfkritisch verhaal