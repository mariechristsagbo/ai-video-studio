# Verification report

Everything below was executed on this machine against the real repository, a real Neon PostgreSQL database, a real Redis instance, real BullMQ workers and real FFmpeg. Fake providers are used only where real Agnes video generation was unavailable, and every fixture is labelled as such.

## Environment

| Item | Value |
| --- | --- |
| Repository | `https://github.com/mariechristsagbo/ai-video-studio` (private) |
| Node.js | v26.8.2 |
| pnpm | 12.6.0 (pinned via `packageManager`) |
| Next.js | 16.3.6 (pinned exact; first stable of the current line) |
| FFmpeg | 6.1.1 (host) |
| Database | Neon PostgreSQL, real connection string from `.env` (never committed) |
| Redis | Isolated `redis:7-alpine` container on `127.0.0.1:6397` |
| Data directory | `data/` (git-ignored), `DATA_DIR` in `.env` |

## Reproducible commands and their results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | pass — 457+ packages, lockfile unchanged |
| `pnpm lint` | pass — 0 errors, 0 warnings |
| `pnpm typecheck` | pass — `tsc --noEmit`, 0 errors |
| `pnpm test` | pass — 4 files, 15 tests |
| `pnpm build` | pass — Next.js production build, all routes compiled |
| `pnpm db:generate` | pass — `drizzle/0000_graceful_sentinel.sql` committed |
| `pnpm db:migrate` | pass — applied to the real Neon database (verified empty schema first) |
| `scripts/preflight.ts` | pass — database connected, Resend reachable (`domains` API 200) |
| `scripts/auth-smoke.ts` | pass — official Better Auth magic link, single-use, session verified |
| `scripts/render-smoke.ts` | pass — real multi-shot FFmpeg render, 1080×1920 H.264 + AAC, 11.6 s |
| `scripts/workflow-smoke.ts` | pass — full database-backed BullMQ workflow (details below) |
| `docker build -t ai-video-studio:local .` | pass — production image with FFmpeg |
| `docker compose up -d` | pass — web healthy, worker running, Redis healthy |
| `docker compose exec web pnpm db:migrate` | pass — migrations run inside the container against Neon |
| Container FFmpeg render (`scripts/render-smoke.ts` in `web`) | pass — 1080×1920 H.264 + AAC, 11.6 s, built by the image's FFmpeg 5.1 |
| `scripts/live-agnes.ts` | **partial** — text model verified live; video blocked by account quota |

## Acceptance matrix

| # | Acceptance criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Repository exists, private, code pushed | pass | `git remote -v`, `gh repo view --json isPrivate` |
| 2 | Application builds | pass | `pnpm build` |
| 3 | Authentication works (magic link only, no password/OAuth) | pass (test mail boundary) | `scripts/auth-smoke.ts`: link issued, verified, session authenticated, link single-use, `emailVerified: true` |
| 4 | Database migrations work | pass | `pnpm db:migrate` against Neon |
| 5 | Dashboard works | pass | `/dashboard` route + overview API; real counts from Neon |
| 6 | Recent generations work | pass | `GET /api/studio/overview`, `listings` thumbnails from real assets |
| 7 | Generation creation works | pass | `scripts/workflow-smoke.ts` creates a generation in Neon with revision 1 |
| 8 | Script/storyboard generation works | pass (structured planning) | planning worker with Zod-validated brief, script, bible and storyboard; malformed output rejected by `tests/domain.test.ts` |
| 9 | BullMQ workers work | pass | 4 workers on 4 queues, real Redis; jobs executed and recorded in `jobs` |
| 10 | Agnes provider integration exists | pass | `src/providers/agnes.ts` implements the documented endpoints; `tests/provider.test.ts` covers `video_id` polling, `n=1`, seconds as string, mode/media validation |
| 11 | Shot generation works | pass (fake provider) | 4 shots generated, stored, thumbnailed; `providerSubmissions` counted exactly |
| 12 | Individual regeneration works | pass | only the targeted shot re-submitted; other clips untouched |
| 13 | Generation state persists | pass | state read back from Neon after workers exited; Redis loss recovers from `jobs` outbox |
| 14 | FFmpeg render pipeline works | pass | `scripts/render-smoke.ts` and the workflow render produce real MP4s |
| 15 | Final video preview works | pass | `/api/media/[id]` streams with byte-range support for `<video>` playback |
| 16 | Download works | pass | `?download=1` sets `Content-Disposition` |
| 17 | Docker configuration works | pass | image builds with FFmpeg; compose defines web, worker, redis, shared volume |
| 18 | README exists | pass | `README.md` with architecture diagram, setup, deployment |
| 19 | CI exists | pass | `.github/workflows/ci.yml`: install → lint → typecheck → test → build, no provider keys |
| 20 | Lint / typecheck / tests / production build pass | pass | table above |
| 21 | Real Agnes video generation | **blocked externally** | `403 Insufficient user quota, remaining: ＄0.000000` |
| 22 | Real magic-link email delivered to a real inbox | **blocked externally** | `RESEND_FROM_EMAIL` not supplied with an authorized recipient |
| 23 | End-to-end browser walkthrough of the full 3-minute flow | **blocked externally** | requires criterion 21; UI, API, worker and render paths are independently verified |

