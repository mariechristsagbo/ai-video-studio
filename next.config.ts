import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", serverExternalPackages: ["pg", "bullmq", "ioredis"] };
export default config;
