# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# bcrypt compila un addon nativo en el install; python3/make/g++ lo habilitan
# si npm no encuentra un binario prebuilt para esta imagen.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate --schema=src/prisma/schema.prisma
RUN npm run build

# Deja node_modules listo para producción sin volver a instalar
RUN npm prune --omit=dev

# ---- Runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/prisma ./src/prisma
COPY package.json ./

# Cloud Run inyecta PORT (por defecto 8080) y espera que el proceso escuche ahí.
EXPOSE 8080

USER node
CMD ["node", "dist/main"]
