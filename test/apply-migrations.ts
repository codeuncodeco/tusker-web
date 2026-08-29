import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// `vitest.config.ts` binds the migrations that `readD1Migrations` collected.
const migrations = (env as Env & { TEST_MIGRATIONS: D1Migration[] })
  .TEST_MIGRATIONS;

// Every test worker starts with the schema the migrations describe.
await applyD1Migrations(env.DB, migrations);
