import { ZodError } from "zod";
// Domain codes map to transport status codes; anything unexpected stays a generic 500
// so provider and database internals never reach the client.
const codes: Record<string, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: "Sign in to continue." },
  FORBIDDEN: { status: 403, message: "This request was rejected." },
  NOT_FOUND: { status: 404, message: "Not found." },
  CONFLICT: {
    status: 409,
    message: "This project changed. Refresh before saving.",
  },
  BUSY: { status: 409, message: "Wait for the current operation to finish." },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests. Try again in a minute.",
  },
  UNAVAILABLE: {
    status: 503,
    message: "The queue service is unavailable. Try again shortly.",
  },
};
const safe = new Set([
  "Upload must be between 1 byte and 50 MB",
  "Unsupported or mismatched media type",
  "Missing upload file",
  "Keep at least one shot",
  "Maximum 100 shots",
  "Continuity requires an earlier shot",
  "Complete all shots before rendering",
  "Replanning is only available before clip generation",
  "Invalid reference",
  "Invalid character",
  "Choose a reference image before generating",
  "Invalid request origin",
]);
export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const mapped = codes[message];
  if (mapped)
    return Response.json({ error: mapped.message }, { status: mapped.status });
  if (message === "Invalid request origin")
    return Response.json({ error: message }, { status: 403 });
  if (error instanceof ZodError)
    return Response.json({ error: "Check the submitted fields." }, { status: 400 });
  if (safe.has(message)) return Response.json({ error: message }, { status: 400 });
  return Response.json(
    {
      error:
        "The operation could not be completed. Check the system status and try again.",
    },
    { status: 500 },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.BETTER_AUTH_URL || new URL(request.url).origin;
  if (!origin || origin !== new URL(expected).origin)
    throw new Error("Invalid request origin");
}
