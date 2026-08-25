# PLAN — ACT.agency Praktijkcase, Opdracht 2: Storyteq Template Builder (Next.js)

> Dit plan is geschreven voor Claude Code. Werk het fase voor fase af.
> Stop bij elke `🧑 HUMAN` checkpoint en wacht op input van Elmar.
> Deze opdracht leeft in `opdracht-2/` van de gedeelde act-case repo (zie root README).

---

## 0. Goal & context

ACT.agency gebruikt Storyteq voor geautomatiseerde contentproductie. De API (developer.storyteq.com) is **niet volledig gedocumenteerd** — verkennen via network inspection, polling en trial & error hoort bij de opdracht, en documenteren wat je ontdekt is een deliverable.

Beoordeling:
1. **UX-kwaliteit** — is de interface echt "stupid simple" en modern?
2. **Werkende implementatie** (ook als niet alles 100% af is)
3. **Omgang met incomplete documentatie**
4. **Transparantie over aanpak en toolgebruik**

Harde deliverables:
- Werkende Next.js app: templates tonen → asset aanmaken (velden invullen) → status pollen met duidelijke feedback → resultaat bekijken + one-click download
- GitHub-repo met volledige code
- Screenshots van de interface
- Korte README: aanpak, toolkeuze, wat beter kan met meer tijd

**Doel-ervaring:** iemand zonder technische achtergrond heeft binnen één minuut een asset gegenereerd en gedownload.

---

## 1. Stack (besloten — niet heroverwegen tijdens het bouwen)

| Keuze | Wat | Waarom (→ README) |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Gevraagd in de opdracht |
| Styling | Tailwind v4 | Standaard, snel |
| Components | shadcn/ui **primitives only** — button, input, select, card, progress, skeleton, sonner (toasts) | Eigen theme erop; GEEN sidebar/dashboard blocks — de opdracht zegt letterlijk "geen technisch dashboard" |
| Server state | TanStack Query v5 | Templates, mutations, polling — alles is server state; `refetchInterval` als functie van status voor het pollen |
| Client state | React state + URL params | Er ís bijna geen client state (wizard-stap, formvelden). Geen Zustand — "waarom geen state manager" is een bewuste keuze, benoem in README |
| API-toegang | Next.js Route Handlers als **proxy** naar Storyteq | Key blijft server-side; proxy logt alle traffic → discovery docs |
| Validatie | zod op de route handlers + form | Onbekende API = onbetrouwbare responses; parse safely |
| Deploy/run | Docker, multi-stage op Next.js `output: 'standalone'` | Beoordelaar draait 'm zonder Node toolchain; zie §7 |

**Vorm van de app: lineaire flow, geen dashboard.** Denk bestel-flow/Typeform, niet admin panel:

```
[1. Kies template]  →  [2. Vul in]  →  [3. Genereren…]  →  [4. Klaar → Download]
```

Eén route met stappen of routes per stap (`/`, `/create/[templateId]`, `/asset/[jobId]`) — jobId in de URL zodat refresh/deep-link werkt en de status-pagina deelbaar is.

---

## 2. Secrets — EERST lezen

- `STORYTEQ_COMPANY_ID`, `STORYTEQ_REGION`, `STORYTEQ_API_KEY` gaan in `opdracht-2/.env.local` (gitignored). `.env.example` met lege waarden.
- De key is een **persoonlijke token** van een ACT-medewerker: NOOIT in client code, NOOIT in commits, NOOIT in logs die gecommit worden (discovery log: redact auth headers).
- Alle Storyteq calls lopen via route handlers (`app/api/storyteq/...`). De browser praat alleen met onze eigen API.

---

## 3. Fase 1 — API discovery (vóór de UI)

De API is deels ongedocumenteerd; dit is een beoordeeld onderdeel. Werkwijze:

