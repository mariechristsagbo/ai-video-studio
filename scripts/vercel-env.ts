import "dotenv/config";
import { spawnSync } from "node:child_process";
// Pushes the deployment variables to Vercel. Values are read from the environment (loaded
// from .env by the caller) and piped into the CLI, so they are never echoed.
//   VERCEL_TOKEN=... pnpm exec tsx scripts/vercel-env.ts --url https://<app>.vercel.app
//   pnpm exec tsx scripts/vercel-env.ts --url https://<app>.vercel.app --dry-run
// Must come from .env: secrets and endpoints only the operator can supply.
const REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "AGNES_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
// Sensible production defaults, overridable from .env.
const DEFAULTS: Record<string, string> = {
  AGNES_BASE_URL: "https://apihub.agnes-ai.com/v1",
  AGNES_TEXT_MODEL: "agnes-2.5-flash",
  AGNES_VIDEO_MODEL: "agnes-video-2.5",
  VIDEO_GENERATION_CONCURRENCY: "3",
  STORAGE_DRIVER: "cloudinary",
  CLOUDINARY_FOLDER: "ai-video-studio",
  CLOUDINARY_DELIVERY_TYPE: "private",
  // Serverless playback goes straight to the CDN with a short-lived signed URL.
  CLOUDINARY_DIRECT_DELIVERY: "true",
};
const MANAGED = [...REQUIRED, ...Object.keys(DEFAULTS)];
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipMissing = args.includes("--skip-missing");
const urlIndex = args.indexOf("--url");
const deploymentUrl = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
const values: Record<string, string> = { ...DEFAULTS };
for (const name of MANAGED) {
  const value = process.env[name];
  if (value) values[name] = value;
}
if (/^rediss?:\/\/(localhost|127\.0\.0\.1)/.test(values.REDIS_URL ?? "")) {
  // A local Redis is unreachable from a function; leave the variable unset instead.
  delete values.REDIS_URL;
  console.warn(
    "skipping REDIS_URL: the configured value points at localhost. Add a managed endpoint (rediss://UPSTASH...) so rate limiting works on Vercel.",
  );
} else if (values.REDIS_URL && !values.REDIS_URL.startsWith("rediss://"))
  console.warn(
    "warning: REDIS_URL is not a managed TLS endpoint; Vercel needs to reach Redis over the public internet.",
  );
if (deploymentUrl) {
  values.BETTER_AUTH_URL = deploymentUrl;
  values.NEXT_PUBLIC_APP_URL = deploymentUrl;
}
const missing = REQUIRED.filter((name) => !values[name]);
if (missing.length && !skipMissing) {
  console.error("missing values in .env:", missing.join(", "));
  console.error("pass --skip-missing to deploy with the others anyway.");
  process.exit(1);
}
if (missing.length)
  console.warn(
    "deploying without:",
    missing.join(", "),
    "- these features will not work yet.",
  );
console.log(
  dryRun ? "dry run: would set" : "setting",
  Object.keys(values).sort().join(", "),
);
if (dryRun) process.exit(0);
for (const [name, value] of Object.entries(values)) {
  for (const environment of ["production", "preview"]) {
    // Replace an existing value rather than failing on a duplicate.
    spawnSync("vercel", ["env", "rm", name, environment, "--yes"], {
      stdio: "ignore",
    });
    const result = spawnSync("vercel", ["env", "add", name, environment], {
      input: value,
      stdio: ["pipe", "ignore", "pipe"],
    });
    if (result.status !== 0) {
      console.error(`failed to set ${name} for ${environment}`);
      console.error(result.stderr?.toString().slice(0, 400) || "");
      process.exit(1);
    }
    console.log(`set ${name} (${environment})`);
  }
}
console.log("vercel environment updated");
