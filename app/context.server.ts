import { createContext } from "react-router";

/**
 * The Worker's bindings, put on the router context by `workers/app.ts`.
 * Loaders and actions read the D1 binding through this.
 */
export const cloudflareEnv = createContext<Env>();
