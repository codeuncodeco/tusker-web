import { RouterContextProvider, createRequestHandler } from "react-router";

import { cloudflareEnv } from "../app/context.server";

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
} satisfies ExportedHandler<Env>;
