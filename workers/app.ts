import { RouterContextProvider, createRequestHandler } from "react-router";

import { cloudflareEnv } from "../app/context.server";
import { refreshEveryField } from "../app/refs.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env) {
    const context = new RouterContextProvider();
    context.set(cloudflareEnv, env);
    return requestHandler(request, context);
  },

  /**
   * The scheduled refresh of every reference field. A picker reads the cache,
   * so this run is what keeps the cache close to what the org apps hold.
   *
   * The cron has no signed-in person, so it takes no scope. It reads no task
   * row, and each pull uses the refs key stored on the field row it read.
   */
  async scheduled(_event, env) {
    const refreshed = await refreshEveryField(env.DB);
    console.log("refs refresh", refreshed);
  },
} satisfies ExportedHandler<Env>;
