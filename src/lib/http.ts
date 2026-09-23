import { ZodError } from "zod";
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "UNAUTHORIZED"
      ? 401
      : message === "NOT_FOUND"
        ? 404
        : message === "CONFLICT" || message === "BUSY"
          ? 409
          : error instanceof ZodError
            ? 400
            : 400;
  const friendly =
    message === "CONFLICT"
      ? "This project changed. Refresh before saving."
      : message === "BUSY"
        ? "Wait for the current operation to finish."
        : message === "UNAUTHORIZED"
          ? "Sign in to continue."
          : message === "NOT_FOUND"
            ? "Not found."
            : error instanceof ZodError
              ? "Check the submitted fields."
              : "The operation could not be completed. Check your inputs and system configuration.";
  return Response.json({ error: friendly }, { status });
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.BETTER_AUTH_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin)
    throw new Error("Invalid request origin");
}
export async function jsonBody(request: Request) {
  const text = await request.text();
  if (text.length > 100000) throw new Error("Request too large");
  return JSON.parse(text);
}
