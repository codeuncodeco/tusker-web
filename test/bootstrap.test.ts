import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as bootstrapRoute from "../app/routes/bootstrap";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const FIRST = { email: "ada@example.test", name: "Ada", password: "correct horse battery" };

beforeEach(wipe);

function setUp(fields: Record<string, string> = {}) {
  return bootstrapRoute.action(routeArgs(post("/bootstrap", { ...FIRST, ...fields })));
}

async function takeTheSeat() {
  const auth = createAuth(env, get("/"));
  return createAccount(auth, FIRST);
}

describe("the bootstrap route", () => {
  it("makes the first account, its org, and a session", async () => {
    const response = (await setUp()) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/me");
    expect(cookieFrom(response)).toContain("better-auth");

    const org = await db.prepare("SELECT slug, kind FROM orgs").first<{ slug: string; kind: string }>();
    expect(org).toEqual({ slug: "ada", kind: "personal" });
  });

  it("refuses a password that is too short", async () => {
    const said = await setUp({ password: "short" });

    expect(said).toMatchObject({ error: expect.stringContaining("characters or more") });
    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toEqual([]);
  });

  it("closes behind the first account", async () => {
    await takeTheSeat();

    const shown = await caught(bootstrapRoute.loader(routeArgs(get("/bootstrap"))));
    expect(shown.status).toBe(404);

    const posted = await caught(
      bootstrapRoute.action(routeArgs(post("/bootstrap", { ...FIRST, email: "bo@example.test" }))),
    );
    expect(posted.status).toBe(404);

    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toHaveLength(1);
  });

  it("opens while no account exists", async () => {
    expect(await bootstrapRoute.loader(routeArgs(get("/bootstrap")))).toBeNull();
  });
});
