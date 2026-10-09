/**
 * The org the cross-org quick-add box files into.
 *
 * The pick starts with no org every time a person opens Tusker, holds while
 * they stay in the app — the move from `/me` to `/me/plan` included — and dies
 * on a reload or in a new tab. That lifetime is what this state is: it lives in
 * the root layout, so nothing is stored and nothing expires.
 *
 * No org is safe to start at. A task that lands in the wrong org is on every
 * member's board, an org of one today can take a member tomorrow, and Tusker
 * cannot move a task between orgs. See ADR-0012 and ADR-0024.
 */

import { createContext, useContext, useState } from "react";

/** The slug the box files into, and the way to change it. Null is no pick yet. */
type AddingTo = [string | null, (slug: string | null) => void];

const AddingToOrg = createContext<AddingTo>([null, () => {}]);

/** Holds the pick for as long as the person stays in the app. */
export function AddingProvider({ children }: { children: React.ReactNode }) {
  const [slug, pick] = useState<string | null>(null);
  return <AddingToOrg.Provider value={[slug, pick]}>{children}</AddingToOrg.Provider>;
}

/**
 * The slug the box is filing into, or null before the person picks one. A box
 * for a person in one org ignores it, because that org is implied.
 */
export function useAddingTo(): AddingTo {
  return useContext(AddingToOrg);
}
