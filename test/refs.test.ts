import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { isRefsPath, readRefOptions, refsUrl } from "../app/refs";
import { refreshEveryField } from "../app/refs.server";
import * as boardRoute from "../app/routes/board";
import * as fieldsRoute from "../app/routes/fields";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as settingsRoute from "../app/routes/settings";
import * as taskRoute from "../app/routes/task";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const BASE = "https://blrhikes.test/api/tusker/refs";
const TRAILS = `${BASE}/trails`;

beforeEach(wipe);
afterEach(() => vi.unstubAllGlobals());

/** One call the org app saw: where it went, and what key it carried. */
type Call = { url: string; key: string | null };

/**
 * Answers every refs call with `options`, and records what each call carried.
 * A status other than 200 stands in for a revoked key.
 */
function orgApp(answer: { options?: unknown; status?: number } = {}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization");
    calls.push({ url, key: authorization?.replace(/^Bearer /, "") ?? null });
    return new Response(JSON.stringify(answer.options ?? []), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { person, cookie: cookieFrom(response) };
}

/** A post to a route action, signed by the cookie. */
function send(
  route: { action: (args: never) => unknown },
  path: string,
  cookie: string,
  fields: Record<string, string>,
  params: Record<string, string> = {},
): Promise<unknown> {
  const request = post(path, fields);
  request.headers.set("cookie", cookie);
  return Promise.resolve(route.action(routeArgs(request, params)));
}

/** Ada, with an org at /codeuncode that names the blrhikes org app. */
async function anOrg({ app = true }: { app?: boolean } = {}) {
  const ada = await member("ada@example.test", "Ada");
  await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
  if (app) await setOrgApp(ada.cookie);
  return ada;
}

/** The org app form on the settings screen. */
function setOrgApp(
  cookie: string,
  over: { refs_base_url?: string; refs_key?: string } = {},
) {
  return send(
    settingsRoute,
    "/o/codeuncode/settings",
    cookie,
    {
      intent: "org-app",
      refs_base_url: over.refs_base_url ?? BASE,
      refs_key: over.refs_key ?? "minted-by-blrhikes",
    },
    { slug: "codeuncode" },
  );
}

/** The settings screen. */
function settingsOf(cookie: string) {
  return settingsRoute.loader(
    routeArgs(get("/o/codeuncode/settings", cookie), { slug: "codeuncode" }),
  );
}

/** Declares a reference field named Trail, naming the trails list. */
function declareTrail(
  cookie: string,
  over: { label?: string; refs_path?: string; show_on_card?: string } = {},
) {
  return send(
    fieldsRoute,
    "/o/codeuncode/fields",
    cookie,
    {
      intent: "declare",
      label: over.label ?? "Trail",
      type: "reference",
      refs_path: over.refs_path ?? "trails",
      ...(over.show_on_card ? { show_on_card: over.show_on_card } : {}),
    },
    { slug: "codeuncode" },
  );
}

/** The manual refresh on the fields screen. */
function refresh(cookie: string, key = "trail") {
  return send(fieldsRoute, "/o/codeuncode/fields", cookie, { intent: "refresh", key }, { slug: "codeuncode" });
}

/** The fields screen. */
function fieldsOf(cookie: string) {
  return fieldsRoute.loader(routeArgs(get("/o/codeuncode/fields", cookie), { slug: "codeuncode" }));
}

/** Adds a task to To do and answers its id. */
async function addTask(cookie: string, title: string): Promise<string> {
  await send(
    boardRoute,
    "/o/codeuncode/board",
    cookie,
    { intent: "create", status: "todo", title },
    { slug: "codeuncode" },
  );
  const row = await db.prepare("SELECT id FROM tasks WHERE title = ?").bind(title).first<{ id: string }>();
  return row!.id;
}

/** The task editor for one task. */
function editor(cookie: string, taskId: string) {
  return taskRoute.loader(
    routeArgs(get(`/o/codeuncode/t/${taskId}`, cookie), { slug: "codeuncode", taskId }),
  );
}

/** A save from the task editor. */
function save(cookie: string, taskId: string, fields: Record<string, string>) {
  return send(taskRoute, `/o/codeuncode/t/${taskId}`, cookie, fields, {
    slug: "codeuncode",
    taskId,
  });
}

const KUMARA = [{ id: "t1", label: "Kumara Parvatha" }];

describe("what an org app answers with", () => {
  it("reads {id, label} rows, and a numbered id as text", () => {
    expect(readRefOptions([{ id: 7, label: "Skandagiri" }])).toEqual([{ id: "7", label: "Skandagiri" }]);
  });

  it("refuses anything that is not a list of {id, label}", () => {
    expect(readRefOptions({ trails: [] })).toBeNull();
    expect(readRefOptions([{ id: "t1" }])).toBeNull();
    expect(readRefOptions([{ id: "t1", label: 3 }])).toBeNull();
    expect(readRefOptions(["t1"])).toBeNull();
  });
});

describe("the refs path and the base URL", () => {
  it("takes a bare segment, and refuses anything that could move the host", () => {
    expect(isRefsPath("trails")).toBe(true);
    expect(isRefsPath("v2/trails")).toBe(true);

    expect(isRefsPath("")).toBe(false);
    expect(isRefsPath("https://elsewhere.test/trails")).toBe(false);
    expect(isRefsPath("//elsewhere.test/trails")).toBe(false);
    expect(isRefsPath("/trails")).toBe(false);
    expect(isRefsPath("../../trails")).toBe(false);
    expect(isRefsPath("a/../../trails")).toBe(false);
  });

  it("joins the base and the path, and answers null when the pair makes no URL", () => {
    expect(refsUrl(BASE, "trails")).toBe(TRAILS);
    expect(refsUrl(`${BASE}/`, "trails")).toBe(TRAILS);

    expect(refsUrl("", "trails")).toBeNull();
    expect(refsUrl("blrhikes.test/refs", "trails")).toBeNull();
    expect(refsUrl(BASE, "../../../evil")).toBeNull();
    expect(refsUrl(BASE, "https://elsewhere.test/trails")).toBeNull();
  });
});

describe("the org app", () => {
  it("holds the base URL and the key, and the key never reaches a screen", async () => {
    const ada = await anOrg();

    const screen = await settingsOf(ada.cookie);

    expect(screen.app).toEqual({ refs_base_url: BASE, has_refs_key: true });
    expect(JSON.stringify(screen)).not.toContain("minted-by-blrhikes");
  });

  it("refuses a base URL that is not an absolute http URL", async () => {
    const ada = await anOrg({ app: false });

    const answer = await setOrgApp(ada.cookie, { refs_base_url: "/api/tusker/refs" });

    expect(answer).toEqual({
      appError: "An org app needs a base URL, as https://blrhikes.example/api/tusker/refs.",
    });
  });

  it("refuses a first save that pastes no key", async () => {
    const ada = await anOrg({ app: false });

    const answer = await setOrgApp(ada.cookie, { refs_key: "" });

    expect(answer).toEqual({ appError: "Paste the refs key the org app minted for this org." });
  });

  it("keeps the key when a later save leaves the box empty, and replaces it when it does not", async () => {
    const ada = await anOrg();
    orgApp({ options: KUMARA });

    await setOrgApp(ada.cookie, { refs_key: "" });
    expect(await orgKey()).toBe("minted-by-blrhikes");

    await setOrgApp(ada.cookie, { refs_key: "minted-again" });
    expect(await orgKey()).toBe("minted-again");
  });

  it("rotates every reference field with one paste, and says how many pulled", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    await declareTrail(ada.cookie, { label: "Event", refs_path: "events" });
    const calls = orgApp({ options: KUMARA });

    const answer = await setOrgApp(ada.cookie, { refs_key: "minted-again" });

    expect(answer).toEqual({ app: { fields: 2, failed: 0 } });
    expect(calls).toEqual([
      { url: TRAILS, key: "minted-again" },
      { url: `${BASE}/events`, key: "minted-again" },
    ]);
  });

  it("counts the field the org app refused, so half a rotation is not silent", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ status: 401 });

    expect(await setOrgApp(ada.cookie, { refs_key: "wrong" })).toEqual({
      app: { fields: 1, failed: 1 },
    });
  });
});

