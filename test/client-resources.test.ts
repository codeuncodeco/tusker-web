import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addLink,
  addNote,
  countsByClient,
  deleteResource,
  editResource,
  listResources,
  openTasksOf,
  tickNote,
} from "../app/client-resources.server";
import { declareField, markClientField } from "../app/fields.server";
import * as clientRoute from "../app/routes/client";
import { requireScope } from "../app/scope.server";
import { createTasks, saveTask } from "../app/tasks.server";
import { member } from "./accounts";
import { caught, get, routeArgs, wipe } from "./routes";

beforeEach(wipe);

/** A person, their org with a client field, and their scope. */
async function agency(email = "ada@example.test", name = "Ada") {
  const ada = await member(email, name);
  const scope = await requireScope(get(`/o/${ada.org.slug}`, ada.cookie), env, ada.org.slug);
  await declareField(env.DB, scope, {
    key: "client",
    label: "Client",
    type: "select",
    options: ["Acme", "Globex"],
    refs_path: "",
    show_on_card: true,
    filterable: false,
  });
  await markClientField(env.DB, scope, "client");
  return { ada, scope };
}

describe("a client's links", () => {
  it("are kept with a title read from the address, or the one given", async () => {
    const { scope } = await agency();

    await addLink(env.DB, scope, "Acme", { url: "https://www.figma.com/design/k/Logo-Ideas" });
    await addLink(env.DB, scope, "Acme", { url: "docs.google.com/document/d/1", title: "  The brief " });

    const { links } = await listResources(env.DB, scope, "Acme");
    expect(links.map((one) => [one.title, one.kind, one.host])).toEqual([
      ["Logo Ideas", "figma", "figma.com"],
      ["The brief", "google-doc", "docs.google.com"],
    ]);
  });

  it("refuse anything that is not an http(s) address", async () => {
    const { scope } = await agency();

    expect(await addLink(env.DB, scope, "Acme", { url: "javascript:alert(1)" })).toHaveProperty("error");
    expect((await listResources(env.DB, scope, "Acme")).links).toEqual([]);
  });

  it("belong to one client and one org", async () => {
    const { scope } = await agency();
    const { scope: theirs } = await agency("bo@example.test", "Bo");
    const { id } = (await addLink(env.DB, scope, "Acme", { url: "https://example.com" })) as { id: string };

    expect((await listResources(env.DB, scope, "Globex")).links).toEqual([]);
    expect((await listResources(env.DB, theirs, "Acme")).links).toEqual([]);
    expect(await deleteResource(env.DB, theirs, id)).toBe(false);
    expect(await editResource(env.DB, theirs, id, { title: "Mine now" })).toBe(false);
    expect((await listResources(env.DB, scope, "Acme")).links[0]?.title).toBe("example.com");
  });
});

describe("a client's meeting notes", () => {
  it("start on the day named, newest meeting first, and save their parts one by one", async () => {
    const { scope } = await agency();
    const first = await addNote(env.DB, scope, "Acme", "2026-10-01");
    const second = await addNote(env.DB, scope, "Acme", "2026-10-15");

    expect(await editResource(env.DB, scope, first.id, { title: "Kick-off", body: "- [ ] Send the brief" })).toBe(true);
    expect(await editResource(env.DB, scope, second.id, { day: "2026-09-20" })).toBe(true);

    const { notes } = await listResources(env.DB, scope, "Acme");
    expect(notes.map((one) => [one.day, one.title, one.body])).toEqual([
      ["2026-10-01", "Kick-off", "- [ ] Send the brief"],
      ["2026-09-20", "Meeting notes", ""],
    ]);
  });

  it("refuse a blank title and a day that is not one", async () => {
    const { scope } = await agency();
    const note = await addNote(env.DB, scope, "Acme", "2026-10-01");

    expect(await editResource(env.DB, scope, note.id, { title: "  " })).toHaveProperty("error");
    expect(await editResource(env.DB, scope, note.id, { day: "Tuesday" })).toHaveProperty("error");
  });

  it("tick a checkbox line as a task description does", async () => {
    const { scope } = await agency();
    const note = await addNote(env.DB, scope, "Acme", "2026-10-01");
    await editResource(env.DB, scope, note.id, { body: "- [ ] One\n- [ ] Two" });

    expect(await tickNote(env.DB, scope, note.id, 1)).toBe(true);
    expect((await listResources(env.DB, scope, "Acme")).notes[0]?.body).toBe("- [ ] One\n- [x] Two");
  });
});

describe("what the client list counts", () => {
  it("counts each client's links, notes and open tasks", async () => {
    const { scope } = await agency();
    await addLink(env.DB, scope, "Acme", { url: "https://example.com" });
    await addNote(env.DB, scope, "Acme", "2026-10-01");
    await addNote(env.DB, scope, "Globex", "2026-10-01");
    const [open, done, other] = await createTasks(env.DB, scope, { titles: ["Open", "Done", "Other"], status: "todo", assignees: [] });
    await saveTask(env.DB, scope, open!, { title: "Open", data: { client: "Acme" }, decides: false, dueDate: null });
    await saveTask(env.DB, scope, done!, { title: "Done", data: { client: "Acme" }, decides: false, dueDate: null });
    await env.DB.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").bind(done).run();
    void other;

    expect(await countsByClient(env.DB, scope, "client")).toEqual({
      Acme: { links: 1, notes: 1, open: 1 },
      Globex: { links: 0, notes: 1, open: 0 },
    });
    expect((await openTasksOf(env.DB, scope, "client", "Acme")).map((one) => one.title)).toEqual(["Open"]);
  });
});

describe("the client page", () => {
  it("answers 404 for a value the client field does not offer", async () => {
    const { ada } = await agency();

    const answer = await caught(
      clientRoute.loader(routeArgs(get(`/o/${ada.org.slug}/clients/Initech`, ada.cookie), { slug: ada.org.slug, client: "Initech" })),
    );
    expect(answer.status).toBe(404);
  });

  it("draws the client's links, notes and open tasks", async () => {
    const { ada, scope } = await agency();
    await addLink(env.DB, scope, "Acme", { url: "https://example.com" });

    const data = await clientRoute.loader(
      routeArgs(get(`/o/${ada.org.slug}/clients/Acme`, ada.cookie), { slug: ada.org.slug, client: "Acme" }),
    );
    expect(data.client.label).toBe("Acme");
    expect(data.links).toHaveLength(1);
    expect(data.notes).toEqual([]);
  });
});
