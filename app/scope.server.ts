import { orgForMember, type Org } from "./orgs.server";
import { requirePerson } from "./session.server";

/**
 * Proof that the signed-in person is a member of one org.
 *
 * Every query that reads or writes task rows takes a scope, never a bare org
 * id, because `org_id` is the only fence between two orgs. A scope is made in
 * one place, `requireScope`, so no route can invent one by hand.
 */
export type Scope = { org: Org; personId: string };

/**
 * The scope for a request under `/o/:slug`, or a throw that ends the request:
 * a redirect to sign-in for a signed-out person, and a 404 for everybody else
 * the org does not hold.
 *
 * A person outside the org reads the same answer as one who named an org that
 * does not exist, so a slug does not leak.
 */
export async function requireScope(request: Request, env: Env, slug: string): Promise<Scope> {
  const person = await requirePerson(request, env);
  const org = await orgForMember(env.DB, slug, person.id);
  if (!org) throw new Response("Not found", { status: 404 });
  return { org, personId: person.id };
}
