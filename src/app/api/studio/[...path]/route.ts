import { requireUser } from "@/auth/session";
import { readRoute, writeRoute } from "@/generations/api-service";
import { errorResponse, checkOrigin } from "@/lib/http";
import { getRedis } from "@/queues/redis";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { path } = await context.params;
    return Response.json(await readRoute(user.id, path, new URL(request.url)));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { path } = await context.params;
    // Costly operations are limited in Redis with a fail-closed connection deadline; the database stays the source of truth.
    if (
      path[0] === "generations" &&
      (!path[2] || ["generate", "render", "replan"].includes(path[2]))
    ) {
      let count = 0;
      try {
        const client = getRedis();
        const key = `rate:${user.id}:${Math.floor(Date.now() / 60000)}`;
        count = await client.incr(key);
        if (count === 1) await client.expire(key, 70);
      } catch {
        throw new Error("UNAVAILABLE");
      }
      if (count > 20) throw new Error("RATE_LIMITED");
    }
    const result = await writeRoute(user.id, path, request);
    return Response.json(result.data, { status: result.status ?? 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
