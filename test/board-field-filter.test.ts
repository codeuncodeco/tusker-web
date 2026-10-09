import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import type { FieldType } from "../app/fields";
import * as boardRoute from "../app/routes/board";
import * as meRoute from "../app/routes/me";
import { member } from "./accounts";
import { get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const DAY = "2026-09-01";

beforeEach(wipe);

/** One declaration of the org, filterable unless the test says otherwise. */
async function declare(
  orgId: string,
  key: string,
  type: FieldType,
  { options = [] as string[], filterable = true } = {},
) {
  await db
    .prepare(
      `INSERT INTO org_fields (org_id, key, label, type, options, refs_path, filterable, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(orgId, key, key, type, JSON.stringify(options), type === "reference" ? key : "", Number(filterable))
    .run();
}

/** A task holding the values, placed by hand so a test can state its column. */
async function task(orgId: string, title: string, data: Record<string, string>, status: Status = "todo") {
  await db
    .prepare("INSERT INTO tasks (org_id, title, status, position, data) VALUES (?, ?, ?, 1, ?)")
    .bind(orgId, title, status, JSON.stringify(data))
    .run();
}

/** The board loader for one org, as its owner sees it. */
function board(slug: string, cookie: string, query = "") {
  return boardRoute.loader(
    routeArgs(get(`/o/${slug}/board${query}`, `${cookie}; day=${DAY}`), { slug }),
  );
}

/** Every title the board draws, whatever column holds it. */
function titles(data: Awaited<ReturnType<typeof board>>) {
  return data.columns.flatMap((column) => column.tasks.map((one) => one.title)).sort();
}

describe("narrowing the board by a field value", () => {
  it("keeps the tasks holding the value, and the counts follow", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await task(ada.org.id, "For Acme", { client: "Acme" });
    await task(ada.org.id, "For Globex", { client: "Globex" });
    await task(ada.org.id, "For nobody", {});

    const data = await board(ada.org.slug, ada.cookie, "?field.client=Acme");
    expect(titles(data)).toEqual(["For Acme"]);
    expect(data.columns.find((column) => column.status === "todo")!.tasks).toHaveLength(1);
  });

  it("narrows by a reference field's stored id", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "trail", "reference");
    await task(ada.org.id, "Book the bus", { trail: "skandagiri" });
    await task(ada.org.id, "Pack the tent", { trail: "nandi" });

    expect(titles(await board(ada.org.slug, ada.cookie, "?field.trail=nandi"))).toEqual([
      "Pack the tent",
    ]);
  });

  it("is AND with every other field filter, the search and the column switches", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await declare(ada.org.id, "trail", "reference");
    await task(ada.org.id, "Acme bus", { client: "Acme", trail: "nandi" });
    await task(ada.org.id, "Acme tent", { client: "Acme", trail: "nandi" });
    await task(ada.org.id, "Acme bus elsewhere", { client: "Acme", trail: "skandagiri" });
    await task(ada.org.id, "Globex bus", { client: "Globex", trail: "nandi" });
    await task(ada.org.id, "Acme bus, cancelled", { client: "Acme", trail: "nandi" }, "cancelled");

    const query = "?field.client=Acme&field.trail=nandi&q=bus";
    expect(titles(await board(ada.org.slug, ada.cookie, query))).toEqual(["Acme bus"]);
    expect(titles(await board(ada.org.slug, ada.cookie, `${query}&cancelled=1`))).toEqual([
      "Acme bus",
      "Acme bus, cancelled",
    ]);
  });

  it("ignores a value for a field the org does not mark filterable", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme"], filterable: false });
    await task(ada.org.id, "For Acme", { client: "Acme" });
    await task(ada.org.id, "For nobody", {});

    const data = await board(ada.org.slug, ada.cookie, "?field.client=Acme&field.gone=x");
    expect(titles(data)).toEqual(["For Acme", "For nobody"]);
    expect(data.filters).toEqual([]);
  });
});

describe("what the top row needs to draw the selects", () => {
  it("draws one select per filterable select or reference field, with its values", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Globex", "Acme"] });
    await declare(ada.org.id, "trail", "reference");
    await declare(ada.org.id, "note", "text");
    await declare(ada.org.id, "due", "date");
    await db.batch(
      [
        ["skandagiri", "Skandagiri"],
        ["nandi", "Nandi Hills"],
      ].map(([id, label]) =>
        db
          .prepare("INSERT INTO org_ref_options (org_id, field_key, ext_id, label) VALUES (?, ?, ?, ?)")
          .bind(ada.org.id, "trail", id, label),
      ),
    );

    const { filters } = await board(ada.org.slug, ada.cookie, "?field.trail=nandi");
    expect(filters).toEqual([
      {
        key: "client",
        label: "client",
        value: "",
        options: [
          { value: "Globex", label: "Globex" },
          { value: "Acme", label: "Acme" },
        ],
      },
      {
        key: "trail",
        label: "trail",
        value: "nandi",
        options: [
          { value: "nandi", label: "Nandi Hills" },
          { value: "skandagiri", label: "Skandagiri" },
        ],
      },
    ]);
  });

  it("offers the value the board narrows by, even where the list no longer holds it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "trail", "reference");

    const { filters } = await board(ada.org.slug, ada.cookie, "?field.trail=t-new");
    expect(filters[0].options).toEqual([{ value: "t-new", label: "t-new" }]);
  });
});

describe("the sweep under a field filter", () => {
  it("archives exactly the cards the filter left on screen", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await task(ada.org.id, "Acme, done", { client: "Acme" }, "done");
    await task(ada.org.id, "Globex, done", { client: "Globex" }, "done");

    const narrowed = await board(ada.org.slug, ada.cookie, "?field.client=Acme");
    const done = narrowed.columns.find((column) => column.status === "done")!;
    const request = post(`/o/${ada.org.slug}/board`, {
      intent: "archive",
      id: done.tasks.map((one) => String(one.id)),
    });
    request.headers.set("cookie", ada.cookie);
    await boardRoute.action(routeArgs(request, { slug: ada.org.slug }));

    expect(titles(await board(ada.org.slug, ada.cookie))).toEqual(["Globex, done"]);
  });
});

describe("the board scoped to All", () => {
  it("draws no field filter, because each org declares its own fields", async () => {
    const ada = await member("ada@example.test", "Ada");
    // A second org, because a person in one org always stands on its board.
    const bo = await member("bo@example.test", "Bo");
    await db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(bo.org.id, ada.person.id)
      .run();
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await task(ada.org.id, "For Acme", { client: "Acme" });
    await task(ada.org.id, "For Globex", { client: "Globex" });

    const data = await meRoute.loader(
      routeArgs(get("/me?field.client=Acme", `${ada.cookie}; day=${DAY}`)),
    );
    expect(JSON.stringify(data)).toContain("For Globex");
    expect(data).not.toHaveProperty("filters");
  });
});

/** An add from the org board's quick-add box, signed by the cookie. */
async function add(slug: string, cookie: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/board`, { intent: "create", status: "todo", ...fields });
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return boardRoute.action(routeArgs(request, { slug }));
}

describe("quick add under a field filter", () => {
  it("gives the new task each active field value", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await declare(ada.org.id, "trail", "reference");

    await add(ada.org.slug, ada.cookie, {
      title: "Book the bus",
      "field.client": "Acme",
      "field.trail": "nandi",
    });

    const query = "?field.client=Acme&field.trail=nandi";
    expect(titles(await board(ada.org.slug, ada.cookie, query))).toEqual(["Book the bus"]);
  });

  it("gives every line of a pasted list the same values", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });

    await add(ada.org.slug, ada.cookie, {
      title: "Book the bus\nPack the tent",
      "field.client": "Acme",
    });

    expect(titles(await board(ada.org.slug, ada.cookie, "?field.client=Acme"))).toEqual([
      "Book the bus",
      "Pack the tent",
    ]);
  });

  it("skips a value the task cannot take, and still makes the task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await declare(ada.org.id, "client", "select", { options: ["Acme", "Globex"] });
    await declare(ada.org.id, "stage", "select", { options: ["Draft"], filterable: false });

    const answer = await add(ada.org.slug, ada.cookie, {
      title: "Book the bus",
      "field.client": "Initech",
      "field.stage": "Draft",
      "field.gone": "x",
    });

    expect(answer).toEqual({ ok: true });
    expect(titles(await board(ada.org.slug, ada.cookie))).toEqual(["Book the bus"]);
    expect(titles(await board(ada.org.slug, ada.cookie, "?field.client=Initech"))).toEqual([]);
    // The stage is not a filter the board offers, so the add did not set it:
    // marked filterable now, the board finds no task holding it.
    await db.prepare("UPDATE org_fields SET filterable = 1 WHERE key = 'stage'").run();
    expect(titles(await board(ada.org.slug, ada.cookie, "?field.stage=Draft"))).toEqual([]);
  });
});
