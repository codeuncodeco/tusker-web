import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { clientValue, readClient } from "../app/client-filter";
import { clientsAcross, clientsOf } from "../app/clients.server";
import { setColors } from "../app/colors.server";
import { cardFields, shownOnCard } from "../app/fields";
import { declareField, listFields, markClientField } from "../app/fields.server";
import { filterableFields } from "../app/field-filter";
import * as meRoute from "../app/routes/me";
import { requireScope } from "../app/scope.server";
import { createTasks, saveTask } from "../app/tasks.server";
import { aside, member } from "./accounts";
import { get, routeArgs, wipe } from "./routes";

const DAY = "2026-09-01";

beforeEach(wipe);

/** Ada, her org with a client select and a priority, and her scope. */
async function studio() {
  const ada = await member("ada@example.test", "Ada");
  const scope = await requireScope(get(`/o/${ada.org.slug}`, ada.cookie), env, ada.org.slug);
  const field = { refs_path: "", show_on_card: false, filterable: false };
  await declareField(env.DB, scope, { ...field, key: "priority", label: "Priority", type: "select", options: ["High", "Low"], show_on_card: true });
  await declareField(env.DB, scope, { ...field, key: "client", label: "Client", type: "select", options: ["Acme", "Globex"] });
  await declareField(env.DB, scope, { ...field, key: "note", label: "Note", type: "text", options: [] });
  return { ada, scope };
}

describe("naming the client field", () => {
  it("marks one select or reference field, and only one", async () => {
    const { scope } = await studio();

    expect(await markClientField(env.DB, scope, "client")).toBe(true);
    expect((await listFields(env.DB, scope)).filter((one) => one.client).map((one) => one.key)).toEqual(["client"]);

    expect(await markClientField(env.DB, scope, "priority")).toBe(true);
    expect((await listFields(env.DB, scope)).filter((one) => one.client).map((one) => one.key)).toEqual(["priority"]);
  });

  it("refuses a text field, and a key the org does not declare, and changes nothing", async () => {
    const { scope } = await studio();
    await markClientField(env.DB, scope, "client");

    expect(await markClientField(env.DB, scope, "note")).toBe(false);
    expect(await markClientField(env.DB, scope, "gone")).toBe(false);
    expect((await listFields(env.DB, scope)).find((one) => one.client)?.key).toBe("client");
  });

  it("lets go of it for null", async () => {
    const { scope } = await studio();
    await markClientField(env.DB, scope, "client");

    await markClientField(env.DB, scope, null);
    expect((await listFields(env.DB, scope)).some((one) => one.client)).toBe(false);
  });

  it("draws first on a card and always filters, marked or not", async () => {
    const { scope } = await studio();
    await markClientField(env.DB, scope, "client");
    const fields = await listFields(env.DB, scope);

    expect(cardFields(fields).map((one) => one.key)).toEqual(["client", "priority"]);
    expect(filterableFields(fields).map((one) => one.key)).toEqual(["client"]);
    expect(shownOnCard(fields, { priority: "High", client: "Acme" })[0]).toMatchObject({
      key: "client",
      value: "Acme",
      client: { stored: "Acme" },
    });
  });
});

describe("an org's clients", () => {
  it("are the client field's options, each with its colour", async () => {
    const { scope } = await studio();
    await markClientField(env.DB, scope, "client");
    await setColors(env.DB, scope, "client", { Acme: "purple" });

    expect((await clientsOf(env.DB, scope))?.clients).toEqual([
      { value: "Acme", label: "Acme", color: "purple" },
      { value: "Globex", label: "Globex", color: null },
    ]);
  });

  it("are none for an org that names no client field", async () => {
    const { scope } = await studio();

    expect(await clientsOf(env.DB, scope)).toBeNull();
  });
});

describe("the unified board's client filter", () => {
  it("reads an org and a value from the address, and nothing from a half one", () => {
    expect(readClient(new URLSearchParams("client=studio:Acme"))).toEqual({ slug: "studio", value: "Acme" });
    expect(readClient(new URLSearchParams("client=studio:Mira: the press"))).toEqual({ slug: "studio", value: "Mira: the press" });
    for (const half of ["client=studio", "client=:Acme", "client=studio:", ""]) {
      expect(readClient(new URLSearchParams(half))).toBeNull();
    }
    expect(clientValue({ slug: "studio", value: "Acme" })).toBe("studio:Acme");
  });

  it("narrows the board to one client's tasks, and offers every client as a chip", async () => {
    const { ada, scope } = await studio();
    await aside(ada.person);
    await markClientField(env.DB, scope, "client");
    const [acme, globex, none] = await createTasks(env.DB, scope, { titles: ["For Acme", "For Globex", "For nobody"], status: "todo", assignees: [] });
    await saveTask(env.DB, scope, acme!, { title: "For Acme", data: { client: "Acme" }, decides: false, dueDate: null });
    await saveTask(env.DB, scope, globex!, { title: "For Globex", data: { client: "Globex" }, decides: false, dueDate: null });
    void none;

    const page = (query: string) => meRoute.loader(routeArgs(get(`/me?assignee=anyone${query}`, `${ada.cookie}; day=${DAY}`)));
    const titles = (data: Awaited<ReturnType<typeof page>>) => data.columns.flatMap((one) => one.tasks.map((task) => task.title)).sort();

    expect(titles(await page(`&client=${ada.org.slug}:Acme`))).toEqual(["For Acme"]);
    expect(titles(await page(""))).toEqual(["For Acme", "For Globex", "For nobody"]);
    // A client no org offers narrows nothing, so an old link still opens.
    expect(titles(await page(`&client=${ada.org.slug}:Initech`))).toEqual(["For Acme", "For Globex", "For nobody"]);

    const set = { orgs: [scope.org], personId: ada.person.id };
    expect((await clientsAcross(env.DB, set)).map((one) => clientValue(one))).toEqual([
      `${ada.org.slug}:Acme`,
      `${ada.org.slug}:Globex`,
    ]);
  });
});
