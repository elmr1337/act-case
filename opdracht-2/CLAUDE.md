@AGENTS.md

# CLAUDE.md — opdracht-2

## Context

ACT.agency praktijkcase, opdracht 2: een Next.js-app waarmee iemand zónder
technische achtergrond binnen een minuut een asset genereert en downloadt via de
Storyteq API. Vier stappen, lineair, geen dashboard. Het volledige werkplan staat
in [../PLAN-2.md](../PLAN-2.md) — volg de fases en stop bij elke 🧑 HUMAN-checkpoint.

## Commando's

```
make dev            # dev-server op :3000
make build          # productie-build
make lint           # eslint
make test           # vitest — zod-parsing van API-responses
make explore        # Storyteq API verkennen (schrijft naar docs/discovery/)
make docker-build   # image bouwen
make docker-run     # image draaien met --env-file .env.local
```

Config via `opdracht-2/.env.local` (template: `.env.example`).

## Architectuur in het kort

```
browser ──► app/api/*  (route handlers = proxy)  ──► api.{region}.storyteq.com/v4
            lib/storyteq.ts     enige plek met de token (server-only)
            lib/dto.ts          vertaalt API-vorm naar UI-vorm
            lib/queries.ts      TanStack Query hooks (incl. polling)
```

## Conventies

- **Alle Storyteq-calls lopen via de route handlers.** De browser praat nooit
  rechtstreeks met Storyteq — niet voor templates, niet voor status, niet voor
  het downloaden van het resultaat.
- **De token leeft alleen in `lib/storyteq-transport.ts`.** Nooit `NEXT_PUBLIC_*`,
  nooit in een client component, nooit in een DTO.
- **Auth altijd redacten in logs.** `redactHeaders()` in `lib/discovery.ts`.
- **Discovery-log bijhouden.** Elk nieuw inzicht over een endpoint gaat naar
  `docs/api-discovery.md`; het log zelf (`docs/discovery/log.jsonl`) bevat alleen
  response-*vormen*, geen waardes.
- **Zod blijft loose.** De API mag velden toevoegen zonder dat de app breekt.
  Nieuwe aannames krijgen een test in `lib/schemas.test.ts` of `lib/dto.test.ts`.
- **UI-taal is Nederlands en jargonvrij.** "Template", "asset" en "genereren" zijn
  het maximum; geen statuscodes, geen veldnamen uit de API.

## Nooit

- Secrets committen (`.env.local` staat in .gitignore — ook nooit in history)
- Rauwe API-errors of stacktraces naar de UI lekken; alles via `AppError`
- Rauwe responses committen (`docs/discovery/raw/` is gitignored)
- Een dashboard-layout, sidebar of datatable toevoegen — de opdracht vraagt
  expliciet het tegenovergestelde
