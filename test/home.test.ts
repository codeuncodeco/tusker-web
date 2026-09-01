import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as homeRoute from "../app/routes/home";
import * as loginRoute from "../app/routes/login";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const EMAIL = "ada@example.test";
const PASSWORD = "correct horse battery";

beforeEach(wipe);

/** The first account, which the landing rule reads as "the instance is in use". */
async function takeTheSeat() {
  const auth = createAuth(env, get("/"));
  return createAccount(auth, { email: EMAIL, name: "Ada", password: PASSWORD });
}

/** An account and the cookie that signs it in. */
async function signedIn() {
  await takeTheSeat();
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email: EMAIL, password: PASSWORD })),
  )) as Response;
  return cookieFrom(response);
}

describe("the landing route", () => {
  it("sends the person to bootstrap while the instance holds no account", async () => {
    const response = await caught(homeRoute.loader(routeArgs(get("/"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/bootstrap");
  });

  it("sends a signed-in person to the unified view", async () => {
    const cookie = await signedIn();

    const response = await caught(homeRoute.loader(routeArgs(get("/", cookie))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/me");
  });

  it("shows the landing page to a signed-out person", async () => {
    await takeTheSeat();

    expect(await homeRoute.loader(routeArgs(get("/")))).toBeNull();
  });
});
