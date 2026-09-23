# Deploying on Vercel

The web application runs on Vercel as-is. Two parts of the system cannot run there, and both have
a supported place to live instead.

| Component | Where it runs | Why |
| --- | --- | --- |
| Next.js web app, API routes, auth | **Vercel** | Standard Next.js 16 App Router deployment |
| BullMQ worker (`pnpm worker`) — planning, provider polling, FFmpeg renders | **A container host** (the existing VPS, Railway, Fly, Render) | Serverless functions are short lived and there is no FFmpeg binary in Vercel's runtime |
| Redis | **Upstash** (or any managed Redis) | Vercel has no Redis; the worker and the API rate limiter share it. Without a reachable Redis, costly operations are refused with 503 unless `RATE_LIMIT_MODE=lenient` |
| PostgreSQL | **Neon** | Already external |
| Media objects | **Cloudinary** (required) | Vercel's filesystem is read-only apart from `/tmp`, which does not survive an invocation |

## 1. Prerequisites

- A Neon `DATABASE_URL` (the pooled connection string).
- An Upstash Redis `rediss://` URL.
- Cloudinary credentials (cloud name, API key, API secret).
- The Agnes and Resend keys you already have.

## 2. Environment variables to set on Vercel

Copy these into Project → Settings → Environment Variables (Production and Preview):

```
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
BETTER_AUTH_SECRET=<at least 32 characters>
BETTER_AUTH_URL=https://<your-app>.vercel.app
NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app
RESEND_API_KEY=...
RESEND_FROM_EMAIL=Brio <no-reply@aigenstudio.app>
AGNES_API_KEY=...
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
AGNES_TEXT_MODEL=agnes-2.5-flash
AGNES_VIDEO_MODEL=agnes-video-2.5
VIDEO_GENERATION_CONCURRENCY=3
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=ai-video-studio
CLOUDINARY_DELIVERY_TYPE=private
CLOUDINARY_DIRECT_DELIVERY=true
```

Notes:

- `STORAGE_DRIVER=cloudinary` is mandatory: the build fails with an explicit message if the local
  driver is selected on Vercel, because uploaded and rendered media would silently disappear.
- `DATA_DIR` must stay **unset** on Vercel. The storage layer falls back to `/tmp/studio`, which is
  the only writable path, and uses it purely as a scratch area (FFmpeg working files, cache).
- `CLOUDINARY_DIRECT_DELIVERY=true` is recommended on Vercel: playback is answered with a 302 to a
  short-lived signed Cloudinary URL, so an 80 MB render is not streamed through a function. Leave it
  unset to keep the authenticated `/api/media/<id>` proxy, which needs to download the object into
  `/tmp` first on serverless.
- `BETTER_AUTH_URL` must match the deployment URL exactly, including for the magic-link callback.
  Add a custom domain and update both URL variables if you use one.

## 3. Deploy

Vercel detects pnpm from `pnpm-lock.yaml` and uses the Node version from `engines` (`>=22`).

Everything below runs non-interactively with a machine token. Create one at
Account Settings → Tokens, put it in `.env` as `VERCEL_TOKEN=...`, and the values are pushed
without ever being echoed:

```bash
pnpm dlx vercel@latest link --yes --project ai-video-studio
pnpm exec tsx scripts/vercel-env.ts --url https://<your-app>.vercel.app   # pushes every variable
pnpm exec tsx scripts/vercel-env.ts --url https://<your-app>.vercel.app --dry-run  # names only
pnpm dlx vercel@latest --prod
```

`scripts/vercel-env.ts` reads the values from `.env`, fills production defaults for the optional
settings, and fails with the list of anything it still needs:
`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`AGNES_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
It also warns when `REDIS_URL` is not a managed TLS endpoint (`rediss://`), because Vercel has to
reach Redis over the public internet — Upstash's free tier is the usual choice. A `localhost` URL is
skipped rather than pushed, since it cannot work from a serverless function.

Until that managed Redis exists, the deployment can still be used by setting `RATE_LIMIT_MODE=lenient`:
the rate limiter then logs `Rate limiting unavailable; allowing the request` and lets costly
operations through instead of answering 503. The default (`strict`) stays fail-closed, so the
protection against runaway provider spend is never dropped silently. Covered by
`tests/rate-limit.test.ts`.

Migrations are **not** run by the deployment. Apply them from a machine with the production
`DATABASE_URL`:

```bash
pnpm db:migrate
```

## 4. Run the worker on a container host

The repository already builds a Docker image that contains FFmpeg, the fonts captions need, the
worker and the migration entrypoint.

```bash
git clone git@github.com:mariechristsagbo/ai-video-studio.git /srv/ai-video-studio
cd /srv/ai-video-studio
cp .env.example .env && $EDITOR .env     # Neon, Cloudinary, Agnes, and a local Redis URL
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml ps       # worker healthy, redis healthy
docker compose -f docker-compose.worker.yml run --rm worker \
  ./node_modules/.bin/tsx src/db/migrate.ts          # apply migrations from here when needed
docker compose -f docker-compose.worker.yml logs -f worker | grep job_processed
```

`docker-compose.worker.yml` runs only the worker and Redis, forces `STORAGE_DRIVER=cloudinary`
(so the worker writes to the same place the serverless web app reads from), keeps a health check on
the Redis connection, and persists both the Redis data and the media cache in named volumes. Its
image is the same Dockerfile used for a fully self-hosted deployment, so
`docker compose up -d --build` with the main `docker-compose.yml` still runs web + worker + redis
together when Vercel is not in the picture.

## 5. What still works, and what does not

- Works on Vercel: dashboard, generation creation, storyboard editing, uploads, character bible,
  settings, magic-link auth, deletion, media delivery through signed URLs.
- Requires the worker: storyboard planning, Agnes shot submission and polling, and the FFmpeg
  render. Without a worker those jobs stay queued and the progress bar does not advance.
- Serverless alternative for the pipeline (not implemented): a guarded cron route that calls
  `reconcile()` on a schedule would let planning and polling advance on Vercel, but rendering needs
  the FFmpeg binary and minutes of CPU, so real renders would still have to happen on a container.
- Vercel Hobby caps a function at 60 seconds, which is why `maxDuration = 60` is set on the API
  routes. Uploads of up to 50 MB and proxy streaming fit inside it; renders never run in a function.

## 6. Verification after deploying

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<your-app>.vercel.app/sign-in   # 200
# sign in with a magic link, then check the storage row reads cloudinary/Ready
curl -s https://<your-app>.vercel.app/api/studio/settings -H "Cookie: <session>"
```

On the container host, `docker logs studio-worker` should show the BullMQ queues being registered.
