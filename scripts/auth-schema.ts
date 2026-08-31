// Prints the SQL better-auth needs, built from the same options the app runs.
// Run it after a better-auth upgrade or a plugin change:
//
//   pnpm run auth:schema > migrations/0002_better_auth.sql
//
// A throwaway in-memory SQLite stands in for D1. The two speak the same SQL.
import { DatabaseSync } from "node:sqlite";

import { getMigrations } from "better-auth/db/migration";

import { authOptions } from "../app/auth.server";

const nowhere = { async signIn() {}, async passwordReset() {} };


const { compileMigrations } = await getMigrations(
  authOptions({
    db: new DatabaseSync(":memory:") as never,
    secret: "schema-only",
    baseURL: "http://localhost",
    mailer: nowhere,
  }),
);

process.stdout.write(await compileMigrations());