describe("the refs key", () => {
  it("never reaches a screen, on settings, on the fields loader or on the task editor", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk Kumara");

    const screens = [await settingsOf(ada.cookie), await fieldsOf(ada.cookie), await editor(ada.cookie, task)];

    for (const screen of screens) expect(JSON.stringify(screen)).not.toContain("minted-by-blrhikes");
  });
});

/** The key the org row holds, read straight from the table. */
async function orgKey(): Promise<string> {
  const row = await db
    .prepare("SELECT refs_key FROM orgs WHERE slug = 'codeuncode'")
    .first<{ refs_key: string }>();
  return row!.refs_key;
}

describe("declaring a reference field", () => {
  it("stores the path, and nothing about where the org app lives", async () => {
    const ada = await anOrg();

    await declareTrail(ada.cookie);

    const row = await db
      .prepare("SELECT type, refs_path FROM org_fields WHERE key = 'trail'")
      .first<{ type: string; refs_path: string }>();
    expect(row).toEqual({ type: "reference", refs_path: "trails" });
  });

  it("refuses a path that carries a host of its own", async () => {
    const ada = await anOrg();

    const answer = await declareTrail(ada.cookie, { refs_path: "https://elsewhere.test/trails" });

    expect(answer).toEqual({
      error: "A reference needs a refs path, as trails. It sits under the org app's base URL.",
    });
  });

  it("refuses a reference while the org names no org app", async () => {
    const ada = await anOrg({ app: false });

    const answer = await declareTrail(ada.cookie);

    expect(answer).toEqual({
      error: "This org names no org app yet. Set its base URL and key in settings.",
    });
  });

  it("stores no path on a type that reads none", async () => {
    const ada = await anOrg();

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "declare", label: "Client", type: "text", options: "", refs_path: "trails" },
      { slug: "codeuncode" },
    );

    const row = await db
      .prepare("SELECT refs_path FROM org_fields WHERE key = 'client'")
      .first<{ refs_path: string }>();
    expect(row).toEqual({ refs_path: "" });
  });
});

