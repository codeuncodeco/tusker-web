/** A path inside the app, so a redirect cannot be pointed at another site. */
export function safeNext(value: unknown, fallback = "/me"): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
