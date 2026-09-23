import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The route is the only place that throttles costly operations, so it is exercised directly.
const incr = vi.fn();
const expire = vi.fn();
vi.mock("../src/queues/redis", () => ({ getRedis: () => ({ incr, expire }) }));
vi.mock("../src/auth/session", () => ({ requireUser: async () => ({ id: "user-1" }) }));
const writeRoute = vi.fn(async () => ({ data: { ok: true } }));
vi.mock("../src/generations/api-service", () => ({ readRoute: vi.fn(), writeRoute }));

const { POST } = await import("../src/app/api/studio/[...path]/route");

const context = { params: Promise.resolve({ path: ["generations"] }) };
const request = () =>
  new Request("https://studio.test/api/studio/generations", {
    method: "POST",
    headers: { origin: "https://studio.test", "content-type": "application/json" },
    body: "{}",
  });

beforeEach(() => {
  incr.mockReset();
  expire.mockReset();
  writeRoute.mockClear();
  process.env.BETTER_AUTH_URL = "https://studio.test";
  delete process.env.RATE_LIMIT_MODE;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.RATE_LIMIT_MODE;
  vi.restoreAllMocks();
});

it("counts costly operations in Redis", async () => {
  incr.mockResolvedValue(5);
  expect((await POST(request(), context)).status).toBe(200);
  expect(incr).toHaveBeenCalledOnce();
});

it("throttles the 21st costly operation within the same minute", async () => {
  incr.mockResolvedValue(21);
  expect((await POST(request(), context)).status).toBe(429);
  expect(writeRoute).not.toHaveBeenCalled();
});

it("refuses costly operations when Redis is unreachable", async () => {
  incr.mockRejectedValue(new Error("ECONNREFUSED"));
  expect((await POST(request(), context)).status).toBe(503);
  expect(writeRoute).not.toHaveBeenCalled();
});

it("allows them with RATE_LIMIT_MODE=lenient and reports the gap", async () => {
  process.env.RATE_LIMIT_MODE = "lenient";
  incr.mockRejectedValue(new Error("ECONNREFUSED"));
  expect((await POST(request(), context)).status).toBe(200);
  expect(writeRoute).toHaveBeenCalledOnce();
  expect(console.warn).toHaveBeenCalled();
});

it("keeps read-only routes out of the limiter", async () => {
  incr.mockRejectedValue(new Error("ECONNREFUSED"));
  const read = { params: Promise.resolve({ path: ["overview"] }) };
  const response = await POST(
    new Request("https://studio.test/api/studio/overview", {
      method: "POST",
      headers: { origin: "https://studio.test" },
      body: "{}",
    }),
    read,
  );
  expect(response.status).toBe(200);
});
