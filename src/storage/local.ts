import { resolve, sep, dirname } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
export function safePath(key: string) {
  const root = resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "data");
  const path = resolve(root, key);
  if (key.startsWith("/") || !path.startsWith(root + sep))
    throw new Error("Invalid storage key");
  return path;
}
export interface StorageProvider {
  put(key: string, bytes: Uint8Array): Promise<string>;
  remove(key: string): Promise<void>;
}
export class LocalStorageProvider implements StorageProvider {
  async put(key: string, bytes: Uint8Array) {
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    return key;
  }
  async remove(key: string) {
    await rm(safePath(key), { recursive: true, force: true });
  }
}
export const storage = new LocalStorageProvider();
export function mediaKey(
  userId: string,
  generationId: string | null,
  extension: string,
) {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^\w+$/.test(extension))
    throw new Error("Invalid media key");
  return `users/${userId}/${generationId ? `generations/${generationId}` : "characters"}/${randomUUID()}.${extension}`;
}
export function signAsset(id: string, expires: number) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Signing is not configured");
  return createHmac("sha256", secret).update(`${id}:${expires}`).digest("hex");
}
export function verifyAsset(id: string, expires: number, signature: string) {
  if (
    !Number.isInteger(expires) ||
    expires < Date.now() / 1000 ||
    expires > Date.now() / 1000 + 86401 ||
    !/^([a-f0-9]{64})$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signAsset(id, expires), "hex"),
    Buffer.from(signature, "hex"),
  );
}
export function signedAssetUrl(id: string) {
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (!base || !base.startsWith("https://"))
    throw new Error(
      "Reference generation requires a publicly reachable HTTPS application URL",
    );
  return `${base}/api/media/${id}?expires=${expires}&signature=${signAsset(id, expires)}`;
}
export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
// Pin the resolved address to prevent DNS rebinding; no redirects or credentials.
export async function downloadPublic(
  urlString: string,
  maxBytes = 200 * 1024 * 1024,
): Promise<Buffer> {
  const url = new URL(urlString);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Unsafe media URL");
  const answers = await lookup(url.hostname, { all: true });
  if (!answers.length || answers.some((a) => !publicAddress(a.address)))
    throw new Error("Unsafe media host");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        lookup: (_host, _options, callback) =>
          callback(null, answers[0].address, answers[0].family),
        timeout: 60000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error("Media download rejected"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error("Media exceeds download limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Media download timeout")));
    req.on("error", reject);
    req.end();
  });
}
