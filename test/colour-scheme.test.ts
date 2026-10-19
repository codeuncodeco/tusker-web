import { describe, expect, it } from "vitest";

import { colourSchemeOf, nextScheme } from "../app/colour-scheme";
import * as colourSchemeRoute from "../app/routes/colour-scheme";
import { caught, cookieFrom, get, post, routeArgs } from "./routes";

/** A pick as the control sends it, with or without the page to go back to. */
function pick(fields: Record<string, string>) {
  return caught(colourSchemeRoute.action(routeArgs(post("/colour-scheme", fields))));
}

describe("the colour scheme a request reads", () => {
  it("is the pick the cookie holds", () => {
    expect(colourSchemeOf(get("/me", "colour-scheme=dark"))).toBe("dark");
    expect(colourSchemeOf(get("/me", "day=2026-10-13; colour-scheme=light"))).toBe("light");
  });

  it("is System with no cookie", () => {
    expect(colourSchemeOf(get("/me"))).toBe("system");
  });

  it("is System for any value other than light or dark", () => {
    expect(colourSchemeOf(get("/me", "colour-scheme=purple"))).toBe("system");
    expect(colourSchemeOf(get("/me", "colour-scheme="))).toBe("system");
  });
});

describe("the next colour scheme", () => {
  it("steps Light to Dark to System, and back to Light", () => {
    expect(nextScheme("light")).toBe("dark");
    expect(nextScheme("dark")).toBe("system");
    expect(nextScheme("system")).toBe("light");
  });
});

describe("picking a colour scheme", () => {
  it("holds Dark for a year, for every page of the site", async () => {
    const response = await pick({ scheme: "dark" });

    expect(response.status).toBe(200);
    expect(colourSchemeOf(get("/me", cookieFrom(response)))).toBe("dark");
    const cookie = response.headers.getSetCookie()[0]!.toLowerCase();
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("samesite=lax");
  });

  it("deletes the cookie for System, so no cookie and System are one", async () => {
    const response = await pick({ scheme: "system" });

    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie()[0]!.toLowerCase();
    expect(cookie).toMatch(/^colour-scheme=;/);
    expect(cookie).toContain("max-age=0");
    expect(cookie).toContain("path=/");
  });

  it("answers 400 to anything outside the three, and sets no cookie", async () => {
    const sent: Record<string, string>[] = [{ scheme: "purple" }, { scheme: "" }, {}];
    for (const fields of sent) {
      const response = await pick(fields);

      expect(response.status).toBe(400);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("lands a browser with no script back on the page it stood on", async () => {
    const response = await pick({ scheme: "light", next: "/o/acme/board?due=today" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/o/acme/board?due=today");
    expect(colourSchemeOf(get("/me", cookieFrom(response)))).toBe("light");
  });

  it("never lands a browser off the site", async () => {
    for (const next of ["//evil.example", "/\\evil.example", "https://evil.example/", "evil"]) {
      const response = await pick({ scheme: "dark", next });

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/me");
    }
  });
});
