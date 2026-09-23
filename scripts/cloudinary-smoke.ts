import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { storage } from "../src/storage";
// Live check of the media driver: upload, re-download, verify byte for byte, delete.
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
const key = `users/smoke/generations/smoke/${randomBytes(4).toString("hex")}.mp4`;
const payload = randomBytes(96 * 1024);
await storage.put(key, payload);
const local = storage.localPath(key);
assert.equal((await stat(local)).size, payload.length, "local copy has the wrong size");
// Drop only the local copy so the next read has to come back from Cloudinary.
await rm(local, { force: true });
const bytes = await readFile(await storage.materialize(key));
assert.equal(bytes.length, payload.length, "downloaded object has the wrong size");
assert.ok(bytes.equals(payload), "downloaded object differs from the uploaded bytes");
console.log("roundtrip", "ok", `${bytes.length} bytes`);
const url = storage.directUrl?.(key, 300);
if (!url || !url.startsWith("https://"))
  throw new Error("a signed delivery URL was expected");
const ranged = await fetch(url, { headers: { Range: "bytes=0-99" } });
console.log(
  "signed_delivery_url",
  url.startsWith("https://") ? "https" : "other",
  `| GET ${ranged.status}`,
  ranged.headers.get("content-range") || "no content-range",
  "| content-type",
  ranged.headers.get("content-type") || "unknown",
);
assert.equal(ranged.status, 200, "the signed URL should deliver the object");
await storage.remove(key);
await assert.rejects(() => stat(local), "the local copy should be gone");
console.log("cleanup", "ok");
console.log("cloudinary_smoke_passed");