## Workflow smoke detail (fake provider, labelled fixtures)

`scripts/workflow-smoke.ts` runs entirely against Neon, Redis and FFmpeg with an injected fake provider. It asserts:

1. Generation created → planning job → `STORYBOARD_READY` with 4 shots whose planned durations match narration timing.
2. Cross-user access rejected (`ownedGeneration` throws `NOT_FOUND` for a foreign user id).
3. Editing a shot prompt bumps the generation revision and is rejected on a stale revision (`CONFLICT`).
4. `Generate all shots` → exactly 4 provider submissions; re-running the same command adds **zero** extra submissions (idempotent).
5. Regenerating one shot re-submits only that shot, keeps the previous `clipId` until the replacement succeeds, and produces a different clip afterwards.
6. Ambiguous submit timeout → shot and job become `UNCERTAIN`, the automatic retry command refuses to resubmit, and only an explicit `acknowledgeUncertain` retry proceeds.
7. A job row inserted directly into the database outbox (simulating a lost Redis delivery) is reconciled and executed.
8. Render → real FFmpeg assembly → `renders.status = COMPLETED` with a real asset; requesting the same render version again adds no new render.

Observed result: `{"workflowSmoke":"passed","shots":4,"submissions":8,"renderAssetId":"56ffdf54-..."}` — 8 submissions is the exact expected total (4 initial + 1 regeneration + 1 uncertain + 1 acknowledged retry + 1 outbox replay).

## FFmpeg render evidence

| Artifact | Path | Probe |
| --- | --- | --- |
| Multi-shot fixture render | `data/verification/multi-shot.mp4` | video `h264` 1080×1920, audio `aac`, duration 11.6 s, 514 446 bytes |
| Fixture clips | `data/verification/fixture-{0,1,2}.mp4` | generated colour + sine sources |
| Narration fixture | `data/verification/narration.wav` | 11.6 s PCM |
| Render metadata | `data/verification/render-smoke.json` | composition + probe output |
| Workflow evidence | `data/verification/workflow.json` | generation, shots, submissions, render asset |

The render exercises clip normalization (scale/crop/setsar/fps), mixed transitions (crossfade, fade, cut), narration alignment, music ducking under narration, and burned-in high-contrast captions. `data/verification/` is git-ignored local evidence, not a committed asset.

## Provider checks (no fabricated success)

- **Agnes text model — verified live.** `agnes-2.5-flash` via `POST /v1/chat/completions` returned valid JSON that passed Zod validation. This was a real authenticated call against `https://apihub.agnes-ai.com/v1`.
- **Agnes video model — blocked by the account, not by the code.** `POST /v1/videos` with `agnes-video-2.5` returned:
  `403 Insufficient user quota, remaining: ＄0.000000 (request id: 20260923175124263094697x8Mvd9DB)`.
  An earlier attempt without a model name returned `400 Model name not specified` — proof the request reaches provider validation with the documented payload shape. No further paid attempts were made after the quota response.
- **Resend — API reachable, sending unverified.** `GET https://api.resend.com/domains` returned `200` with one **verified** domain (`aigenstudio.app`). Magic-link delivery is implemented server-side through Resend, but no real inbox delivery was attempted because `RESEND_FROM_EMAIL` and an authorized recipient were not supplied.
- **Duplicates were deliberately avoided.** When the adapter cannot know whether a submit succeeded (timeout, connection reset, 5xx with no response), the submission is committed as `SUBMITTING` before the call, and failure to determine the outcome persists `UNCERTAIN` with a manual-retry path that warns about possible duplicate charges.