describe("the manual refresh", () => {
  it("sends the org's refs key to the joined URL, and caches what came back", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    const calls = orgApp({ options: KUMARA });

    const answer = await refresh(ada.cookie);

    expect(answer).toEqual({ ok: true, pulled: 1 });
    expect(calls).toEqual([{ url: TRAILS, key: "minted-by-blrhikes" }]);
    const { results } = await db
      .prepare("SELECT ext_id, label FROM org_ref_options WHERE field_key = 'trail'")
      .all<{ ext_id: string; label: string }>();
    expect(results).toEqual([{ ext_id: "t1", label: "Kumara Parvatha" }]);
  });

  it("replaces the cache whole, so a record the org app dropped leaves the picker", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: [...KUMARA, { id: "t2", label: "Skandagiri" }] });
    await refresh(ada.cookie);

    orgApp({ options: KUMARA });
    await refresh(ada.cookie);

    const screen = await fieldsOf(ada.cookie);
    expect(screen.cached).toEqual({ trail: 1 });
  });

  it("reports a revoked key, and keeps the last good list", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);

    orgApp({ status: 401 });
    const answer = await refresh(ada.cookie);

    expect(answer).toEqual({ error: "Trail: The org app answered 401." });
    expect((await fieldsOf(ada.cookie)).cached).toEqual({ trail: 1 });
  });

  it("caches nothing when the org app answers rows Tusker cannot read", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: { trails: [] } });

    const answer = await refresh(ada.cookie);

    expect(answer).toEqual({ error: "Trail: The org app answered rows that are not {id, label}." });
    expect((await fieldsOf(ada.cookie)).fields[0].refs_pulled_at).toBeNull();
  });
});

describe("the scheduled refresh", () => {
  it("sends each org's key to each of its lists, and to no other host", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    await declareTrail(ada.cookie, { label: "Event", refs_path: "events" });
    const calls = orgApp({ options: KUMARA });

    const refreshed = await refreshEveryField(db);

    expect(refreshed).toEqual({ fields: 2, failed: 0 });
    expect(calls).toEqual([
      { url: TRAILS, key: "minted-by-blrhikes" },
      { url: `${BASE}/events`, key: "minted-by-blrhikes" },
    ]);
  });

  it("counts a field the org app refused, and pulls the rest", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ status: 401 });

    expect(await refreshEveryField(db)).toEqual({ fields: 1, failed: 1 });
  });

  it("skips an org that names no org app, rather than failing it every run", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    await db.prepare("UPDATE orgs SET refs_base_url = '' WHERE slug = 'codeuncode'").run();
    const calls = orgApp({ options: KUMARA });

    expect(await refreshEveryField(db)).toEqual({ fields: 0, failed: 0 });
    expect(calls).toEqual([]);
  });
});

describe("a pull with no org app", () => {
  it("says which screen fixes it", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    await db.prepare("UPDATE orgs SET refs_base_url = '' WHERE slug = 'codeuncode'").run();

    expect(await refresh(ada.cookie)).toEqual({
      error: "Trail: This org names no org app. Set one in settings.",
    });
  });
});

