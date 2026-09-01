import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as boardRoute from "../app/routes/board";
import * as fieldsRoute from "../app/routes/fields";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as taskRoute from "../app/routes/task";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

beforeEach(wipe);

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

/** Ada with an org at /codeuncode, and Bo with one at /blrhikes. */
async function twoOrgs() {
  const ada = await member("ada@example.test", "Ada");
  const bo = await member("bo@example.test", "Bo");
  await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
  await send(newOrgRoute, "/orgs/new", bo.cookie, { name: "blrhikes", slug: "blrhikes" });
  return { ada, bo };
}

/** Declares one field for an org. */
function declare(
  slug: string,
  cookie: string,
  field: { label: string; type: string; options?: string; show_on_card?: string },
) {
  return send(
    fieldsRoute,
    `/o/${slug}/fields`,
    cookie,
    {
      intent: "declare",
      label: field.label,
      type: field.type,
      options: field.options ?? "",
      ...(field.show_on_card ? { show_on_card: field.show_on_card } : {}),
    },
    { slug },
  );
}

/** The manage screen for one org. */
function fieldsOf(slug: string, cookie: string) {
  return fieldsRoute.loader(routeArgs(get(`/o/${slug}/fields`, cookie), { slug }));
}

/** Adds a task to To do and answers its id. */
async function addTask(slug: string, cookie: string, title: string): Promise<string> {
  await send(boardRoute, `/o/${slug}/board`, cookie, { intent: "create", status: "todo", title }, { slug });
  const row = await db.prepare("SELECT id FROM tasks WHERE title = ?").bind(title).first<{ id: string }>();
  return row!.id;
}

/** The task editor for one task. */
function editor(slug: string, cookie: string, taskId: string) {
  return taskRoute.loader(routeArgs(get(`/o/${slug}/t/${taskId}`, cookie), { slug, taskId }));
}

/** A save from the task editor. */
function save(slug: string, cookie: string, taskId: string, fields: Record<string, string>) {
  return send(taskRoute, `/o/${slug}/t/${taskId}`, cookie, fields, { slug, taskId });
}

describe("declaring a field", () => {
  it("takes the key from the label, and lists the field", async () => {
    const { ada } = await twoOrgs();

    await declare("codeuncode", ada.cookie, { label: "Client name", type: "text" });

    const screen = await fieldsOf("codeuncode", ada.cookie);
    expect(screen.fields).toEqual([
      {
        key: "client_name",
        label: "Client name",
        type: "text",
        options: [],
        refs_path: "",
        refs_pulled_at: null,
        show_on_card: false,
        filterable: false,
        position: 1,
      },
    ]);
  });

  it("reads one option per line for a select", async () => {
    const { ada } = await twoOrgs();

    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug\nChore" });

    const screen = await fieldsOf("codeuncode", ada.cookie);
    expect(screen.fields[0].options).toEqual(["Bug", "Chore"]);
  });

  it("refuses a label the org already declared", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });

    const answer = await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });

    expect(answer).toEqual({ error: "This org already declares client." });
  });

  it("refuses a label with no letter or number", async () => {
    const { ada } = await twoOrgs();

    const answer = await declare("codeuncode", ada.cookie, { label: " -- ", type: "text" });

    expect(answer).toEqual({ error: "A field needs a label with a letter or a number." });
  });

  it("refuses a select that declares no option", async () => {
    const { ada } = await twoOrgs();

    const answer = await declare("codeuncode", ada.cookie, { label: "Kind", type: "select" });

    expect(answer).toEqual({ error: "A select needs at least one option." });
  });

  it("refuses a type Tusker does not render", async () => {
    const { ada } = await twoOrgs();

    const response = await caught(declare("codeuncode", ada.cookie, { label: "Shade", type: "colour" }));

    expect(response.status).toBe(400);
  });
});

describe("editing and removing a field", () => {
  it("changes the label, the options and the card flag, and keeps the key", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug" });

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "kind", label: "Work kind", options: "Bug\nChore", show_on_card: "1" },
      { slug: "codeuncode" },
    );

    const screen = await fieldsOf("codeuncode", ada.cookie);
    expect(screen.fields[0]).toMatchObject({
      key: "kind",
      label: "Work kind",
      options: ["Bug", "Chore"],
      show_on_card: true,
    });
  });

  it("refuses to leave a select with no option", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug" });

    const answer = await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "kind", label: "Kind", options: "  " },
      { slug: "codeuncode" },
    );

    expect(answer).toEqual({ error: "A select needs at least one option." });
    expect((await fieldsOf("codeuncode", ada.cookie)).fields[0].options).toEqual(["Bug"]);
  });

  it("empties the tasks that held an option the select dropped", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug\nChore" });
    const bug = await addTask("codeuncode", ada.cookie, "Fix the header");
    const chore = await addTask("codeuncode", ada.cookie, "Tidy the log");
    await save("codeuncode", ada.cookie, bug, { title: "Fix the header", "field.kind": "Bug" });
    await save("codeuncode", ada.cookie, chore, { title: "Tidy the log", "field.kind": "Chore" });

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "edit", key: "kind", label: "Kind", options: "Bug" },
      { slug: "codeuncode" },
    );

    expect((await editor("codeuncode", ada.cookie, bug)).task.data).toEqual({ kind: "Bug" });
    expect((await editor("codeuncode", ada.cookie, chore)).task.data).toEqual({});
  });

  it("answers 404 for a key the org does not declare", async () => {
    const { ada, bo } = await twoOrgs();
    await declare("blrhikes", bo.cookie, { label: "Trail name", type: "text" });

    const response = await caught(
      send(
        fieldsRoute,
        "/o/codeuncode/fields",
        ada.cookie,
        { intent: "edit", key: "trail_name", label: "Theirs" },
        { slug: "codeuncode" },
      ),
    );

    expect(response.status).toBe(404);
    expect((await fieldsOf("blrhikes", bo.cookie)).fields[0].label).toBe("Trail name");
  });

  it("removes the declaration and the values the tasks held for it", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");
    await save("codeuncode", ada.cookie, task, { title: "Write the brief", "field.client": "Acme" });

    await send(
      fieldsRoute,
      "/o/codeuncode/fields",
      ada.cookie,
      { intent: "remove", key: "client" },
      { slug: "codeuncode" },
    );

    expect((await fieldsOf("codeuncode", ada.cookie)).fields).toEqual([]);
    const row = await db.prepare("SELECT data FROM tasks WHERE id = ?").bind(task).first<{ data: string }>();
    expect(JSON.parse(row!.data)).toEqual({});
  });
});

