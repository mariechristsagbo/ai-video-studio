import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
export default defineConfig([
  ...next,
  {
    rules: {
      // Media is served through an authenticated API route, so next/image
      // optimization cannot fetch it on the server.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "drizzle/**"]),
]);
