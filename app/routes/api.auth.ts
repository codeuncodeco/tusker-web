import { createAuth } from "../auth.server";
import { cloudflareEnv } from "../context.server";
import type { Route } from "./+types/api.auth";

type Context = Route.LoaderArgs["context"];

/**
 * Every better-auth endpoint. The magic link lands here, and so does sign-out.
 * The sign-in route drives the other endpoints server-side, so that one mail
 * can carry both the link and the code.
 */
function handle(request: Request, context: Context) {
  const auth = createAuth(context.get(cloudflareEnv), request);
  return auth.handler(request);
}

export function loader({ request, context }: Route.LoaderArgs) {
  return handle(request, context);
}

export function action({ request, context }: Route.ActionArgs) {
  return handle(request, context);
}
