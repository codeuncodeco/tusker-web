import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
      miniflare: {
        d1Databases: { DB: "tusker-test" },
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: { setupFiles: ["./test/apply-migrations.ts"] },
});
