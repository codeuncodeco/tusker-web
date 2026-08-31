/**
 * A path inside the app, so a redirect cannot be pointed at another site.
 *
 * The fallback is the account page. A person who signed in without asking for
 * a page lands where their orgs are.
 */
export function safeNext(value: unknown, fallback = "/account"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
