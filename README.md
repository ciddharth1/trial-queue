# QueueSeva — Smart Queue Management SaaS

Real-time queue + token management for service centers. Three services:
**Next.js 16** app, **PostgreSQL** database, **Socket.io** realtime microservice.
Production-ready Docker Compose included.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, Framer Motion, Zustand |
| Backend | Next.js API routes |
| Database | PostgreSQL via Prisma 6 |
| Auth | JWT access + refresh tokens (bcrypt) + Google Sign-In (Google Identity Services) |
| Realtime | Socket.io microservice (`mini-services/socket-service`) |
| Deployment | Docker Compose (app + postgres + socket-service) |

## Quick start (local development)

Requires Node.js 20+ and Docker (for the local Postgres).

```powershell
# 1. Install
npm install
cd mini-services\socket-service ; npm install ; cd ..\..

# 2. Start Postgres in a container
docker run -d --name queueseva-pg `
  -e POSTGRES_USER=queueseva -e POSTGRES_PASSWORD=queueseva `
  -e POSTGRES_DB=queueseva -p 5432:5432 postgres:16-alpine

# 3. Configure env (defaults already point at the container above)
cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID

# 4. Apply schema + seed demo data
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts   # optional, idempotent

# 5. Start the socket service (one terminal)
cd mini-services\socket-service
npm run dev:node

# 6. Start the Next.js app (second terminal)
npm run dev
```

App: http://localhost:3000 — Socket health: http://localhost:3003/health — API health: http://localhost:3000/api

### Demo accounts (seed data only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.com | password |
| User  | user@demo.com  | password |

These are NOT created on a production deployment unless you set `SEED_ON_BOOT=1` and `ALLOW_PRODUCTION_SEED=1` explicitly.

## Production deployment (Docker Compose)

The recommended path. Spins up Postgres + app + socket-service on an internal bridge network.

```bash
# 1. Generate secrets — both must be unique, 32+ chars
openssl rand -base64 32   # → JWT_SECRET
openssl rand -base64 32   # → SOCKET_BROADCAST_SECRET

# 2. Configure
cp .env.docker .env
nano .env
# Set every field:
#   POSTGRES_PASSWORD=<strong>
#   DATABASE_URL=postgresql://queueseva:<strong>@postgres:5432/queueseva?schema=public
#   JWT_SECRET=<from step 1>
#   SOCKET_BROADCAST_SECRET=<from step 1>
#   CORS_ORIGINS=https://your-domain.com
#   NEXT_PUBLIC_GOOGLE_CLIENT_ID=362595755708-l35p72iuca4nm8jmsklgfkhgpbt8urgi.apps.googleusercontent.com
#   GOOGLE_CLIENT_ID=362595755708-l35p72iuca4nm8jmsklgfkhgpbt8urgi.apps.googleusercontent.com

# 3. Build and run
docker compose build
docker compose up -d
docker compose logs -f
```

The compose file enforces every required secret via `${VAR:?...}` syntax — Compose refuses to start with placeholders.

### Reverse proxy

Use the included `Caddyfile` (port 81 by default) or any Nginx config that routes `/socket.io/*` to the socket service:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Keep the socket service `/broadcast` endpoint internal — it's auth-gated by `SOCKET_BROADCAST_SECRET` but should not be exposed publicly anyway.

## Required environment variables

| Variable | Required | Where set | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | runtime | Postgres connection string |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | yes (Docker) | runtime | Used by the postgres container; must align with `DATABASE_URL` |
| `JWT_SECRET` | yes | build + runtime | Min 32 chars in production. App refuses known insecure defaults |
| `SOCKET_BROADCAST_SECRET` | yes (prod) | runtime | Independent secret between app and socket service |
| `CORS_ORIGINS` | yes (prod) | runtime | Comma-separated socket service origin allowlist |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional | build time | Embeds the Google client ID into the client bundle |
| `GOOGLE_CLIENT_ID` | optional | runtime | Server-side audience for ID-token verification |
| `SOCKET_SERVICE_URL` | recommended | runtime | `http://socket-service:3003` (Docker DNS) |
| `NEXT_PUBLIC_SOCKET_URL` | optional | build time | Only set when the socket service lives on a different domain |

## Google Sign-In

Already wired. The Client ID baked into this build is:
`362595755708-l35p72iuca4nm8jmsklgfkhgpbt8urgi.apps.googleusercontent.com`

In Google Cloud Console (https://console.cloud.google.com/apis/credentials), make sure your production origin is in **Authorized JavaScript origins**. Examples:

```
http://localhost:3000
https://your-domain.com
```

No redirect URIs are needed — we use the GIS popup flow.

## API reference

See the auth + queue routes:

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Email + password registration |
| POST | `/api/auth/login` | — | Email + password login |
| POST | `/api/auth/google` | — | Google ID-token sign-in (auto-creates user) |
| POST | `/api/auth/refresh` | refresh | Issue a new access token |
| GET | `/api/auth/me` | user | Current user profile |
| GET / POST | `/api/queue` | — / admin | List queues / create queue |
| GET / PATCH / DELETE | `/api/queue/:id` | — / admin / admin | Queue detail / update / close |
| POST | `/api/queue/join` | user | Join queue, generate token |
| POST | `/api/queue/leave` | user | Leave queue |
| GET | `/api/token` | user (own) / admin (all) | List tokens |
| GET | `/api/token/:id` | user (own) / admin | Token detail |
| PATCH | `/api/token/:id` | admin | Call / serve / complete token |
| GET | `/api/admin` | admin | Dashboard stats |
| GET | `/api/admin/analytics` | admin | Period analytics |
| GET | `/api/notification` | user | Notifications |
| PATCH | `/api/notification` | user | Mark read |
| GET | `/api/service-center` | — | Public list (no PII) |
| POST | `/api/service-center` | admin | Create service center |

## Verification

Smoke test runs the entire auth + queue flow against a live server:

```powershell
# Start Next.js (or `docker compose up -d`)
node .next\standalone\server.js

# In another terminal
node scripts\smoke-test.mjs
```

Expect **30 / 30 passing**. CI runs lint, typecheck, build, and a Docker image smoke build on every push.

## Deploying without Docker

Possible but more setup. You need:

1. A Postgres host (Neon, Supabase, RDS, self-hosted)
2. Node.js 20+ on the host
3. Build artifacts shipped to `/srv/queueseva` (or wherever):
   ```
   .next/standalone/      ← entire folder
   prisma/                ← schema + seed
   db (none — Postgres handles persistence)
   mini-services/socket-service/dist/index.js
   mini-services/socket-service/node_modules/
   ```
4. A process manager (systemd, pm2) starting both services with the env vars above.

## Tradeoffs and risks

| Risk | Severity | Note |
|---|---|---|
| Tokens stored in localStorage | Medium | Adequate for SaaS-style auth. Switch to httpOnly cookies if you need higher trust |
| Unused dependencies (`next-auth`, `next-intl`, `react-query`, etc.) | Low | Bundle bloat. Many shadcn UI components import their underlying packages, so removing them blindly will break the UI |
| Vercel deployment requires the socket service to live on a separate host | High | Vercel can't run long-lived WebSocket servers. Host socket-service on Fly.io / Railway / a VPS, or swap to Pusher / Ably |

## License

Private — all rights reserved.
