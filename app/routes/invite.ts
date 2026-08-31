import { createAccount } from "../accounts.server";
import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import { MIN_PASSWORD } from "../forms";
import type { Route } from "./+types/invite";

/**
 * Makes one account. Tusker has no public signup, so this is how an
 * invitation lands. The first account comes from `/bootstrap` instead.
 *
 * The endpoint answers only when `INVITE_TOKEN` is set and the request carries
 * it. An environment with no token has no endpoint.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const token = env.INVITE_TOKEN;

  if (!token) throw new Response("Not found", { status: 404 });
  if (!sameToken(request.headers.get("authorization"), `Bearer ${token}`)) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const invitation = readInvitation(body);

  const auth = createAuth(env, request);
  const person = await createAccount(auth, invitation);

  return Response.json({ id: person.id, email: person.email }, { status: 201 });
}

/** The fields an invitation carries, or a 400 that says what is wrong. */
function readInvitation(body: unknown): { email: string; name?: string; password?: string } {
  const given = (body ?? {}) as { email?: unknown; name?: unknown; password?: unknown };

  if (typeof given.email !== "string" || !given.email.includes("@")) {
    throw new Response("An invitation needs an email.", { status: 400 });
  }
  if (given.password !== undefined && typeof given.password !== "string") {
    throw new Response("The password must be text.", { status: 400 });
  }
  if (typeof given.password === "string" && given.password.length < MIN_PASSWORD) {
    throw new Response(`The password needs ${MIN_PASSWORD} characters or more.`, { status: 400 });
  }

  return {
    email: given.email,
    name: typeof given.name === "string" ? given.name : undefined,
    password: typeof given.password === "string" ? given.password : undefined,
  };
}

/** Compares two tokens in the same time whatever they hold. */
function sameToken(given: string | null, wanted: string): boolean {
  if (given === null || given.length !== wanted.length) return false;

  let difference = 0;
  for (let at = 0; at < wanted.length; at++) {
    difference |= given.charCodeAt(at) ^ wanted.charCodeAt(at);
  }
  return difference === 0;
}
