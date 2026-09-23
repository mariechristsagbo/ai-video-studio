import { LocalStorageProvider } from "./local";
import { assertServerlessStorage } from "./guards";
import {
  CloudinaryStorageProvider,
  cloudinaryConfigFromEnv,
  type CloudinaryConfig,
} from "./cloudinary";
import type { StorageProvider } from "./types";
export function createStorage(
  env: Record<string, string | undefined>,
): StorageProvider {
  const driver = env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    assertServerlessStorage(env);
    return new LocalStorageProvider();
  }
  if (driver === "cloudinary")
    return new CloudinaryStorageProvider(cloudinaryConfigFromEnv(env));
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected local or cloudinary)`);
}
export const storage: StorageProvider = createStorage(process.env);
export { LocalStorageProvider } from "./local";
export { CloudinaryStorageProvider, cloudinaryConfigFromEnv } from "./cloudinary";
export type { StorageProvider, StorageDriverName } from "./types";
export type { CloudinaryConfig };
export {
  safePath,
  mediaKey,
  signAsset,
  verifyAsset,
  signedAssetUrl,
  publicAddress,
  downloadPublic,
} from "./local";
