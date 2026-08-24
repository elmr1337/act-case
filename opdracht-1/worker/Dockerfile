# syntax=docker/dockerfile:1
# Doel: bouwen en draaien zonder Go-toolchain op de host.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/enqueue ./cmd/enqueue

# Distroless static: geen shell, geen pakketten, wel CA-certificaten (nodig
# voor fal/Gemini/Anthropic over https). Statisch gecompileerd, geen cgo.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /work
COPY --from=build /out/worker /usr/local/bin/worker
COPY --from=build /out/enqueue /usr/local/bin/enqueue
ENTRYPOINT ["worker"]
CMD []
