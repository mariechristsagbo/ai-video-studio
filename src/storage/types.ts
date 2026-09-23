export type StorageDriverName = "local" | "cloudinary";
/** A storage backend for private media objects addressed by application keys. */
export interface StorageProvider {
  readonly driver: StorageDriverName;
  /** Persist bytes under key and return the key. */
  put(key: string, bytes: Uint8Array): Promise<string>;
  /** Publish a file that was already written at localPath(key). */
  upload(key: string): Promise<string>;
  /** Absolute local path holding key, downloading it when the backend is remote. */
  materialize(key: string): Promise<string>;
  /** Absolute local path for key, for outputs about to be written there. */
  localPath(key: string): string;
  /** Remove every copy of key. */
  remove(key: string): Promise<void>;
  /** Time limited direct URL, when the backend can hand one out. */
  directUrl?(key: string, expiresSeconds: number): string;
  /** Readiness for the settings page. Never includes credentials. */
  describe(): Promise<{ driver: string; ready: boolean; detail: string }>;
}
