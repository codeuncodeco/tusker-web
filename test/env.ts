import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { env } from "cloudflare:workers";

/** The bindings `vitest.config.ts` gives the test worker. */
export type TestEnv = {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

export const testEnv = env as unknown as TestEnv;
