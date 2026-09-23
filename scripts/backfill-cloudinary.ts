import "dotenv/config";
import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { assets } from "../src/db/schema";
import { safePath } from "../src/storage/local";
import {
  CloudinaryStorageProvider,
  cloudinaryConfigFromEnv,
} from "../src/storage/cloudinary";
// Copy every stored object from the local disk to Cloudinary, keeping the same keys so no
// database rows change. Run with STORAGE_DRIVER=cloudinary after configuring the credentials.
if ((process.env.STORAGE_DRIVER ?? "local") !== "cloudinary") {
  console.error("Set STORAGE_DRIVER=cloudinary to backfill media into Cloudinary.");
  process.exit(1);
}
const provider = new CloudinaryStorageProvider(cloudinaryConfigFromEnv(process.env));
const rows = await db.select({ id: assets.id, path: assets.path }).from(assets);
let copied = 0;
let skipped = 0;
let failed = 0;
for (const row of rows) {
  try {
    const local = safePath(row.path);
    const size = (await stat(local)).size;
    if (size === 0) throw new Error("empty local object");
    await provider.upload(row.path);
    copied += 1;
    console.log("uploaded", row.id, `${size} bytes`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") skipped += 1;
    else {
      failed += 1;
      console.error("failed", row.id, error instanceof Error ? error.message : error);
    }
  }
}
console.log(
  `backfill done: ${copied} uploaded, ${skipped} missing locally, ${failed} failed`,
);
await pool.end();
process.exit(failed ? 1 : 0);
