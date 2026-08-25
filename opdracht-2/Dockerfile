# syntax=docker/dockerfile:1
#
# Doel: de beoordelaar draait deze app met alleen Docker en een .env.local —
# geen Node-toolchain nodig. Secrets komen er uitsluitend als runtime-env in
# (docker run --env-file), nooit als build arg: die zouden in de image-history
# belanden.

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
# Alleen de manifests, zodat deze laag gecached blijft zolang de deps niet wijzigen.
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# De build heeft geen Storyteq-key nodig: alle calls zijn runtime en server-side.
RUN npm run build

# ---------- runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `node` bestaat al in het base-image; niet als root draaien.
USER node

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
