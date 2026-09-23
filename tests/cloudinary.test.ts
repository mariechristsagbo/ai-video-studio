import { it, expect, vi, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CloudinaryStorageProvider,
  cloudinaryConfigFromEnv,
  publicIdFor,
  resourceType,
  signParams,
  signedDownloadUrl,
  type CloudinaryConfig,
} from "../src/storage/cloudinary";
import { createStorage } from "../src/storage";

// Expected digests were produced independently (SHA-1 of the sorted signed parameters with
// the API secret appended), so a change in ordering or separator fails loudly.
const SECRET = "test-secret";
const config: CloudinaryConfig = {
  cloudName: "demo",
  apiKey: "123456789012345",
  apiSecret: SECRET,
  folder: "ai-video-studio",
  deliveryType: "private",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("signs sorted parameters with SHA-1 and the API secret", () => {
  expect(
    signParams(
      {
        unique_filename: "false",
        type: "private",
        public_id: "ai-video-studio/users/u1/g/abc",
        timestamp: "1700000000",
      },
      SECRET,
    ),
  ).toBe("a2f2930c4af655fbbbd9afc1c60438048bbb2b40");
});

it("builds a signed private download URL", () => {
  const url = new URL(
    signedDownloadUrl(config, "users/u1/g/abc.mp4", 3600, 1700000000),
  );
  expect(url.host).toBe("api.cloudinary.com");
  expect(url.pathname).toBe("/v1_1/demo/video/download");
  expect(url.searchParams.get("public_id")).toBe("ai-video-studio/users/u1/g/abc");
  expect(url.searchParams.get("format")).toBe("mp4");
  expect(url.searchParams.get("expires_at")).toBe("1700003600");
  expect(url.searchParams.get("api_key")).toBe(config.apiKey);
  expect(url.searchParams.get("signature")).toBe(
    "0491f31ffbc46a75b3c4fce8a698bed842479d7d",
  );
});

it("maps keys to Cloudinary resource types", () => {
  expect(resourceType("users/u/g/clip.mp4")).toBe("video");
  expect(resourceType("users/u/g/voice.mp3")).toBe("video");
  expect(resourceType("users/u/g/thumb.jpg")).toBe("image");
  expect(resourceType("users/u/g/captions.srt")).toBe("raw");
  expect(() => resourceType("users/u/g/no-extension")).toThrow();
});

it("prefixes public ids with the configured folder", () => {
  expect(publicIdFor("users/u1/g/abc.mp4", "ai-video-studio")).toBe(
    "ai-video-studio/users/u1/g/abc",
  );
  expect(publicIdFor("users/u1/g/abc.jpg")).toBe("users/u1/g/abc");
});

it("chunks uploads above the threshold with a stable upload id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cld-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const calls: { body: FormData; headers?: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        _url: string,
        init: { body: FormData; headers?: Record<string, string> },
      ) => {
        calls.push({ body: init.body, headers: init.headers });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            done: calls.length === 3,
            public_id: "ai-video-studio/x",
          }),
        };
      },
    ),
  );
  try {
    // A requested chunk size below the documented 5 MB floor is raised to it.
    const provider = new CloudinaryStorageProvider({
      ...config,
      chunkThresholdBytes: 1024,
      chunkSizeBytes: 800,
    });
    const key = "users/u1/g/abc.mp4";
    const localPath = provider.localPath(key);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, Buffer.alloc(1));
    await truncate(localPath, 12 * 1024 * 1024);
    await provider.upload(key);
    expect(calls).toHaveLength(3);
    const ids = new Set(calls.map((call) => call.headers?.["X-Unique-Upload-Id"]));
    expect(ids.size).toBe(1);
    expect(calls.map((call) => call.headers?.["Content-Range"])).toEqual([
      "bytes 0-5242879/12582912",
      "bytes 5242880-10485759/12582912",
      "bytes 10485760-12582911/12582912",
    ]);
    for (const call of calls) {
      expect(call.body.get("api_key")).toBe(config.apiKey);
      expect(call.body.get("public_id")).toBe("ai-video-studio/users/u1/g/abc");
      expect(call.body.get("type")).toBe("private");
      expect(String(call.body.get("signature"))).toMatch(/^[a-f0-9]{40}$/);
      expect(call.body.get("file")).toBeInstanceOf(Blob);
    }
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

it("uploads a small object in a single signed request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cld-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, status: 200, json: async () => ({ done: true }) };
    }),
  );
  try {
    const provider = new CloudinaryStorageProvider(config);
    await provider.put("users/u1/g/thumb.jpg", Buffer.from([1, 2, 3]));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(calls[0].headers?.["Content-Range"]).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

it("reports Cloudinary failures without leaking the secret", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cld-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid Signature" } }),
    })),
  );
  try {
    const provider = new CloudinaryStorageProvider(config);
    await expect(
      provider.put("users/u1/g/thumb.jpg", Buffer.from([1])),
    ).rejects.toThrow("Cloudinary request failed (401): Invalid Signature");
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

it("requires credentials only when Cloudinary is selected", () => {
  expect(createStorage({}).driver).toBe("local");
  expect(createStorage({ STORAGE_DRIVER: "local" }).driver).toBe("local");
  expect(
    createStorage({
      STORAGE_DRIVER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    }).driver,
  ).toBe("cloudinary");
  expect(() => createStorage({ STORAGE_DRIVER: "cloudinary" })).toThrow(
    "requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
  );
  expect(() => createStorage({ STORAGE_DRIVER: "s3" })).toThrow(
    "Unknown STORAGE_DRIVER",
  );
  // Serverless filesystems are ephemeral, so local storage is refused there.
  expect(() => createStorage({ VERCEL: "1" })).toThrow(
    "Serverless deployments have an ephemeral filesystem",
  );
  expect(
    createStorage({
      VERCEL: "1",
      STORAGE_DRIVER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    }).driver,
  ).toBe("cloudinary");
  expect(() =>
    cloudinaryConfigFromEnv({
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      CLOUDINARY_DELIVERY_TYPE: "public",
    }),
  ).toThrow("CLOUDINARY_DELIVERY_TYPE must be private, authenticated or upload");
});
