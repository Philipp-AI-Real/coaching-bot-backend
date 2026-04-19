# syntax=docker/dockerfile:1.7

# ───────────────────────────────────────────────────────────────
# Stage 1: deps — install ALL dependencies + generate Prisma client.
# node_modules from this stage ships to production as-is.
# ───────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

# openssl is required by the Prisma query engine on Debian slim.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm install
# prisma generate runs via postinstall on Prisma 5+, but run explicitly so
# the Linux engine is present in node_modules/.prisma before it is copied
# to the production image.
RUN npx prisma generate


# ───────────────────────────────────────────────────────────────
# Stage 2: build — compile TypeScript to dist/
# ───────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY src ./src

RUN npx nest build


# ───────────────────────────────────────────────────────────────
# Stage 3: production — minimal runtime, non-root user
# IMPORTANT: node_modules comes straight from the deps stage. Do NOT
# run `npm ci --omit=dev` here — it drops Prisma engines on some setups.
# ───────────────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist

# Uploaded files land in /app/storage; the compose file mounts a
# named volume here so files survive container rebuilds.
RUN mkdir -p /app/storage && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
