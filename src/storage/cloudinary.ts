import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { downloadPublic, safePath } from "./local";
import type { StorageProvider } from "./types";
export type CloudinaryDeliveryType = "private" | "authenticated" | "upload";
export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
  deliveryType?: CloudinaryDeliveryType;
  chunkThresholdBytes?: number;
  chunkSizeBytes?: number;
};
const UPLOAD_ENDPOINT = "https://api.cloudinary.com/v1_1";
const DEFAULT_CHUNK_THRESHOLD = 95 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024;
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const AUDIO = ["mp3", "wav", "flac", "ogg", "m4a", "aac"];
const IMAGE = ["jpg", "jpeg", "png", "webp"];
export function extensionOf(key: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(key);
  if (!match) throw new Error("Storage key has no extension");
  return match[1].toLowerCase();
}
/** Cloudinary classifies audio under the video resource type. */
export function resourceType(key: string): "video" | "image" | "raw" {
  const extension = extensionOf(key);
  if (extension === "mp4" || extension === "mov" || AUDIO.includes(extension))
    return "video";
  if (IMAGE.includes(extension)) return "image";
  return "raw";
}
/** Signature: SHA-1 over sorted signed parameters with the API secret appended. */
export function signParams(params: Record<string, string>, apiSecret: string) {
  const toSign = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}
