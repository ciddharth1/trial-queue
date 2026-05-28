# syntax=docker/dockerfile:1.7
# ─── Queue Seva - Multi-stage Docker Build ─────────────

# Stage 1: Build dependencies (full install incl. dev for build & prisma generate)
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time DATABASE_URL — Prisma generate validates URL shape only.
ARG DATABASE_URL=postgresql://placeholder:placeholder@build-time-placeholder:5432/placeholder?schema=public
ENV DATABASE_URL=$DATABASE_URL

ARG JWT_SECRET
ENV JWT_SECRET=$JWT_SECRET

ARG NEXT_PUBLIC_SOCKET_URL=
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

RUN npx prisma generate
RUN npm run build

# Stage 3: Production-only dependencies (slimmer than the build stage).
# We need: prisma + @prisma/client + pg (start.sh probe) + socket.io + jsonwebtoken
# (custom server.js wrapper). The Next.js standalone bundle ships its own deps
# under .next/standalone/node_modules so we don't need next/react/etc here.
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

# Stage 4: Production runner
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget tini
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone Next.js server + static + public assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema + production node_modules (includes prisma CLI, @prisma/client,
# pg, socket.io, jsonwebtoken — all needed by start.sh and scripts/server.js).
COPY --from=builder /app/prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules

# Re-generate Prisma client into the prod node_modules so the engine binary matches
# the slim image. Cheap (no DB connection) and avoids subtle engine-version drift.
RUN npx prisma generate

# Custom server wrapper (Next.js standalone + embedded Socket.io)
COPY scripts/server.js /app/scripts/server.js

# Startup script
COPY docker/start.sh /app/start.sh
RUN chmod 755 /app/start.sh \
  && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# tini handles signal forwarding so the Next.js server shuts down cleanly.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