describe("the picker", () => {
  it("shows an id box until a pull has answered", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    const task = await addTask(ada.cookie, "Walk Kumara");

    const edit = await editor(ada.cookie, task);

    expect(edit.refs.trail).toEqual({ options: [], pulled: false, label: null });
  });

  it("lists the cached options, and stores the external id on the task", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk Kumara");

    await save(ada.cookie, task, { title: "Walk Kumara", "field.trail": "t1" });

    const edit = await editor(ada.cookie, task);
    expect(edit.task.data).toEqual({ trail: "t1" });
    expect(edit.refs.trail).toEqual({ options: KUMARA, pulled: true, label: "Kumara Parvatha" });
  });

  it("is empty, not full of options, when the org app answered an empty list", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: [] });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk Kumara");

    const edit = await editor(ada.cookie, task);

    // Pulled, so the screen says "no trails" rather than "refresh first".
    expect(edit.refs.trail).toEqual({ options: [], pulled: true, label: null });
  });
});

describe("an id the cache does not hold", () => {
  it("resolves through one live lookup", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk the new one");
    await save(ada.cookie, task, { title: "Walk the new one", "field.trail": "t9" });

    // The org app made t9 after the last pull.
    const calls = orgApp({ options: [...KUMARA, { id: "t9", label: "Kodachadri" }] });
    const edit = await editor(ada.cookie, task);

    expect(calls).toEqual([{ url: TRAILS, key: "minted-by-blrhikes" }]);
    expect(edit.refs.trail.label).toBe("Kodachadri");
    expect(edit.refs.trail.options).toContainEqual({ id: "t9", label: "Kodachadri" });
  });

  it("renders raw when the org app does not know it either", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk a ghost");
    await save(ada.cookie, task, { title: "Walk a ghost", "field.trail": "gone" });

    const edit = await editor(ada.cookie, task);

    expect(edit.refs.trail.label).toBeNull();
    expect(edit.task.data).toEqual({ trail: "gone" });
  });

  it("is looked up once, not on every load of the task", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk a ghost");
    await save(ada.cookie, task, { title: "Walk a ghost", "field.trail": "gone" });

    const calls = orgApp({ options: KUMARA });
    await editor(ada.cookie, task);
    await editor(ada.cookie, task);
    await editor(ada.cookie, task);

    expect(calls).toHaveLength(1);
  });

  it("never shows the miss as an option a person can pick", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk a ghost");
    await save(ada.cookie, task, { title: "Walk a ghost", "field.trail": "gone" });
    orgApp({ options: KUMARA });

    const edit = await editor(ada.cookie, task);

    expect(edit.refs.trail.options).toEqual(KUMARA);
    expect((await fieldsOf(ada.cookie)).cached).toEqual({ trail: 1 });
  });

  it("gets another chance after the next pull", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk the new one");
    await save(ada.cookie, task, { title: "Walk the new one", "field.trail": "t9" });
    orgApp({ options: KUMARA });
    await editor(ada.cookie, task);

    // The org app made t9 after the miss, and the cron picks it up.
    orgApp({ options: [...KUMARA, { id: "t9", label: "Kodachadri" }] });
    await refreshEveryField(db);

    expect((await editor(ada.cookie, task)).refs.trail.label).toBe("Kodachadri");
  });
});

describe("the board card", () => {
  it("shows the label for the stored id, and the raw id on a cache miss", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie, { show_on_card: "1" });
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const named = await addTask(ada.cookie, "Walk Kumara");
    const unknown = await addTask(ada.cookie, "Walk a ghost");
    await save(ada.cookie, named, { title: "Walk Kumara", "field.trail": "t1" });
    await save(ada.cookie, unknown, { title: "Walk a ghost", "field.trail": "gone" });

    const board = await boardRoute.loader(
      routeArgs(get("/o/codeuncode/board", ada.cookie), { slug: "codeuncode" }),
    );

    const cards = board.columns.find((one) => one.status === "todo")!.tasks;
    const shown = Object.fromEntries(cards.map((card) => [card.title, card.fields[0].value]));
    expect(shown).toEqual({ "Walk Kumara": "Kumara Parvatha", "Walk a ghost": "gone" });
  });
});

describe("removing a reference field", () => {
  it("drops the options it had cached", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "remove", key: "trail" },
      { slug: "codeuncode" },
    );

    const left = await db
      .prepare("SELECT count(*) AS n FROM org_ref_options")
      .first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});
