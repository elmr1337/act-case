@AGENTS.md

# CLAUDE.md — opdracht-2

## Context

ACT.agency praktijkcase, opdracht 2: een Next.js-app waarmee iemand zónder
technische achtergrond een asset genereert en downloadt via de Storyteq API —
één tegelijk of honderd via een CSV. Lineaire flow, geen dashboard. Het
oorspronkelijke werkplan staat in [../PLAN-2.md](../PLAN-2.md); batch, wachtrij
en de optionele Redis-laag zijn er later bij gekomen op verzoek van Elmar.

## Commando's

```
make dev            # dev-server op :3000
make build          # productie-build
make lint           # eslint
make test           # vitest — zod-parsing van API-responses
make explore        # Storyteq API verkennen (schrijft naar docs/discovery/)
make docker-build   # image bouwen
make docker-run     # image draaien met --env-file .env.local
make compose-up     # app + Redis (persistente joblijst)
```

Config via `opdracht-2/.env.local` (template: `.env.example`).

## Architectuur in het kort

```
browser ──► app/api/*  (route handlers = proxy)  ──► api.{region}.storyteq.com/v4
            lib/storyteq.ts     enige plek met de token (server-only)
            lib/dto.ts          vertaalt API-vorm naar UI-vorm
            lib/queries.ts      TanStack Query hooks (incl. polling)

jouw joblijst:  lib/jobs.ts (localStorage)  ─┬─► niets meer, standaard
                                             └─► /api/jobs ──► Redis, als REDIS_URL gezet is
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
  response-*vormen*, geen waardes. Het is append-only en groeit terwijl je de app
  gebruikt — niet met de hand bewerken; opnieuw opbouwen kan met
  `rm docs/discovery/log.jsonl && npm run explore`.
- **Zod blijft loose.** De API mag velden toevoegen zonder dat de app breekt.
  Nieuwe aannames krijgen een test in `lib/schemas.test.ts` of `lib/dto.test.ts`.
- **UI-taal is Nederlands en jargonvrij.** "Template", "asset" en "genereren" zijn
  het maximum; geen statuscodes, geen veldnamen uit de API (die zijn UUID's).
- **Local-first.** De joblijst werkt altijd zonder server-opslag; Redis is een
  optionele spiegel. Faalt de server, dan merkt de gebruiker dat niet.
- **Modus moet zichtbaar zijn, en één bediening hebben.** Enkel of batch
  verschilt alleen in de URL en de inhoud; daarom een expliciete `ModeToggle` in
  de balk plus een eigen kop op de batch-pagina. De topbar heeft er géén knop
  voor: twee ingangen naar dezelfde modus is verwarrender dan één.
- **Beloof geen tijden die we niet kunnen onderbouwen.** De verwachting in stap 3
  komt uit de eigen historie van de template (`lib/history.ts`), niet uit
  `processing_time` — dat veld telt de wachtrij niet mee.

## Nooit

- Secrets committen (`.env.local` staat in .gitignore — ook nooit in history)
- Rauwe API-errors of stacktraces naar de UI lekken; alles via `AppError`
- Rauwe responses committen (`docs/discovery/raw/` is gitignored)
- Een dashboard-layout, sidebar of datatable toevoegen — de opdracht vraagt
  expliciet het tegenovergestelde
