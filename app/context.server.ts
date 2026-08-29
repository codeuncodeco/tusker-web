import { createContext } from "react-router";

/**
 * The Cloudflare bindings and request lifecycle, put on the router context by
 * the Worker entry. Loaders and actions read the D1 binding through this.
 */
export type CloudflareContext = {
  env: Env;
  ctx: ExecutionContext;
};

export const cloudflareContext = createContext<CloudflareContext>();
