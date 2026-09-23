import "dotenv/config";
import { createAuth } from "../src/auth";

// Development helper: prints a one-time sign-in link for an existing or new address so the UI can be
// opened locally without an inbox. Never exposed over HTTP, and refused when NODE_ENV is production.
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to mint sign-in links with NODE_ENV=production.");
  process.exit(1);
}
const email = process.argv[2];
if (!email) {
  console.error("Usage: pnpm exec tsx scripts/dev-magic-link.ts <email> [callback-path]");
  process.exit(1);
}
const callbackURL = process.argv[3] || "/dashboard";
let link = "";
const auth = createAuth(async (mail) => {
  link = mail.url;
});
const response = await auth.handler(
  new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: process.env.BETTER_AUTH_URL! },
    body: JSON.stringify({ email, callbackURL }),
  }),
);
if (!response.ok || !link) {
  console.error(`Request failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}
console.log(link);
process.exit(0);
