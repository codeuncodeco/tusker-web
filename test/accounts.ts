import { env } from "cloudflare:workers";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { createOrg, slugify } from "../app/orgs.server";
import * as loginRoute from "../app/routes/login";
import { cookieFrom, get, post, routeArgs } from "./routes";

export const PASSWORD = "correct horse battery";

/**
 * An account and a cookie that signs its requests. It holds no org, because
 * Tusker makes none at signup. See ADR-0027.
 */
export async function signedIn(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { person, cookie: cookieFrom(response) };
}

/**
 * An account that made an org of its own, and a cookie that signs its
 * requests. The account makes the org as a person does at `/orgs/new`. The org
 * takes the person's name and the slug of their email, so `ada@example.test`
 * owns `/o/ada`.
 */
export async function member(email: string, name: string) {
  const { person, cookie } = await signedIn(email, name);
  const made = await createOrg(env.DB, {
    name,
    slug: slugify(email.split("@")[0] ?? ""),
    personId: person.id,
  });
  if (!made) throw new Error(`Another org already holds the slug of ${email}.`);
  return { person, org: { id: made.id, slug: made.slug }, cookie };
}
