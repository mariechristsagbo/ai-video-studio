import type { NextConfig } from "next";
import { assertServerlessStorage } from "./src/storage/guards";
// Fail the deployment itself rather than discovering an unusable storage driver at runtime.
assertServerlessStorage(process.env);
const config: NextConfig = {
  // Vercel builds the app itself; only the Docker image consumes .next/standalone.
  ...(process.env.DOCKER_BUILD ? { output: "standalone" as const } : {}),
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./data/**/*"] },
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
};
export default config;
