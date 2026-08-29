import { applyD1Migrations } from "cloudflare:test";

import { testEnv } from "./env";

// Every test worker starts with the schema the migrations describe.
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
