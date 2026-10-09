import { createContext, redirect, type RouterContextProvider } from "react-router";

import { bearerKey } from "./org-keys";
import { orgForKey } from "./org-keys.server";
import { listOrgsForPerson, orgForMember, orgOfTask, type Org } from "./orgs.server";
import { requirePerson } from "./session.server";
import { readTaskId, type TaskId } from "./task-number";

/**
 * Proof that the signed-in person is a member of one org.
 *
 * Every query that reads or writes task rows takes a scope, never a bare org
 * id, because `org_id` is the only fence between two orgs. A scope is made in
 * one place, `requireScope`, so no route can invent one by hand.
 */
export type Scope = ReadScope & { personId: string };

/**
 * Proof that a request may read one org's task rows. A member's scope is one.
 * An org key is the other: it names an org and no person, because crew who
 * read an org app's task screen are not Tusker accounts. See ADR-0005.
 *
 * Every read an org key can reach takes this. Every write still takes a
 * `Scope`, so a key cannot change a row.
 */
export type ReadScope = { org: Org };

/**
 * The scope the org layout made for this request, for the pages under it.
 *
 * Loaders run at once, parent and child alike, so the layout's loader cannot
 * hand its scope down. Middleware runs before all of them, and this is where
 * it leaves the answer.
 */
export const orgScope = createContext<Scope | null>(null);

/**
 * The scope for a request under `/o/:slug`, or a throw that ends the request:
 * a redirect to sign-in for a signed-out person, and a 404 for everybody else
 * the org does not hold.
 *
 * A person outside the org reads the same answer as one who named an org that
 * does not exist, so a slug does not leak.
 *
 * The context is the request's own, and a page under the org layout passes it
 * so the check is made once. Without one the check is made here.
 */
export async function requireScope(
  request: Request,
  env: Env,
  slug: string,
  context?: Readonly<RouterContextProvider>,
): Promise<Scope> {
  // The org layout proved this org already. A page that asks again inside the
  // same request reads that answer, so one visit is one membership check.
  const held = context?.get(orgScope);
  if (held && held.org.slug === slug) return held;

  const person = await requirePerson(request, env);
  const org = await orgForMember(env.DB, slug, person.id);
  if (!org) throw new Response("Not found", { status: 404 });
  return { org, personId: person.id };
}

/** One task, and the scope of the org that holds it. */
export type TaskScope = { scope: Scope; taskId: TaskId };

/**
 * The scope the task layout made for this request, for the task page under
 * it. It is the same hand-down `orgScope` makes for the org pages.
 */
export const taskScope = createContext<TaskScope | null>(null);

/**
 * The task a request under `/t/:n` names, and the scope of the org that holds
 * it, or a throw that ends the request: a redirect to sign-in for a signed-out
 * person, and a 404 for everybody else.
 *
 * The path names no org, so the org is read from the task. A task in an org
 * the person is not in, a deleted task, a number never handed out and a path
 * that is no number at all read the same 404, because a number is guessable
 * and the page must say nothing about which numbers are taken. See ADR-0030.
 */
export async function requireTaskScope(
  request: Request,
  env: Env,
  n: string,
  context?: Readonly<RouterContextProvider>,
): Promise<TaskScope> {
  const taskId = readTaskId(n);
  const held = context?.get(taskScope);
  if (held && held.taskId === taskId) return held;

  const person = await requirePerson(request, env);
  const org = taskId === null ? null : await orgOfTask(env.DB, taskId, person.id);
  if (taskId === null || !org) throw new Response("Not found", { status: 404 });
  return { scope: { org, personId: person.id }, taskId };
}

/**
 * Proof that the signed-in person is a member of every org in the set. The
 * cross-org pages read across all of them at once, so they take this rather than
 * a list of ids it assembled itself.
 */
export type OrgSet = { orgs: Org[]; personId: string };

/**
 * Every org the signed-in person belongs to, or a redirect to sign-in. A
 * person who belongs to nothing is sent to the org directory, because they
 * have no work to read and the directory is where they ask to join an org.
 * See ADR-0027.
 */
export async function requireOrgSet(request: Request, env: Env): Promise<OrgSet> {
  const set = await readOrgSet(request, env);
  if (set.orgs.length === 0) throw redirect(DIRECTORY);
  return set;
}

/** The org directory, where a person who belongs to no org lands. */
export const DIRECTORY = "/orgs";

/**
 * The same set, empty for a person who belongs to nothing. The person layout
 * reads this, because the directory, the account page and the new-org form sit
 * under it and are open to such a person.
 */
export async function readOrgSet(request: Request, env: Env): Promise<OrgSet> {
  const person = await requirePerson(request, env);
  return { orgs: await listOrgsForPerson(env.DB, person.id), personId: person.id };
}

/**
 * The one-org scope for one org of the set, or null when the set holds no such
 * org. A cross-org page reads a row through this, so a task the person cannot
 * reach is a null here rather than a missing WHERE clause further down.
 */
export function scopeIn(set: OrgSet, orgId: string): Scope | null {
  return scopeFor(set, (org) => org.id === orgId);
}

/**
 * The same scope, for an org a form named by its slug. A form carries the slug
 * because a card links by it, and a slug a person invents answers null.
 */
export function scopeForSlug(set: OrgSet, slug: string): Scope | null {
  return scopeFor(set, (org) => org.slug === slug);
}

function scopeFor(set: OrgSet, is: (org: Org) => boolean): Scope | null {
  const org = set.orgs.find(is);
  return org ? { org, personId: set.personId } : null;
}

/**
 * The read scope an org key names, or a throw that ends the request with 401.
 *
 * A missing key, a key nothing hashes to and a revoked key all read the same,
 * because none of them names an org and the caller learns nothing from which
 * it was.
 */
export async function requireKeyScope(request: Request, env: Env): Promise<ReadScope> {
  const key = bearerKey(request.headers.get("authorization"));
  const org = key ? await orgForKey(env.DB, key) : null;
  if (!org) throw Response.json({ error: "That key opens nothing." }, { status: 401 });
  return { org };
}
