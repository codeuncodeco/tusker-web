/**
 * Where the colour scheme control sends a pick. With script, a fetcher posts
 * here and the page stays. With no script, the form also names the page to go
 * back to, and the reply redirects there. See #223.
 */

import { redirect } from "react-router";

import { colourSchemeCookie, isColourScheme } from "../colour-scheme";
import { safeNext } from "../paths";
import type { Route } from "./+types/colour-scheme";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const scheme = form.get("scheme");
  if (!isColourScheme(scheme)) throw new Response("No such colour scheme.", { status: 400 });

  const headers = { "Set-Cookie": colourSchemeCookie(scheme) };
  // The page to go back to comes from the form, so it passes the guard: a
  // crafted one lands on a page of this app and never off-site.
  const next = form.get("next");
  if (next !== null) throw redirect(safeNext(next), { headers });
  return Response.json({ scheme }, { headers });
}
