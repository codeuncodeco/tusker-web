import { createAccount } from "../accounts.server";
import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import type { Route } from "./+types/invite";

/**
 * Makes one account. Tusker has no public signup, so this is how the first
 * person gets in and how an invitation lands.
 *
 * The endpoint answers only when `INVITE_TOKEN` is set and the request carries
 * it. An environment with no token has no endpoint.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const token = env.INVITE_TOKEN;

  if (!token) throw new Response("Not found", { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as { email?: string; name?: string; password?: string };
  if (!body.email) throw new Response("An invitation needs an email.", { status: 400 });

  const auth = createAuth(env, request);
  const user = await createAccount(auth, body as { email: string; name?: string; password?: string });

  return Response.json({ id: user.id, email: user.email }, { status: 201 });
}
