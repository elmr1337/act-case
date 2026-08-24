# CLAUDE.md — opdracht-1

## Context

ACT.agency praktijkcase, opdracht 1: campagnestijl klonen via drie
generatiestrategieën (prompt / multiref / lora) × LUT aan/uit. De Go-worker in
`worker/` voert alles uit; de deck en de finale beelden zijn de deliverable.
Het volledige werkplan staat in [../PLAN.md](../PLAN.md) — volg de fases en
stop bij elke 🧑 HUMAN-checkpoint.

## Commando's

Alles via de Makefile in `worker/` (run-targets draaien vanuit `opdracht-1/`):

```
make -C worker build|test|vet          # bouwen en testen
make -C worker run                     # volledige matrix (matrix.yaml)
make -C worker analyze                 # alleen de analyze-job
make -C worker costs                   # kosten-tabel uit outputs/costs.json
make -C worker docker-build            # image bouwen (multi-stage, distroless)
make -C worker docker-run ARGS="run matrix.yaml"
make -C worker enqueue ARGS="..."      # losse job op de redis-queue
```

Config via `opdracht-1/.env` (template: `worker/.env.example`). Defaults zijn
local-first: memory-queue + lokaal bestandssysteem, geen Redis/S3 nodig.

## Conventies

- Outputs landen in `outputs/{variant}[-lut]/{prompt-id}.png`; kosten in
  `outputs/costs.json` (append-only via de worker, niet met de hand bewerken).
- AI-analyse landt in `analysis/ai/` (per-beeld JSON, captions,
  aggregated-style-guide.md, style-prompt.txt).
- De generatie leest `analysis/style-prompt.txt` als die bestaat (Elmars
  gemergde versie), anders `analysis/ai/style-prompt.txt`.
- LoRA-metadata in `models/` (committen mag, bevat geen secrets).

## Van Elmar — nooit genereren of overschrijven

- `analysis/human.md` (eigen analyse, geschreven vóór de AI-output)
- `analysis/style-guide.md` (de merge) en `analysis/delta.md` na zijn review
- `images/final/` (menselijke curatie, nooit automatisch kiezen)
- de prompts in `matrix.yaml` (concept mag, vaststellen doet Elmar)
- `lut/campaign.cube` (handmatig gemaakt)

## Nooit

- Secrets committen (`.env` staat in .gitignore — ook nooit in history)
- Reference-beelden committen (`data/` staat in .gitignore, niet publiek delen)
- Bestaande outputs of `outputs/costs.json` weggooien of overschrijven
