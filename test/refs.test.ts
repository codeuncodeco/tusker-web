import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { readRefOptions } from "../app/refs";
import { refreshEveryField } from "../app/refs.server";
import * as boardRoute from "../app/routes/board";
import * as fieldsRoute from "../app/routes/fields";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as taskRoute from "../app/routes/task";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const TRAILS = "https://blrhikes.test/api/tusker/refs/trails";

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

/** Ada, with an org at /codeuncode. */
async function anOrg() {
  const ada = await member("ada@example.test", "Ada");
  await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
  return ada;
}

/** Declares a reference field named Trail, pointing at the blrhikes endpoint. */
function declareTrail(
  cookie: string,
  over: { label?: string; source_url?: string; refs_key?: string; show_on_card?: string } = {},
) {
  return send(
    fieldsRoute,
    "/o/codeuncode/fields",
    cookie,
    {
      intent: "declare",
      label: over.label ?? "Trail",
      type: "reference",
      source_url: over.source_url ?? TRAILS,
      refs_key: over.refs_key ?? "minted-by-blrhikes",
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

describe("declaring a reference field", () => {
  it("stores the source URL and the key the org app minted", async () => {
    const ada = await anOrg();

    await declareTrail(ada.cookie);

    const row = await db
      .prepare("SELECT type, source_url, refs_key FROM org_fields WHERE key = 'trail'")
      .first<{ type: string; source_url: string; refs_key: string }>();
    expect(row).toEqual({ type: "reference", source_url: TRAILS, refs_key: "minted-by-blrhikes" });
  });

  it("refuses a source URL that is not an absolute http URL", async () => {
    const ada = await anOrg();

    const answer = await declareTrail(ada.cookie, { source_url: "/api/tusker/refs/trails" });

    expect(answer).toEqual({
      error: "A reference needs a source URL, as https://blrhikes.example/api.",
    });
  });

  it("stores no source URL or key on a type that reads neither", async () => {
    const ada = await anOrg();

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      {
        intent: "declare",
        label: "Client",
        type: "text",
        options: "",
        source_url: TRAILS,
        refs_key: "typed-in-the-wrong-box",
      },
      { slug: "codeuncode" },
    );

    const row = await db
      .prepare("SELECT source_url, refs_key FROM org_fields WHERE key = 'client'")
      .first<{ source_url: string; refs_key: string }>();
    expect(row).toEqual({ source_url: "", refs_key: "" });
  });

  it("refuses a reference that carries no refs key", async () => {
    const ada = await anOrg();

    const answer = await declareTrail(ada.cookie, { refs_key: "" });

    expect(answer).toEqual({
      error: "A reference needs the refs key the org app minted for it.",
    });
  });
});

describe("the refs key", () => {
  it("never reaches a screen, on the fields loader or the task editor", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ options: KUMARA });
    await refresh(ada.cookie);
    const task = await addTask(ada.cookie, "Walk Kumara");

    const screen = await fieldsOf(ada.cookie);
    const edit = await editor(ada.cookie, task);

    expect(JSON.stringify(screen)).not.toContain("minted-by-blrhikes");
    expect(JSON.stringify(edit)).not.toContain("minted-by-blrhikes");
    // The screen says a key is there, without saying what it is.
    expect(screen.fields[0].has_refs_key).toBe(true);
  });

  it("cannot be edited away from a field that holds none", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    // A field left keyless, as a row written before this screen demanded one.
    await db.prepare("UPDATE org_fields SET refs_key = '' WHERE key = 'trail'").run();

    const answer = await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "trail", label: "Hike", source_url: TRAILS, refs_key: "" },
      { slug: "codeuncode" },
    );

    expect(answer).toEqual({
      error: "A reference needs the refs key the org app minted for it.",
    });
  });

  it("is kept when an edit leaves the box empty, and replaced when it does not", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "trail", label: "Hike", source_url: TRAILS, refs_key: "" },
      { slug: "codeuncode" },
    );
    expect(await keyOf("trail")).toBe("minted-by-blrhikes");

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "trail", label: "Hike", source_url: TRAILS, refs_key: "minted-again" },
      { slug: "codeuncode" },
    );
    expect(await keyOf("trail")).toBe("minted-again");
  });
});

/** The key the row holds, read straight from the table. */
async function keyOf(key: string): Promise<string> {
  const row = await db
    .prepare("SELECT refs_key FROM org_fields WHERE key = ?")
    .bind(key)
    .first<{ refs_key: string }>();
  return row!.refs_key;
}

describe("the manual refresh", () => {
  it("sends the field's own refs key, and caches what came back", async () => {
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
  it("sends each field its own key, and no key to another field's URL", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    await declareTrail(ada.cookie, {
      label: "Event",
      source_url: "https://blrhikes.test/api/tusker/refs/events",
      refs_key: "minted-for-events",
    });
    const calls = orgApp({ options: KUMARA });

    const refreshed = await refreshEveryField(db);

    expect(refreshed).toEqual({ fields: 2, failed: 0 });
    expect(calls).toEqual([
      { url: TRAILS, key: "minted-by-blrhikes" },
      { url: "https://blrhikes.test/api/tusker/refs/events", key: "minted-for-events" },
    ]);
  });

  it("counts a field the org app refused, and pulls the rest", async () => {
    const ada = await anOrg();
    await declareTrail(ada.cookie);
    orgApp({ status: 401 });

    expect(await refreshEveryField(db)).toEqual({ fields: 1, failed: 1 });
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
