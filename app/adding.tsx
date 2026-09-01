/**
 * The org the cross-org quick-add box files into.
 *
 * The pick starts at the personal org every time a person opens Tusker, holds
 * while they stay in the app — the move from `/me` to `/me/plan` included —
 * and dies on a reload or in a new tab. That lifetime is what this state is:
 * it lives in the root layout, so nothing is stored and nothing expires.
 *
 * A task that lands in the personal org by accident is private. One that lands
 * in a team org by accident is on every member's board, and Tusker cannot move
 * a task between orgs. See ADR-0012.
 */

import { createContext, useContext, useState } from "react";

/** The slug the box files into, and the way to change it. Null is personal. */
type AddingTo = [string | null, (slug: string | null) => void];

const AddingToOrg = createContext<AddingTo>([null, () => {}]);

/** Holds the pick for as long as the person stays in the app. */
export function AddingProvider({ children }: { children: React.ReactNode }) {
  const [slug, pick] = useState<string | null>(null);
  return <AddingToOrg.Provider value={[slug, pick]}>{children}</AddingToOrg.Provider>;
}

/**
 * The slug the box is filing into, or null for the personal org. The box names
 * the personal org itself, because only the page knows which one it is.
 */
export function useAddingTo(): AddingTo {
  return useContext(AddingToOrg);
}
