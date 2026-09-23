import { errorResponse } from "../src/lib/http";
import { ZodError } from "zod";
for (const error of [
  new Error("Invalid request origin"),
  new Error("UNAUTHORIZED"),
  new Error("BUSY"),
  new Error("RATE_LIMITED"),
  new Error("UNAVAILABLE"),
  new ZodError([]),
  new Error("boom"),
])
  console.log((error as Error).message, (errorResponse(error) as Response).status);