describe("the task editor", () => {
  it("renders every declared field, and reads back what it wrote", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });
    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug\nChore" });
    await declare("codeuncode", ada.cookie, { label: "Ship by", type: "date" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    const answer = await save("codeuncode", ada.cookie, task, {
      title: "Write the brief",
      "field.client": "Acme",
      "field.kind": "Chore",
      "field.ship_by": "2026-08-31",
    });

    expect(answer).toEqual({ ok: true });
    const seen = await editor("codeuncode", ada.cookie, task);
    expect(seen.fields.map((one) => one.key)).toEqual(["client", "kind", "ship_by"]);
    expect(seen.task.data).toEqual({ client: "Acme", kind: "Chore", ship_by: "2026-08-31" });
  });

  it("writes the values to the JSON column, not to a column of their own", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    await save("codeuncode", ada.cookie, task, { title: "Write the brief", "field.client": "Acme" });

    const row = await db
      .prepare("SELECT json_extract(data, '$.client') AS client FROM tasks WHERE id = ?")
      .bind(task)
      .first<{ client: string }>();
    expect(row!.client).toBe("Acme");
  });

  it("clears a value when the box is left empty", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");
    await save("codeuncode", ada.cookie, task, { title: "Write the brief", "field.client": "Acme" });

    await save("codeuncode", ada.cookie, task, { title: "Write the brief", "field.client": "" });

    expect((await editor("codeuncode", ada.cookie, task)).task.data).toEqual({});
  });

  it("refuses a select value the field does not declare, and writes nothing", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Kind", type: "select", options: "Bug" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    const answer = await save("codeuncode", ada.cookie, task, {
      title: "Write the brief",
      "field.kind": "Epic",
    });

    expect(answer).toEqual({ error: "Kind does not hold Epic." });
    expect((await editor("codeuncode", ada.cookie, task)).task.data).toEqual({});
  });

  it("refuses a date the calendar does not hold", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Ship by", type: "date" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    const answer = await save("codeuncode", ada.cookie, task, {
      title: "Write the brief",
      "field.ship_by": "31/08/2026",
    });

    expect(answer).toEqual({ error: "Ship by takes a date, as 2026-08-31." });
  });

  it("answers 404 for a task another org holds", async () => {
    const { ada, bo } = await twoOrgs();
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    const response = await caught(editor("blrhikes", bo.cookie, task));

    expect(response.status).toBe(404);
  });
});

describe("the board card", () => {
  it("shows the fields the org marked for it, and no other one", async () => {
    const { ada } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text", show_on_card: "1" });
    await declare("codeuncode", ada.cookie, { label: "Note", type: "text" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");
    await save("codeuncode", ada.cookie, task, {
      title: "Write the brief",
      "field.client": "Acme",
      "field.note": "Later",
    });

    const board = await boardRoute.loader(
      routeArgs(get("/o/codeuncode/board", ada.cookie), { slug: "codeuncode" }),
    );

    const card = board.columns.find((one) => one.status === "todo")!.tasks[0];
    expect(card.fields).toEqual([{ key: "client", label: "Client", value: "Acme", color: null }]);
  });
});

describe("one org's fields", () => {
  it("never appear in another org", async () => {
    const { ada, bo } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });
    await declare("blrhikes", bo.cookie, { label: "Trail name", type: "text" });

    expect((await fieldsOf("codeuncode", ada.cookie)).fields.map((one) => one.key)).toEqual(["client"]);
    expect((await fieldsOf("blrhikes", bo.cookie)).fields.map((one) => one.key)).toEqual(["trail_name"]);
  });

  it("cannot be written to a task in another org", async () => {
    const { ada, bo } = await twoOrgs();
    await declare("blrhikes", bo.cookie, { label: "Trail name", type: "text" });
    const task = await addTask("codeuncode", ada.cookie, "Write the brief");

    await save("codeuncode", ada.cookie, task, {
      title: "Write the brief",
      "field.trail_name": "Kumara Parvatha",
    });

    expect((await editor("codeuncode", ada.cookie, task)).task.data).toEqual({});
  });

  it("answer 404 to a person the org does not hold", async () => {
    const { ada, bo } = await twoOrgs();
    await declare("codeuncode", ada.cookie, { label: "Client", type: "text" });

    expect((await caught(fieldsOf("codeuncode", bo.cookie))).status).toBe(404);
    expect(
      (await caught(declare("codeuncode", bo.cookie, { label: "Theirs", type: "text" }))).status,
    ).toBe(404);
    const { results } = await db.prepare("SELECT key FROM org_fields").all<{ key: string }>();
    expect(results.map((one) => one.key)).toEqual(["client"]);
  });
});
