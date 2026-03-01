# FIT23Hub Backend

## Setup

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   - `npm install`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Configure PostgreSQL connection in `.env` (`DATABASE_URL`, `DIRECT_URL`).
5. Generate Prisma client:
   - `npm run prisma:generate`
6. Push schema to database:
   - `npm run prisma:push`
7. Start API:
   - `npm run dev`

Backend runs on `http://localhost:4000` by default.

Optional: set `HF_API_KEY` to enable real LLM responses in `/api/ai/query`.

## Production and 400+ Concurrent Users

1. Use PostgreSQL in production (Supabase is supported).
2. Add a connection pooler (PgBouncer/managed pooler) and keep Prisma connection limits conservative.
3. Run multiple backend instances behind a reverse proxy/load balancer.
4. Set `TRUST_PROXY=1` so rate limiting and IP handling work correctly behind proxy.
5. Keep static uploads on object storage/CDN (S3/R2/Cloudflare) instead of local disk.
6. Run Prisma migrations and verify DB indexes are applied.

### Suggested Production Baseline

- `NODE_ENV=production`
- `TRUST_PROXY=1`
- `AUTH_RATE_LIMIT_MAX=80`
- `API_RATE_LIMIT_MAX=600`
- Use `npm start` with a process manager (PM2/systemd/container orchestrator)

## Supabase Storage Setup

1. In Supabase Storage, create a bucket named `fit23hub-assets` (or choose your own).
2. Set bucket visibility:
   - Public for simple URL playback in app.
3. Add backend environment variables:
   - `STORAGE_DRIVER=supabase`
   - `SUPABASE_URL=https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
   - `SUPABASE_STORAGE_BUCKET=fit23hub-assets`

When `STORAGE_DRIVER=local`, files are stored in local `/uploads` (development mode).

## 2-Instance Backend Behind Load Balancer

Local reference deployment files:
- `deploy/backend.Dockerfile`
- `deploy/docker-compose.scale.yml`
- `deploy/nginx-backend-lb.conf`

Run:
- `docker compose -f deploy/docker-compose.scale.yml up --build -d`

Backend load balancer will be exposed on `http://localhost:4000`.

## Frontend API URL (Production)

Set in `frontend/.env.local` or hosting env:
- `NEXT_PUBLIC_API_URL=https://<your-backend-domain>/api`

## Render + Vercel Deployment

### Backend on Render

1. Push repo to GitHub.
2. In Render, create a new Blueprint using `render.yaml` (recommended) or a Web Service with:
   - Root directory: `backend`
   - Build command: `npm install && npm run prisma:generate`
   - Start command: `npm run start:render`
3. Set env vars in Render:
   - `DATABASE_URL` (Supabase transaction pooler)
   - `DIRECT_URL` (Supabase direct)
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `CORS_ORIGIN=https://<your-vercel-domain>`
   - `HF_API_KEY` (optional)
   - `HF_MODEL` (optional)
   - `STORAGE_DRIVER=supabase`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=fit23hub-assets`
4. Deploy and verify:
   - `https://<render-backend-domain>/api/health`

### Frontend on Vercel

1. Import the same repo in Vercel, with root set to `frontend`.
2. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://<render-backend-domain>/api`
3. Deploy and verify login + dashboard data fetching.

## Load Test (400 Concurrent)

### k6

Required env vars:
- `BASE_URL`
- `LOADTEST_EMAIL`
- `LOADTEST_PASSWORD`

Run:
- `npm run loadtest:k6`

### Artillery

Run:
- `npm run loadtest:artillery`

Tune after test results:
1. `API_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX`
2. backend CPU/RAM instance size
3. p95/p99 latency and DB connection saturation

## Core APIs

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET|POST|PUT|DELETE /api/materials`
- `GET|POST|PUT|DELETE /api/recordings`
- `GET|POST|PUT|PATCH|DELETE /api/live`
- `GET /api/admin/overview`
- `GET|PATCH /api/admin/users`
- `POST /api/ai/query`

Use `Authorization: Bearer <token>` for protected routes.
