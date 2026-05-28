# QueueSeva — Smart Queue Management SaaS

Real-time queue + token management for service centers. Single Next.js process
with Postgres + an embedded Socket.io server. Production deployment on Railway.

**Live**: https://trial-queue-production.up.railway.app

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, Framer Motion, Zustand |
| Backend | Next.js API routes |
| Database | PostgreSQL via Prisma 6 |
| Auth | JWT access + refresh tokens (bcryptjs) + Google Sign-In (Google Identity Services) |
| Realtime | Socket.io embedded into the Next.js process (`scripts/server.js`) |
| Deployment | Railway (Nixpacks auto-detect, single service per process) |

## Architecture

One Node process. The custom server `scripts/server.js`:

1. Loads the Next.js standalone bundle and lets it call `http.createServer(...).listen(PORT)`
2. Hooks `http.createServer` so it captures the Next.js HTTP server instance
3. Attaches Socket.io to that same instance on path `/socket.io/`
4. Adds a `/broadcast` HTTP endpoint (auth-gated by `SOCKET_BROADCAST_SECRET`)
   that Next.js API routes use to push realtime events to all connected clients

This is intentional: Railway deploys a single service per repo, so a separate
`mini-services/socket-service` would never run in production. The folder still
exists in the repo (kept for local dev with Docker Compose) but Railway uses
the embedded server.

## Quick start (local development)

Requires Node.js 20+ (22 recommended) and Docker (for Postgres).

```powershell
# 1. Install deps
npm install

# 2. Start Postgres locally
docker run -d --name queueseva-pg `
  -e POSTGRES_USER=queueseva -e POSTGRES_PASSWORD=queueseva `
  -e POSTGRES_DB=queueseva -p 5432:5432 postgres:16-alpine

# 3. Configure env
cp .env.example .env
# Edit .env. Minimum required:
#   DATABASE_URL=postgresql://queueseva:queueseva@localhost:5432/queueseva?schema=public
#   JWT_SECRET=<run: openssl rand -base64 32>
#   SOCKET_BROADCAST_SECRET=<run: openssl rand -base64 32>
#   CORS_ORIGINS=*
#   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your Google OAuth client id, optional>

# 4. Apply schema + seed (optional)
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts          # idempotent demo data — admin@demo.com / password

# 5. Run dev
npm run dev                      # Next.js dev server on :3000 (HMR, separate process)
# OR run the production-shaped server (Next + embedded Socket.io on one port):
npm run build
npm run start                    # http://localhost:3000
```

App: http://localhost:3000  
API health: http://localhost:3000/api  
Socket health: http://localhost:3000/socket-health (only when running `npm run start`)

## Production deployment (Railway)

Already deployed. Railway uses Nixpacks auto-detection:

1. Builds with `npm install && npm run build`
2. Runs with `npm run start` → `cross-env NODE_ENV=production node scripts/server.js`

**Production admin credential**:
```
Email:    admin@queueseva.com
Password: AdminQS!2026Secure
Role:     SUPER_ADMIN
```

To redeploy: just `git push origin main`. Railway picks up the push, runs the
build, and switches traffic to the new container in 2–4 minutes. There's no
manual deploy step.

To check that a Railway redeploy is live, hit the API in two places:

```bash
curl https://trial-queue-production.up.railway.app/api          # Next.js
curl https://trial-queue-production.up.railway.app/socket-health # embedded Socket.io
```

Both should return `200`.

## Required environment variables

These are configured in Railway's project settings (or in `.env` for local dev).

| Variable | Required | Where used | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | runtime | Postgres connection string. Railway provides this from the linked Postgres service |
| `JWT_SECRET` | yes | runtime + build | Min 32 chars in production. App refuses known insecure defaults at boot |
| `SOCKET_BROADCAST_SECRET` | yes (prod) | runtime | Independent secret used by Next.js API routes to authenticate to the embedded `/broadcast` endpoint. Generate separately from `JWT_SECRET` |
| `CORS_ORIGINS` | yes (prod) | runtime | Comma-separated list of allowed Socket.io origins. Use specific domains, not `*` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional | build time | Embeds the Google OAuth client ID into the client bundle so the Google Sign-In button renders |
| `GOOGLE_CLIENT_ID` | optional | runtime | Server-side audience for ID-token verification. If unset, falls back to `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `SOCKET_SERVICE_URL` | optional | runtime | Defaults to `http://127.0.0.1:${PORT}` (same process). Override only if running the legacy separate socket service |
| `NEXT_PUBLIC_SOCKET_URL` | optional | build time | Override only if Socket.io lives on a different domain |
| `TOKEN_TTL_HOURS` | optional | runtime | QR token validity. Defaults to `12` |

