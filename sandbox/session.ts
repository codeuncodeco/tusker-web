/**
 * Stands in for `app/session.server.ts` in the sandbox build: every request is
 * the one seeded person, signed in. The scope functions read the person from
 * here, so they see a member, and the owner, of the seeded orgs.
 *
 * The person is read from the browser database, so a name changed there shows
 * where the app shows it.
 */

import type * as Real from "../app/session.server";
import { PERSON } from "./seed";

type Session = NonNullable<Awaited<ReturnType<typeof Real.getSession>>>;

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  image: string | null;
  createdAt: string;
  updatedAt: string;
};

export const getSession: typeof Real.getSession = async (_request, env) => {
  const row = await env.DB.prepare('SELECT * FROM "user" WHERE id = ?').bind(PERSON.id).first<UserRow>();
  if (!row) return null;

  const user = {
    ...row,
    emailVerified: row.emailVerified === 1,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  const session = {
    id: "sandbox-session",
    token: "sandbox-session",
    userId: row.id,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ipAddress: null,
    userAgent: null,
  };
  return { user, session } as unknown as Session;
};

export const requirePerson: typeof Real.requirePerson = async (request, env) => {
  const found = await getSession(request, env);
  if (found) return found.user;
  // Only a database with the person deleted by hand lands here.
  throw new Response("The sandbox person is gone. Reset the sample data.", { status: 500 });
};

/** A browser keeps no cookie a script writes into a response, so there is nothing to copy. */
export const withCookies: typeof Real.withCookies = (_from, to) => to;
