/**
 * A path inside the app, so a redirect cannot be pointed at another site.
 *
 * The fallback is the unified board. A person who signed in without asking for
 * a page lands on their work, the same answer `/` gives.
 */
export function safeNext(value: unknown, fallback = "/me"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