`.env`, `.env.local`, `.env.production` are all gitignored. Only `.env.example`
and `.env.docker` are tracked, and they contain no real secrets.

## Google Sign-In

Already wired. The Client ID configured in production:

```
362595755708-l35p72iuca4nm8jmsklgfkhgpbt8urgi.apps.googleusercontent.com
```

In Google Cloud Console (https://console.cloud.google.com/apis/credentials),
make sure your origins are in **Authorized JavaScript origins**:

```
http://localhost:3000
https://trial-queue-production.up.railway.app
```

No redirect URIs needed — we use the Google Identity Services popup flow.

## API reference

All admin routes return `403` for non-admin tokens, `401` for unauthenticated
requests.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Email + password registration. Role is forced to `USER` |
| POST | `/api/auth/login` | — | Returns `{accessToken, refreshToken, user}` |
| POST | `/api/auth/google` | — | Google ID-token sign-in. Auto-creates user with `USER` role on first login |
| POST | `/api/auth/refresh` | refresh JWT | Issue a new access token. Refuses access tokens (typ-claim guard) |
| GET | `/api/auth/me` | user | Current user profile |
| GET | `/api/queue` | — | List queues (paginated) |
| POST | `/api/queue` | admin | Create queue |
| GET | `/api/queue/:id` | — | Queue detail |
| PATCH | `/api/queue/:id` | admin | Update status / capacity / etc |
| DELETE | `/api/queue/:id` | admin | Close (cancels active tokens) or delete (if empty) |
| POST | `/api/queue/join` | user | Join queue, generate token + signed QR payload |
| POST | `/api/queue/leave` | user | Leave queue |
| GET | `/api/token` | user (own) / admin (all) | List tokens |
| GET | `/api/token/:id` | user (own) / admin | Token detail; owner gets a fresh signed `qrPayload` for QR rendering |
| PATCH | `/api/token/:id` | admin | Call / serve / complete / cancel a token |
| POST | `/api/token/validate` | admin | Validate a scanned QR. Single-use, signature-checked, expiry-checked |
| GET | `/api/admin` | admin | Dashboard stats |
| GET | `/api/admin/analytics` | admin | Period analytics (`?days=N` or `?dateRange=7d`) |
| GET | `/api/notification` | user | Own notifications |
| PATCH | `/api/notification` | user | Mark read |
| GET | `/api/service-center` | — | Public list (no PII) |
| POST | `/api/service-center` | admin | Create service center |

### Socket.io events

Clients connect to `/socket.io/` on the same origin with a JWT in
`auth.token`. All events use `colon:case`:

| Event | Direction | Payload |
|---|---|---|
| `connection:ack` | server → client | `{status, socketId, serverTime}` |
| `queue:updated` | server → client | `{queueId, updateType, organizationId}` |
| `queue:member_joined` / `queue:member_left` | server → client | `{queueId, userId, memberCount}` |
| `token:created` | server → client | `{queueId, tokenId, tokenNumber, userId, position, estimatedWaitMinutes}` |
| `token:called` / `token:serving` / `token:completed` | server → client | `{queueId, tokenId, tokenNumber, counterId, counterName, userId}` |
| `token:expired` | server → client | `{queueId, tokenId, tokenNumber, reason}` |

The client manager (`src/lib/socket.ts`) auto-reconnects with exponential backoff
(infinite attempts, 1s → 5s) and a 30-second polling fallback when disconnected.

## Auth model

- **JWT pair**: 24h access token, 30d refresh token, both signed with `JWT_SECRET` (HMAC-SHA256). A `typ` claim discriminates them so a leaked access token can't be used to refresh and vice versa.
- **Roles**: `USER`, `ADMIN`, `SUPER_ADMIN`. Stored in the `User.role` Postgres column. Schema default is `USER`. The register / login routes do not accept a role from the request body — the only ways to elevate are the `scripts/ensure-admin.mjs` script (server-side, requires DB credential) or a direct SQL update.
- **Per-route enforcement**: Every admin API route calls `requireAdmin()` first. The check verifies the JWT signature, checks expiry, looks up the user in Postgres (so deactivated users can't keep using a still-valid token), and rejects unless `role IN (ADMIN, SUPER_ADMIN)`.
- **Admin inactivity timeout**: Admin sessions auto-logout after 30 minutes of inactivity (mouse / keyboard / touch / scroll all count as activity, throttled to 1Hz). A 60-second warning toast lets admins click "Stay signed in" to extend. Regular users are unaffected.
- **Single-use signed QR**: Every join generates a per-token random salt; the QR payload is HMAC-signed over `tokenId | exp | nonce | qrSecret`. Validation atomically marks `consumedAt` so two simultaneous scans can't both succeed.
- **Audit trail**: Every admin write hits `AdminLog` (action, entity, entity id, JSON details, timestamp). Includes successful AND failed QR validation attempts (`QR_VALIDATE_OK` / `QR_VALIDATE_FAIL`).

## Verification

A full end-to-end smoke test exercises 30 paths through auth + queue + admin:

```powershell
# Start the production-shaped server
npm run build
npm run start                  # http://localhost:3000

# In a second terminal
node scripts/smoke-test.mjs
```

Expect **30 / 30 passing**. Covers register, login, Google route validation,
refresh token type guard, role enforcement on admin endpoints, race-safe queue
join, public PII non-leakage, etc.

## Useful scripts

| Script | What it does |
|---|---|
| `scripts/server.js` | Custom production server (Next.js + embedded Socket.io). Used by `npm run start` |
| `scripts/post-build.mjs` | Cross-platform replacement for `cp -r` after `next build` (Windows-friendly) |
| `scripts/smoke-test.mjs` | 30-check end-to-end test against a running server |
| `scripts/verify-qr-token.mjs` | 11 cryptographic invariants for the signed QR system. Pure offline (no DB) |
| `scripts/verify-schema.mjs` | Confirms Prisma migrations applied and existing data is intact |
| `scripts/ensure-admin.mjs <email> <password>` | Idempotently create or promote an admin user |
| `scripts/promote-admin.mjs <email>` | Promote an existing user to `SUPER_ADMIN` |
| `scripts/seed-demo-queues.mjs <adminEmail>` | Create 5 demo queues + 3 counters under a service center |
| `scripts/seed-analytics.mjs [days]` | Seed realistic analytics rows for all queues |

Run any of them with `node scripts/<name>.mjs ...`. For Railway-targeted DB
operations, use `railway run node scripts/<name>.mjs ...` after `railway link`.

## Deploying without Railway

Possible. You need:

1. A Postgres host (Neon, Supabase, RDS, self-hosted)
2. Node.js 20+ on the host (22 recommended)
3. Build artifacts shipped to `/srv/queueseva` (or wherever):
   ```
   .next/standalone/      # entire folder
   .next/static/          # already copied into standalone by post-build
   public/                # already copied into standalone by post-build
   prisma/                # schema + seed
   scripts/               # server.js + helpers
   node_modules/          # production install (pg, prisma, socket.io, jsonwebtoken — all needed at runtime)
   package.json
   package-lock.json
   ```
4. A process manager (systemd, pm2) starting `node scripts/server.js` with
   the env vars above. The optional `Caddyfile` and `Dockerfile` in the repo
   are leftovers from an earlier two-service setup — they still work but
   aren't required.

## Tradeoffs and risks

| Risk | Severity | Note |
|---|---|---|
| Tokens stored in `localStorage` | Medium | Adequate for SaaS-style auth. Switch to httpOnly cookies if you need higher trust |
| `mini-services/socket-service` is dead code in production | Low | Folder still exists for the legacy two-service Docker Compose path. Safe to delete if you commit to the embedded server permanently |
| Some screens use hardcoded `slate-*` colors not driven by design tokens | Low | A CSS override layer in `globals.css` maps the common ones to theme tokens, so light mode mostly works. Specific screens may still look dark in light mode |
| Vercel deployment | High | Vercel's serverless functions can't run a long-lived embedded Socket.io server. Use Railway, Fly.io, Render, or any platform that runs a long-lived Node process |

## License

Private — all rights reserved.
