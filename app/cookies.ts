/** The value one cookie carries, or null when the request carries none. */
export function readCookie(request: Request, name: string): string | null {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
