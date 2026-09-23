// Creates a generation from a JSON payload, through the same service the studio API uses.
// Usage: pnpm exec tsx scripts/create-generation.ts <userId> <payload.json>
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { writeRoute } from "../src/generations/api-service";

const [userId, payloadPath] = process.argv.slice(2);
if (!userId || !payloadPath) {
  console.error("usage: tsx scripts/create-generation.ts <userId> <payload.json>");
  process.exit(1);
}

const payload = JSON.parse(await readFile(payloadPath, "utf8"));
const result = await writeRoute(
  userId,
  ["generations"],
  new Request("http://localhost/api/studio/generations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }),
);

// writeRoute resolves either a plain payload or a Response-like value, depending on the route.
if (result instanceof Response) {
  console.log(JSON.stringify({ status: result.status, body: await result.text() }, null, 2));
  process.exit(result.ok ? 0 : 1);
}
console.log(JSON.stringify(result, null, 2));
process.exit(0);
