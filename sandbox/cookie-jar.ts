/**
 * Gives a `Set-Cookie` the app writes into a response to the browser.
 *
 * On `main` the server's response sets the cookie. In the sandbox the response
 * never leaves the page, and a browser drops `Set-Cookie` from a `Response` it
 * builds. So every response built here hands its cookies to `document.cookie`
 * first. The colour scheme pick is the cookie this keeps.
 */

export function keepResponseCookies() {
  const Real = globalThis.Response;

  globalThis.Response = new Proxy(Real, {
    construct(target, args: ConstructorParameters<typeof Response>) {
      keep(args[1]?.headers);
      return Reflect.construct(target, args);
    },
    get(target, name, receiver) {
      if (name === "json") {
        return (data: unknown, init?: ResponseInit) => {
          keep(init?.headers);
          return target.json(data, init);
        };
      }
      return Reflect.get(target, name, receiver);
    },
  });
}

function keep(headers: HeadersInit | undefined) {
  if (!headers) return;
  // A free-standing `Headers` keeps `Set-Cookie`, where a response's drops it.
  for (const cookie of new Headers(headers).getSetCookie()) {
    // A script cannot write an HttpOnly cookie, and the app's are session ones.
    if (/;\s*httponly/i.test(cookie)) continue;
    document.cookie = cookie;
  }
}
