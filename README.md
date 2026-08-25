# ACT.agency — praktijkcase

Gedeelde repo voor beide opdrachten van de ACT.agency praktijkcase.

| Opdracht | Wat | Status |
|---|---|---|
| [Opdracht 1 — Visuele stijlkloning](opdracht-1/) | Campagnestijl analyseren en reproduceren met drie generatiestrategieën (prompt-only, multi-reference, style-LoRA), elk met en zonder LUT-nabewerking. | in uitvoering |
| [Opdracht 2 — Storyteq Template Builder](opdracht-2/) | Next.js-app waarmee iemand zonder technische achtergrond in vier stappen een asset genereert en downloadt via de Storyteq API: kiezen, invullen, wachten, downloaden. | in uitvoering |

Opdracht 1 bevat een standalone Go-worker (queue + storage + providers + LUT-engine) die de hele generatiematrix draait; zie de [README van opdracht 1](opdracht-1/README.md) voor aanpak, toolkeuze en quickstart.

Opdracht 2 is een Next.js-app met een proxy-architectuur (de Storyteq-key blijft server-side) en een lineaire vier-stappen-flow in plaats van een dashboard; zie de [README van opdracht 2](opdracht-2/README.md) en [wat we over de API ontdekten](opdracht-2/docs/api-discovery.md).

Beide opdrachten zijn plan-eerst gebouwd met Claude Code: stack, architectuur en wat bewust *niet* gebouwd wordt, vastgesteld voordat er een regel code stond. Daar zijn we open over; per opdracht staat in de README wat AI deed en wat een mens besloot.
