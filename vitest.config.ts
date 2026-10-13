import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
      miniflare: {
        // `MIGRATION_DB` is a second, empty database. A test of one migration
        // fills it with the rows of the schema before, then runs the migration.
        d1Databases: { DB: "tusker-test", MIGRATION_DB: "tusker-migration-test" },
        bindings: {
          TEST_MIGRATIONS: migrations,
          BETTER_AUTH_SECRET: "a-secret-that-only-the-tests-use",
          MAIL_FROM: "Tusker <tusker@example.test>",
          INVITE_TOKEN: "a-token-that-only-the-tests-use",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    // `test/colors.test.ts` reads `app/app.css?raw`, to check that every
    // palette name has a token. Vitest blanks a CSS import unless this is on.
    css: true,
  },
});
