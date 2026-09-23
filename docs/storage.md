# Media storage

Media objects are addressed by **keys** (`users/<userId>/generations/<generationId>/<uuid>.<ext>`),
never by absolute paths, so the same database rows stay valid whichever backend holds the bytes.
`assets.path` always stores a key; `storage.materialize(key)` turns it into a readable local file.

## Drivers

| Driver | Selected by | Behaviour |
| --- | --- | --- |
| `local` (default) | `STORAGE_DRIVER` unset or `local` | Objects live under `DATA_DIR`. `materialize` is a no-op lookup. |
| `cloudinary` | `STORAGE_DRIVER=cloudinary` | Objects live in Cloudinary. `DATA_DIR` stays the working cache FFmpeg needs. |

`createStorage(env)` in `src/storage/index.ts` is the only place that chooses a driver, and it
fails fast with the names of any missing setting. Credentials are never logged or returned;
`storage.describe()` (used by the Settings page) reports readiness and the cloud name only.

## Why a local copy still exists

FFmpeg needs real files, so every driver keeps a working copy under `DATA_DIR`:

- `storage.put(key, bytes)` writes the local file and publishes it to the backend.
- `storage.upload(key)` publishes a file the render pipeline just produced.
- `storage.materialize(key)` returns the local path, downloading it once when the local copy is missing.
- `storage.remove(key)` deletes both copies.

Consequence worth knowing: with Cloudinary selected, `DATA_DIR` is a cache and grows with usage.
Generation deletion removes both copies, so the cache follows the same lifecycle as the database.

## Cloudinary settings

| Variable | Meaning |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Product environment name (Console → Dashboard) |
| `CLOUDINARY_API_KEY` | Console → Settings → API Keys |
| `CLOUDINARY_API_SECRET` | Same panel. Server-side only; rotate it if it ever leaves the server |
| `CLOUDINARY_FOLDER` | Optional prefix added to every public id (default `ai-video-studio`) |
| `CLOUDINARY_DELIVERY_TYPE` | `private` (default), `authenticated` or `upload` |
| `CLOUDINARY_DIRECT_DELIVERY` | `true` serves playback with a short-lived signed URL instead of proxying |

`private` (and `authenticated`) keep assets out of public CDN paths, so access goes through the
signed download URL that `storage.directUrl()` builds: SHA-1 over the sorted parameters
(`expires_at`, `format`, `public_id`, `timestamp`) with the API secret appended, exactly like the
upload signature documented by Cloudinary. `upload` makes objects publicly readable through
`res.cloudinary.com` and is only appropriate for non-sensitive media.

## Uploads

- Signed `POST` to `https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/upload` with
  `public_id`, `timestamp`, `type`, `overwrite=false`, `invalidate=true` and the SHA-1 signature.
- Resource type follows the key: `mp4`/`mov` and every audio extension use `video` (Cloudinary
  classifies audio as video), images use `image`, anything else uses `raw`.
- Files above 95 MB are sent in chunks of at least 5 MB with a stable
  `X-Unique-Upload-Id` and `Content-Range: bytes start-end/total`, which is Cloudinary's
  requirement for uploads over 100 MB. The intermediate responses (`done: false`) are ignored and
  the final one (`done: true`) is returned.
- Deleting also posts to the `destroy` endpoint with `invalidate=true`; a missing remote object is
  treated as success because the local copy is already gone.

## Delivery

1. **Proxy (default)** — `/api/media/<assetId>` authorises the caller, materialises the object and
   streams it with byte-range support, exactly as with the local driver. Nothing about the backend
   leaks to the browser and playback seeking keeps working.
2. **Direct (`CLOUDINARY_DIRECT_DELIVERY=true`)** — playback requests are answered with a 302 to a
   15-minute signed URL, so bytes come straight from the CDN. This path is opt-in and was not
   exercised against Cloudinary in the recorded verification run; the proxy path was.

Reference and keyframe shots are handed to the video provider as a signed Cloudinary URL
(`storage.directUrl(key, 3600)`) instead of the application's own expiring link, which removes the
"public HTTPS application URL" requirement those modes had with local storage.

## Migrating existing media

`scripts/backfill-cloudinary.ts` copies every asset row's object from `DATA_DIR` to Cloudinary
while keeping the same keys, so no database rows change:

```bash
STORAGE_DRIVER=cloudinary pnpm exec tsx scripts/backfill-cloudinary.ts
```

## Verification

- `tests/cloudinary.test.ts` covers signature digests (against independently computed SHA-1
  vectors), the signed download URL, resource-type mapping, single and chunked uploads with
  stubbed HTTP, failure messages, and driver selection/validation.
- `STORAGE_DRIVER=cloudinary pnpm exec tsx scripts/cloudinary-smoke.ts` performs a real
  upload → re-download → byte comparison → signed URL → delete cycle against the live account.