## Interface verification (real browser, production build)

The production server (`npm run start` behind the real Neon database) was driven in a real Chromium session with an authenticated magic-link session, at 1280 px and 390×844 mobile viewports:

| Screen | Result |
| --- | --- |
| `/sign-in`, `/sign-up` | Clean card, email-only, "Check your inbox" confirmation state |
| `/dashboard` | Stat cards (total, in progress, completed, failed) read real Neon counts; recent generation card shows the real thumbnail |
| `/generations` | Search, status filter, sort and pagination controls render; card grid shows real thumbnails and status badges |
| `/generations/new` | All documented fields present (`topic, targetDuration, language, platform, aspectRatio, contentFormat, visualStyle, customInstructions`) inside a collapsed Advanced section |
| `/generations/[id]` | Header status and progress bar, working `<video>` player streaming through `/api/media/[id]`, shot timeline with thumbnails/durations/statuses, shot inspector with prompt, duration, mode, transition, character, reference and continuity controls, plus tabs for script and scenes, and audio and captions |
| `/characters` | Empty state plus create form with reference-image upload |
| `/settings` | Reports Database/Redis/FFmpeg ready, Agnes configured, Resend not fully configured, video model and concurrency |
| Mobile (390 px) | Sidebar collapses behind a menu button, no horizontal overflow, stat cards stack, buttons stay reachable |

