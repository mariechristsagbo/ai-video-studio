# Deploying on Vercel

The web application runs on Vercel as-is. Two parts of the system cannot run there, and both have
a supported place to live instead.

| Component | Where it runs | Why |
| --- | --- | --- |
| Next.js web app, API routes, auth | **Vercel** | Standard Next.js 16 App Router deployment |
| BullMQ worker (`pnpm worker`) — planning, provider polling, FFmpeg renders | **A container host** (the existing VPS, Railway, Fly, Render) | Serverless functions are short lived and there is no FFmpeg binary in Vercel's runtime |
| Redis | **Upstash** (or any managed Redis) | Vercel has no Redis; the worker and the API rate limiter share it |
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
RESEND_FROM_EMAIL=AI Video Studio <studio@aigenstudio.app>
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

```bash
pnpm dlx vercel link      # or: vercel link
pnpm dlx vercel env pull  # optional, writes .env.local for local runs
pnpm dlx vercel --prod
```

Migrations are **not** run by the deployment. Apply them from a machine with the production
`DATABASE_URL`:

```bash
pnpm db:migrate
```

## 4. Run the worker on a container host

The repository already builds a Docker image that contains FFmpeg, the fonts captions need, the
worker and the migration entrypoint.

```bash
docker build -t ai-video-studio .
docker run -d --name studio-worker --restart unless-stopped \
  --env-file .env \
  -e DATABASE_URL=... -e REDIS_URL=rediss://... \
  -e STORAGE_DRIVER=cloudinary -e CLOUDINARY_CLOUD_NAME=... \
  -e CLOUDINARY_API_KEY=... -e CLOUDINARY_API_SECRET=... \
  -v studio-media:/app/data \
  ai-video-studio ./node_modules/.bin/tsx src/workers/main.ts
```

Docker Compose is only needed if you also want to run the web container; against Vercel you need the
worker (and its Redis) alone.

`docker compose up -d --build` still works for a self-hosted deployment of both parts.

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
