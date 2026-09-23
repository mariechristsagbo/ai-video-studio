import { it, expect } from "vitest";
import {
  safePath,
  signAsset,
  verifyAsset,
  publicAddress,
} from "../src/storage/local";
it("confines storage paths", () => {
  expect(() => safePath("../private")).toThrow();
  expect(() => safePath("/etc/passwd")).toThrow();
});
it("rejects internal download addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
  ])
    expect(publicAddress(ip)).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
});
it("binds expiring signatures to one asset", () => {
  process.env.BETTER_AUTH_SECRET = "a-test-only-secret-at-least-32-characters";
  const expires = Math.floor(Date.now() / 1000) + 60;
  const token = signAsset("asset", expires);
  expect(verifyAsset("asset", expires, token)).toBe(true);
  expect(verifyAsset("other", expires, token)).toBe(false);
  expect(verifyAsset("asset", 1, token)).toBe(false);
});
