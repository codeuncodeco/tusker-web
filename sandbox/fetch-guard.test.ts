import initSqlJs from "sql.js";
import { describe, expect, it, vi } from "vitest";

import { openDatabase } from "./database";
import { guardFetch } from "./fetch-guard";
import { ORG_APP_URL } from "./seed";

const SQL = await initSqlJs();
const ORIGIN = "https://sandbox.test";

async function guarded() {
  let text: string | null = null;
  const { db } = await openDatabase(SQL, { load: () => text, save: (t) => (text = t), clear: () => (text = null) });
  const real = vi.fn(async () => new Response("asset"));
  return { fetch: guardFetch(db, ORIGIN, real as unknown as typeof fetch), real };
}

describe("the fetch guard", () => {
  it("lets a request to the page's own origin through", async () => {
    const { fetch, real } = await guarded();
    expect(await (await fetch("/assets/sql-wasm.wasm")).text()).toBe("asset");
    expect(real).toHaveBeenCalledOnce();
  });

  it("answers an org app's refs list from the cache", async () => {
    const { fetch, real } = await guarded();
    const response = await fetch(`${ORG_APP_URL}/projects`);
    expect(await response.json()).toContainEqual({ id: "zine", label: "Zine, issue 4" });
    expect(real).not.toHaveBeenCalled();
  });

  it("refuses every other address, as an org app that does not answer", async () => {
    const { fetch, real } = await guarded();
    await expect(fetch("https://api.resend.com/emails")).rejects.toThrow(TypeError);
    expect(real).not.toHaveBeenCalled();
  });
});
