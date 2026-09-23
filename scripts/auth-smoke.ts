import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createAuth } from "../src/auth";
import { storage } from "../src/storage/local";
import { pool } from "../src/db";
const base = process.env.BETTER_AUTH_URL!;
let link = "";
const auth = createAuth(async (mail) => {
  link = mail.url;
});
const email = `studio-smoke-${Date.now()}@example.invalid`;
const send = await auth.handler(
  new Request(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      email,
      name: "Studio Test",
      callbackURL: "/dashboard",
    }),
  }),
);
assert.equal(send.status, 200);
assert.ok(link);
const result = await auth.handler(new Request(link));
assert.equal(result.status, 302);
assert.ok(result.headers.get("location")?.endsWith("/dashboard"));
const cookie = result.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
assert.ok(cookie.includes("session_token"));
const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
assert.equal(session?.user.email, email);
assert.ok(session?.user.emailVerified);
const again = await auth.handler(new Request(link));
assert.ok(!again.headers.getSetCookie().some((c) => c.includes("session_token=")));
await mkdir("data/verification", { recursive: true });
// The session cookie is a live credential, so only non-secret identifiers are retained.
await writeFile(
  "data/verification/session.json",
  JSON.stringify({ userId: session!.user.id, email }, null, 2),
  { mode: 0o600 },
);
// Remove the smoke identity and its media so no test data lingers.
await storage.remove(`users/${session!.user.id}`);
await pool.query("delete from users where id = $1", [session!.user.id]);
console.log(
  JSON.stringify({
    authSmoke: "passed",
    officialMagicLink: true,
    testMailBoundary: true,
    emailVerified: session?.user.emailVerified,
    singleUse: true,
    userId: session?.user.id,
  }),
);
await pool.end();
