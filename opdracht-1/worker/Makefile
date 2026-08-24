GO    ?= go
BIN   := bin/worker
ENQ   := bin/enqueue
IMAGE := act-worker

.PHONY: build test vet fmt run analyze costs serve enqueue docker-build docker-run clean

build:
	$(GO) build -o $(BIN) ./cmd/worker
	$(GO) build -o $(ENQ) ./cmd/enqueue

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

fmt:
	gofmt -w .

# Run-targets draaien vanuit opdracht-1/ zodat ./data, ./outputs, analysis/
# en lut/ op hun plek gevonden worden (en .env + matrix.yaml daar leven).
run: build
	cd .. && worker/$(BIN) run matrix.yaml

analyze: build
	cd .. && worker/$(BIN) analyze

costs: build
	cd .. && worker/$(BIN) costs

serve: build
	cd .. && worker/$(BIN) serve

# make enqueue ARGS="-type generate -variant lora -lut -prompt '...' -prompt-id p1"
enqueue: build
	cd .. && worker/$(ENQ) $(ARGS)

docker-build:
	docker build -t $(IMAGE) .

# make docker-run ARGS="run matrix.yaml"
# Mount opdracht-1/ als /work; draait als jouw uid zodat outputs van jou zijn.
docker-run:
	docker run --rm \
		$(if $(wildcard ../.env),--env-file ../.env,) \
		--user $(shell id -u):$(shell id -g) \
		-v $(abspath ..):/work \
		$(IMAGE) $(ARGS)

clean:
	rm -rf bin
