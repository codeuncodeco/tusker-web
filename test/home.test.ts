import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as homeRoute from "../app/routes/home";
import * as loginRoute from "../app/routes/login";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const EMAIL = "ada@example.test";
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  await wipe();
});

/** An account and the cookie that signs it in. */
async function signedIn() {
  const auth = createAuth(env, get("/"));
  await createAccount(auth, { email: EMAIL, name: "Ada", password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email: EMAIL, password: PASSWORD })),
  )) as Response;
  return cookieFrom(response);
}

describe("the home page", () => {
  it("sends a signed-in person to their tasks", async () => {
    const cookie = await signedIn();

    const response = await caught(homeRoute.loader(routeArgs(get("/", cookie))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/me");
  });

  it("offers a signed-out person the first account when no account exists", async () => {
    const said = await homeRoute.loader(routeArgs(get("/")));

    expect(said).toEqual({ empty: true });
  });

  it("offers a signed-out person sign-in once an account exists", async () => {
    const auth = createAuth(env, get("/"));
    await createAccount(auth, { email: EMAIL, name: "Ada", password: PASSWORD });

    const said = await homeRoute.loader(routeArgs(get("/")));

    expect(said).toEqual({ empty: false });
  });
});
