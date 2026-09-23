import { it, expect } from "vitest";
import { ZodError } from "zod";
import { errorResponse } from "../src/lib/http";
const status = (error: unknown) => errorResponse(error).status;
it("maps domain codes to transport statuses", async () => {
  expect(status(new Error("UNAUTHORIZED"))).toBe(401);
  expect(status(new Error("NOT_FOUND"))).toBe(404);
  expect(status(new Error("CONFLICT"))).toBe(409);
  expect(status(new Error("BUSY"))).toBe(409);
  expect(status(new Error("RATE_LIMITED"))).toBe(429);
  expect(status(new Error("UNAVAILABLE"))).toBe(503);
  expect(status(new Error("Invalid request origin"))).toBe(403);
});
it("returns a validator message without leaking internals", async () => {
  expect(status(new ZodError([]))).toBe(400);
  const response = errorResponse(new Error('relation "generations" does not exist'));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error:
      "The operation could not be completed. Check the system status and try again.",
  });
});
it("passes curated input errors through as 400", async () => {
  const response = errorResponse(new Error("Upload must be between 1 byte and 50 MB"));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "Upload must be between 1 byte and 50 MB",
  });
});