- [ ] Lees wat er wél is op developer.storyteq.com (fetch de docs-pagina's, noteer bekende endpoints)
- [ ] Bouw eerst een dunne Storyteq client (`lib/storyteq.ts`) + een `scripts/explore.ts` om endpoints handmatig af te tasten (auth-vorm, base URL per region, templates endpoint, create endpoint, status endpoint, asset/download endpoint)
- [ ] **Discovery logger in de proxy**: elke request/response (method, path, status, timings, response shape — auth geredact) → `docs/discovery/log.jsonl`
- [ ] Genereer daaruit `docs/api-discovery.md`: per endpoint wat we weten, response-voorbeelden, verrassingen, wat onduidelijk blijft. Dit document groeit tijdens het hele project mee.
- [ ] Leid zod-schemas af uit echte responses, niet uit aannames
- 🧑 HUMAN checkpoint: als auth of endpoints niet te kraken zijn via trial & error → Elmar checkt de demo-omgeving in de browser met network inspection en deelt de gevonden calls

---

## 4. Fase 2 — Proxy + data-laag

- [ ] Route handlers: `GET /api/templates`, `POST /api/assets`, `GET /api/assets/[id]` (status), `GET /api/assets/[id]/download`
- [ ] Download: proxy'en met `Content-Disposition: attachment` zodat de download écht one-click is (geen nieuwe tab met een player)
- [ ] Fouten van Storyteq vertalen naar nette eigen error shapes — de UI toont nooit rauwe API-output (staat letterlijk in de opdracht)
- [ ] TanStack Query hooks: `useTemplates()`, `useCreateAsset()`, `useAssetStatus(id)` met conditionele `refetchInterval` (bijv. 2s zolang pending/processing, stop bij done/failed), en `useMutation` met optimistic transition naar de status-stap

---

## 5. Fase 3 — De flow (UI)

**Stap 1 — Templates.** Grid van cards met preview (als de API thumbnails geeft — anders nette fallback met template-naam en type). Skeletons tijdens laden. Eén klik → stap 2.

**Stap 2 — Invullen.** Formulier gegenereerd uit de template-velden die de API teruggeeft (text, image-url, kleur, etc. — afhankelijk van wat discovery oplevert). Alleen de velden die de eindgebruiker móet invullen; alles wat technisch is krijgt een default of blijft weg. Duidelijke labels in gewone taal. Eén grote "Genereer" knop.

**Stap 3 — Genereren.** Geen spinner-in-het-niets: een status-scherm met voortgang (progress of duidelijke fasen: "In de wachtrij → Wordt gemaakt → Bijna klaar"), vriendelijke copy, en de verwachting dat het even kan duren. Poll via `useAssetStatus`. Bij falen: menselijke foutmelding + retry-knop, geen stacktrace.

**Stap 4 — Klaar.** Asset direct zichtbaar (video player of image), grote download-knop, en "Nog een maken" terug naar stap 1.

**Designregels:**
- Eigen theme op shadcn: eigen typografie (geen default Inter-op-alles), bewust kleurgebruik, ruim wit
- Mobile werkt gewoon (de flow is lineair, dus dat is haast gratis)
- Micro-feedback overal: hover states, disabled states met reden, toasts voor achtergrond-acties
- Geen technisch jargon in de UI — "template", "asset", "genereren" is al het maximum
- 🧑 HUMAN checkpoint: design review door Elmar vóór het polish-werk — vorm en toon zijn van hem

---

## 6. Fase 4 — Polish + oplevering

- [ ] Loading/empty/error states voor élke stap (dit is waar "stupid simple" wint of verliest)
- [ ] Screenshots maken van alle vier de stappen (+ mobile) → `docs/screenshots/`
- [ ] `docs/api-discovery.md` finaliseren
- [ ] README schrijven (zie §8)
- [ ] `.env.example` compleet, repo-check op secrets (ook in history)
- [ ] 🧑 HUMAN checkpoint: Elmar draait de minute-test — verse browser, stopwatch, van landing tot gedownloade asset binnen 60 seconden. Niet gehaald = terug naar §5.

---

## 7. Docker & Next.js config

Doel: `make docker-build && make docker-run` op een schone machine met alleen Docker + `.env.local` — geen Node toolchain nodig.

**next.config.ts:**
- `output: 'standalone'` — verplicht voor de slanke Docker runtime
- `images.remotePatterns` voor de Storyteq asset/thumbnail domains (invullen zodra discovery de domains kent)
- Verder minimaal houden; geen experimentele flags zonder reden

**Dockerfile (multi-stage):**
1. `deps` — `node:22-alpine`, `npm ci` (lockfile verplicht in de repo)
2. `build` — `npm run build` (env NIET nodig tijdens build: alle secrets zijn runtime server-side; zet dummy-waarden alleen als de build erover valt)
3. `runner` — `node:22-alpine`, non-root (`USER node`), kopieer `.next/standalone` + `.next/static` + `public`, `EXPOSE 3000`, `CMD ["node", "server.js"]`

**Regels:**
- Secrets alleen als **runtime env** (`docker run --env-file .env.local`) — nooit build args, nooit `NEXT_PUBLIC_*` (dat zou de Storyteq key naar de client lekken)
- `.dockerignore`: `node_modules`, `.next`, `.env*`, `docs/screenshots`
- Makefile: `make dev`, `make docker-build`, `make docker-run` (met `--env-file .env.local -p 3000:3000`)
- Healthcheck route (`GET /api/health`) zodat `docker ps` iets zinnigs zegt — klein, maar netjes

---

## 8. Wat bewust NIET

- Geen database, geen auth, geen user accounts — de opdracht vraagt er niet om
- Geen Zustand/Redux — er is geen client state die het rechtvaardigt
- Geen dashboard-layout, sidebar, of datatables
- Geen Storybook, geen e2e-suite — wel een paar unit tests op de zod-parsing van API-responses (daar zit het echte risico)
- Geen streaming/websockets — polling is gevraagd en volstaat

---

## 9. README (opdracht-2/README.md)

- Aanpak in 5 regels: discovery-first, proxy-architectuur, lineaire flow
- Toolkeuzes mét onderbouwing: shadcn primitives zonder blocks (waarom), TanStack Query i.p.v. state manager (waarom), proxy voor key-veiligheid én discovery logging
- Hoe de API verkend is → link naar `docs/api-discovery.md`, incl. waar we tegenaan liepen
- Transparantie: gebouwd met Claude Code, werkwijze in het kort (plan-first, welke delen AI, welke keuzes menselijk)
- Quickstart, twee smaken: dev (`cp .env.example .env.local` → keys → `npm i && npm run dev`) en Docker (`make docker-build && make docker-run` — geen Node nodig)
- Wat beter kan met meer tijd: bijv. template previews renderen, batch-generatie, presets per merk, i18n

---

## 10. CLAUDE.md (in opdracht-2/)

- Context in 3 regels + verwijzing naar dit PLAN
- Commando's: dev, build, lint, test
- Conventies: alle Storyteq calls via de proxy, nooit direct vanuit de client; auth altijd redacten in logs; discovery-log bijhouden bij elk nieuw endpoint-inzicht
- Nooit: secrets committen, rauwe API-errors naar de UI lekken

---

## 11. Definition of done

- [ ] Verse clone + `.env.local` + `npm run dev` werkt direct
- [ ] `make docker-build && make docker-run` werkt op een schone machine met alleen Docker + `.env.local` — geen Node toolchain
- [ ] De minute-test haalt het: template → asset gedownload < 60s, zonder uitleg vooraf
- [ ] Alle vier de opdracht-punten aantoonbaar werkend (templates, aanmaken, pollen, downloaden)
- [ ] `docs/api-discovery.md` gevuld met echte bevindingen
- [ ] Screenshots in de repo, README af, geen secrets in history