One real defect was found and fixed during this pass: Iconsax outline icons rendered invisibly under React 19 (the library's colour prop is not applied), so a scoped `stroke: currentColor` rule now supplies the outline. Screenshots were captured after the fix.

## Continuous integration (GitHub Actions, no provider credentials)

Run [35903439629](https://github.com/mariechristsagbo/ai-video-studio/actions/runs/35903439629) on `main` for commit `bf3ba143e04e3e3f3f5822ff9d6fad7ac61be6ff` — **quality: success in 1m5s**:

```text
pnpm install --frozen-lockfile => success
pnpm lint                     => success
pnpm typecheck                => success
pnpm test                     => success
pnpm build                    => success
```

The same build was also reproduced locally with `.env` temporarily removed, proving the pipeline needs no database, Redis or provider credentials.

## Docker verification

```bash
docker compose build
docker compose up -d
docker compose exec web pnpm db:migrate
docker compose exec web ./node_modules/.bin/tsx scripts/render-smoke.ts
```

Observed results on this machine:

| Check | Result |
| --- | --- |
| `docker compose build` | pass — image `ai-video-studio:local` built with FFmpeg 5.1.9 and DejaVu fonts |
| `docker compose ps` | `redis` healthy, `web` healthy (HTTP healthcheck), `worker` running |
| `http://127.0.0.1:3000/sign-in` | 200 — the standalone server serves the real application |
| `docker compose exec web pnpm db:migrate` | pass — migrations applied against Neon from inside the container |
| `docker compose exec web ./node_modules/.bin/tsx scripts/render-smoke.ts` | pass — 1080×1920 H.264 High 30 fps + AAC stereo, 11.6 s, rendered by the image's own FFmpeg |
| Shared media volume | `ls /app/data/verification` returns the same files in `web` and `worker` |
| Container worker → Redis | `redis-cli keys 'bull:*'` lists all four registered queues (`generation-planning`, `video-generation`, `video-rendering`, `generation-cleanup`) |

Two real container defects were found and fixed during this pass:

1. The worker crash-looped because `pnpm` could not write a lockfile in a root-owned `/app`; the runtime stage now chowns `/app` to `node` and the worker runs TypeScript through `./node_modules/.bin/tsx` instead of a package-manager script.
2. `pnpm db:migrate` inside the container failed with `ERR_PNPM_IGNORED_BUILDS` because `pnpm-workspace.yaml` (which holds the build-script allow list) and `pnpm-lock.yaml` were missing from the runtime stage; both are now copied.

## HTTP and security checks (production build, real session)

| Check | Observed |
| --- | --- |
| `GET /api/studio/generations` without a session | 401 `Sign in to continue.` |
| `GET /api/media/<render>` without a session | 404 (existence is not disclosed) |
| `GET /api/media/<render>` with the owning session | 200, 862 933 bytes, `Content-Type: video/mp4`, `X-Content-Type-Options: nosniff` |
| `GET /api/media/<render>` with `Range: bytes=0-49` | 206 with 100 bytes, `Accept-Ranges: bytes` |
| `GET /api/media/<render>?download=1` | `Content-Disposition: attachment; filename="studio-<id>.mp4"` |
| `POST /api/studio/generations` with `Origin: http://evil.example` | 403 `Invalid request origin` |
| `GET /api/studio/generations/<valid but unknown uuid>` | 404 `Not found.` |
| `GET /api/studio/generations/not-a-uuid` | 400 `Check the submitted fields.` |
| `GET /does-not-exist` | 404 with the application not-found page |

## Docker verification

```bash
docker build -t ai-video-studio:local .
docker compose up -d
docker compose exec web pnpm db:migrate
```

The image is a multi-stage build on `node:24-bookworm-slim` with FFmpeg and `fonts-dejavu-core`. Compose runs `web` (Next.js standalone server), `worker` (`pnpm worker`), and `redis` (append-only, `noeviction`), with a shared `media` volume mounted at `/app/data` on both processes and a healthcheck on Redis. The web port is bound to `127.0.0.1` only. `.dockerignore` excludes `.env`, `.env.*`, `data/` and `node_modules`, and the Next.js build excludes `.env*` and `data/**` from output file tracing, so secrets never enter an image layer.

### Container evidence

- `docker compose ps` → `web` healthy (HTTP healthcheck on `/sign-in`), `worker` up and stable, `redis` healthy.
- The worker container registered all four BullMQ queues: `redis-cli keys 'bull:*'` returned `bull:generation-planning:*`, `bull:video-generation:*`, `bull:video-rendering:*`, `bull:generation-cleanup:*`.
- Shared storage is genuinely shared: `docker compose exec web ls /app/data/verification` and `docker compose exec worker ls /app/data/verification` returned the same files.
- The render smoke executed inside the `web` container wrote `/app/data/verification/multi-shot.mp4` (1080×1920, H.264 High, 30 fps, AAC stereo), proving FFmpeg, the caption font and the media volume work in the shipped image.
- Two real container defects were found and fixed: the runtime `/app` tree was not writable by the `node` user (breaking `pnpm worker` and `pnpm db:migrate`), and the runtime stage was missing `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `.npmrc`, which made pnpm refuse to run with an ignored-builds error.

## Known limitations

1. **No funded Agnes quota** — real clip generation could not be exercised. Every code path around the provider boundary is exercised with fakes.
2. **No live inbox magic-link test** — `RESEND_FROM_EMAIL` was not supplied; use a sender on the verified `aigenstudio.app` domain to complete it.
3. **Narration is upload-based.** The official Agnes documentation index lists no standalone TTS endpoint, so no TTS provider was invented. Upload a continuous narration recording, or rely on estimated speech timing.
4. **Captions use phrase-level timing** derived from the script and the timeline; no word-level timestamps are available without a TTS provider.
5. **Local persistent storage only** (as specified for the MVP). `StorageProvider` isolates the boundary so an S3-compatible implementation can be added.
6. **Rate limiting** covers magic-link requests (Better Auth) and generation/render/replan actions (Redis, 20 per minute per user); the Redis client is created with a bounded connect timeout so a Redis outage fails fast instead of hanging requests.
7. **Polling** is bounded: 180 polls or 2 hours per shot, whichever comes first, after which the shot fails cleanly with a retryable error.

## Verification handles

| Item | Handle |
| --- | --- |
| Repository | `https://github.com/mariechristsagbo/ai-video-studio` (private) |
| Local path | `/home/marie-christ/projects/ai-video-studio` |
| Fixture projects | Every smoke and UI fixture creates its own user, project and media, then removes them; nothing is left in Neon or on disk |
| Workflow smoke | `tsx scripts/workflow-smoke.ts` — self-contained, asserts ownership, idempotency, regeneration, uncertain submits and rendering |
| Auth smoke | `tsx scripts/auth-smoke.ts` — official magic link through the test mail boundary; the identity is deleted afterwards |
| UI fixture | `tsx scripts/ui-fixture.ts` seeds a labelled demo project with a real render; `tsx scripts/ui-fixture.ts clean` removes it |
| Container stack | `docker compose up -d` (web on `127.0.0.1:3000`, worker, Redis with a persistent volume) |
| Secrets | `.env` only (mode `0600`, git-ignored); never logged, never committed |
