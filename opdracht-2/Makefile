# Storyteq Template Builder — opdracht 2
#
# Twee smaken:
#   make dev            met Node lokaal
#   make docker-build && make docker-run    alleen Docker nodig

IMAGE ?= act-storyteq-builder
PORT  ?= 3000

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Dependencies installeren
	npm ci

.PHONY: dev
dev: ## Dev-server op http://localhost:3000
	npm run dev

.PHONY: build
build: ## Productie-build
	npm run build

.PHONY: lint
lint: ## ESLint
	npm run lint

.PHONY: test
test: ## Unit tests (zod-parsing van API-responses)
	npm test

.PHONY: explore
explore: ## Storyteq API verkennen (zie docs/api-discovery.md)
	npm run explore

.PHONY: docker-build
docker-build: ## Image bouwen
	docker build -t $(IMAGE) .

.PHONY: docker-run
docker-run: ## Image draaien met .env.local als runtime-env
	@test -f .env.local || { echo "Maak eerst .env.local (cp .env.example .env.local)"; exit 1; }
	docker run --rm -it \
		--env-file .env.local \
		-v $(IMAGE)-data:/data \
		-p $(PORT):3000 \
		--name $(IMAGE) \
		$(IMAGE)

# Het volume is er altijd; of hij gebruikt wordt hangt af van JOBS_DB in
# .env.local. Zonder die variabele blijft de joblijst browser-only.

.PHONY: docker-health
docker-health: ## Healthcheck van de draaiende container
	curl -fsS http://localhost:$(PORT)/api/health && echo
