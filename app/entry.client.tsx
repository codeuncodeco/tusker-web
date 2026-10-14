// The sandbox's client entry. `main` has none and uses React Router's default.
// The browser database opens before the app hydrates, and every loader and
// action reads it through the same `cloudflareEnv` the Worker sets on `main`.
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { RouterContextProvider } from "react-router";
import { HydratedRouter } from "react-router/dom";

import { mountBadge } from "../sandbox/badge";
import { boot } from "../sandbox/boot";
import { cloudflareEnv } from "./context.server";

const env = await boot();

function getContext() {
  const context = new RouterContextProvider();
  context.set(cloudflareEnv, env);
  return context;
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter getContext={getContext} />
    </StrictMode>,
  );
});

mountBadge();