export function publicIdFor(key: string, folder?: string) {
  const id = key.replace(/\.([a-zA-Z0-9]+)$/, "");
  return folder && folder.length ? `${folder.replace(/\/+$/, "")}/${id}` : id;
}
export function signedDownloadUrl(
  config: CloudinaryConfig,
  key: string,
  expiresSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const timestamp = nowSeconds;
  const params = {
    expires_at: String(timestamp + expiresSeconds),
    format: extensionOf(key),
    public_id: publicIdFor(key, config.folder),
    timestamp: String(timestamp),
  };
  const query = new URLSearchParams({
    ...params,
    signature: signParams(params, config.apiSecret),
    api_key: config.apiKey,
  });
  return `${UPLOAD_ENDPOINT}/${config.cloudName}/${resourceType(key)}/download?${query}`;
}
function unsignedDeliveryUrl(config: CloudinaryConfig, key: string) {
  return `https://res.cloudinary.com/${config.cloudName}/${resourceType(key)}/upload/${publicIdFor(key, config.folder)}.${extensionOf(key)}`;
}
function failure(status: number, body: unknown) {
  const message =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: string } }).error?.message
      : undefined;
  return new Error(
    `Cloudinary request failed (${status})${message ? `: ${message}` : ""}`,
  );
}
export class CloudinaryStorageProvider implements StorageProvider {
  readonly driver = "cloudinary" as const;
  private readonly chunkThreshold: number;
  private readonly chunkSize: number;
  constructor(private readonly config: CloudinaryConfig) {
    this.chunkThreshold = config.chunkThresholdBytes ?? DEFAULT_CHUNK_THRESHOLD;
    this.chunkSize = Math.max(
      config.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE,
      MIN_CHUNK_SIZE,
    );
  }
  localPath(key: string) {
    return safePath(key);
  }
  async put(key: string, bytes: Uint8Array) {
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    await this.upload(key);
    return key;
  }
  async upload(key: string) {
    const path = safePath(key);
    await this.send(path, publicIdFor(key, this.config.folder), resourceType(key));
    return key;
  }
  directUrl(key: string, expiresSeconds: number) {
    const type = this.config.deliveryType ?? "private";
    if (type === "upload") return unsignedDeliveryUrl(this.config, key);
    return signedDownloadUrl(this.config, key, expiresSeconds);
  }
  async materialize(key: string) {
    const path = safePath(key);
    try {
      const info = await stat(path);
      if (info.size > 0) return path;
    } catch {
      // fall through to the remote copy
    }
    const bytes = await downloadPublic(this.directUrl(key, 3600), 600 * 1024 * 1024);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    return path;
  }
  async remove(key: string) {
    await rm(safePath(key), { recursive: true, force: true });
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      invalidate: "true",
      public_id: publicIdFor(key, this.config.folder),
      timestamp: String(timestamp),
      type: this.config.deliveryType ?? "private",
    };
    const body = new URLSearchParams({
      ...params,
      api_key: this.config.apiKey,
      signature: signParams(params, this.config.apiSecret),
    });
    const response = await fetch(
      `${UPLOAD_ENDPOINT}/${this.config.cloudName}/${resourceType(key)}/destroy`,
      { method: "POST", body },
    );
    // A missing remote object is not an error: the local copy is already gone.
    if (!response.ok && response.status !== 404)
      throw failure(response.status, await response.json().catch(() => null));
  }
  async describe() {
    const type = this.config.deliveryType ?? "private";
    const detail = `cloud ${this.config.cloudName}, ${type} delivery`;
    try {
      const credentials = Buffer.from(
        `${this.config.apiKey}:${this.config.apiSecret}`,
      ).toString("base64");
      const response = await fetch(
        `${UPLOAD_ENDPOINT}/${this.config.cloudName}/resources/video?max_results=1`,
        {
          headers: { Authorization: `Basic ${credentials}` },
          signal: AbortSignal.timeout(8000),
        },
      );
      return {
        driver: this.driver,
        ready: response.ok,
        detail: response.ok ? detail : `API responded ${response.status}`,
      };
    } catch {
      return { driver: this.driver, ready: false, detail: "API unreachable" };
    }
  }
  private async send(path: string, publicId: string, type: string) {
    const size = (await stat(path)).size;
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      invalidate: "true",
      overwrite: "false",
      public_id: publicId,
      timestamp: String(timestamp),
      type: this.config.deliveryType ?? "private",
      unique_filename: "false",
    };
    const signature = signParams(params, this.config.apiSecret);
    const url = `${UPLOAD_ENDPOINT}/${this.config.cloudName}/${type}/upload`;
    if (size <= this.chunkThreshold) {
      const body = new FormData();
      body.append("file", new Blob([await readFile(path)]), basename(path));
      this.appendParams(body, params, signature);
      return this.post(url, body);
    }
    // Files above ~100 MB must be sent in chunks of at least 5 MB.
    const uploadId = randomUUID();
    const handle = await open(path, "r");
    try {
      let start = 0;
      let last: unknown;
      while (start < size) {
        const end = Math.min(start + this.chunkSize, size);
        const chunk = Buffer.alloc(end - start);
        await handle.read(chunk, 0, chunk.length, start);
        const body = new FormData();
        body.append("file", new Blob([chunk]), basename(path));
        this.appendParams(body, params, signature);
        last = await this.post(url, body, {
          "X-Unique-Upload-Id": uploadId,
          "Content-Range": `bytes ${start}-${end - 1}/${size}`,
        });
        start = end;
      }
      return last;
    } finally {
      await handle.close();
    }
  }
  private appendParams(
    body: FormData,
    params: Record<string, string>,
    signature: string,
  ) {
    for (const [name, value] of Object.entries(params)) body.append(name, value);
    body.append("api_key", this.config.apiKey);
    body.append("signature", signature);
  }
  private async post(url: string, body: FormData, headers?: Record<string, string>) {
    const response = await fetch(url, { method: "POST", body, headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw failure(response.status, payload);
    return payload;
  }
}
export function cloudinaryConfigFromEnv(
  env: Record<string, string | undefined>,
): CloudinaryConfig {
  const required = {
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length)
    throw new Error(
      `STORAGE_DRIVER=cloudinary requires ${missing.join(", ")} (see .env.example)`,
    );
  const delivery = env.CLOUDINARY_DELIVERY_TYPE ?? "private";
  if (!["private", "authenticated", "upload"].includes(delivery))
    throw new Error(
      "CLOUDINARY_DELIVERY_TYPE must be private, authenticated or upload",
    );
  return {
    cloudName: required.CLOUDINARY_CLOUD_NAME!,
    apiKey: required.CLOUDINARY_API_KEY!,
    apiSecret: required.CLOUDINARY_API_SECRET!,
    folder: env.CLOUDINARY_FOLDER,
    deliveryType: delivery as CloudinaryDeliveryType,
  };
}
