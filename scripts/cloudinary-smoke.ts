import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/render/process";
import { thumbnail } from "../src/render/render";
import { storage } from "../src/storage";
// Live check of the media driver: real uploads, re-download, byte comparison, signed URL, delete.
// Credentials come from the environment only; nothing but the outcome is printed.
if (storage.driver !== "cloudinary") {
  console.log("cloudinary_smoke_skipped", "set STORAGE_DRIVER=cloudinary to run");
  process.exit(0);
}
const health = await storage.describe();
console.log(
  "cloudinary_api",
  health.ready ? "ready" : "unavailable",
  "|",
  health.detail,
);
assert.equal(
  health.ready,
  true,
  "Cloudinary API is not reachable with these credentials",
);
// Cloudinary validates media content, so the fixture is a real (tiny) clip.
const work = await mkdtemp(join(tmpdir(), "cld-smoke-"));
const source = join(work, "probe.mp4");
await run(
  "ffmpeg",
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=15:duration=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ],
  60000,
);
const payload = await readFile(source);
const videoKey = `users/smoke/generations/smoke/${randomUUID()}.mp4`;
await storage.put(videoKey, payload);
const local = storage.localPath(videoKey);
assert.equal((await stat(local)).size, payload.length, "local copy has the wrong size");
console.log("upload_video", "ok", `${payload.length} bytes`);
// Drop only the local copy so the next read has to come back from Cloudinary.
await rm(local, { force: true });
const restored = await readFile(await storage.materialize(videoKey));
assert.ok(
  restored.equals(payload),
  "downloaded object differs from the uploaded bytes",
);
console.log("roundtrip_video", "ok", `${restored.length} bytes identical`);
// Image resource type: the thumbnail of the probe clip.
const thumbnailKey = `users/smoke/generations/smoke/${randomUUID()}.jpg`;
const thumbnailPath = join(work, "probe.jpg");
await thumbnail(source, thumbnailPath);
await storage.put(thumbnailKey, await readFile(thumbnailPath));
console.log("upload_image", "ok");
const url = storage.directUrl?.(videoKey, 300);
if (!url || !url.startsWith("https://"))
  throw new Error("a signed delivery URL was expected");
const ranged = await fetch(url, { headers: { Range: "bytes=0-99" } });
console.log(
  "signed_delivery_url",
  `GET ${ranged.status}`,
  "| content-range",
  ranged.headers.get("content-range") || "none",
  "| content-type",
  ranged.headers.get("content-type") || "unknown",
);
assert.equal(ranged.status, 200, "the signed URL should deliver the object");
await storage.remove(videoKey);
await storage.remove(thumbnailKey);
await assert.rejects(() => stat(local), "the local copy should be gone");
await rm(work, { recursive: true, force: true });
console.log("cleanup", "ok");
console.log("cloudinary_smoke_passed");
process.exit(0);
