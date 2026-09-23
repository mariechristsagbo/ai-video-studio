import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./data/**/*"] },
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
};
export default config;
