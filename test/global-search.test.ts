import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import * as searchRoute from "../app/routes/search";
import { requireScope } from "../app/scope.server";
import { createTasks } from "../app/tasks.server";
import { member } from "./accounts";
import { get, routeArgs, wipe } from "./routes";

beforeEach(wipe);

/** What the search answers one person, for some words. */
function search(cookie: string, words: string) {
  return searchRoute.loader(routeArgs(get(`/search?${new URLSearchParams({ q: words })}`, cookie)));
}

describe("the global search", () => {
  it("finds tasks by title across the person's orgs, and by number", async () => {
    const ada = await member("ada@example.test", "Ada");
    const scope = await requireScope(get(`/o/${ada.org.slug}`, ada.cookie), env, ada.org.slug);
    const [poster] = await createTasks(env.DB, scope, { titles: ["Sketch the poster", "Book the van"], status: "todo", assignees: [] });

    expect((await search(ada.cookie, "post")).tasks.map((one) => one.title)).toEqual(["Sketch the poster"]);
    expect((await search(ada.cookie, `#${poster}`)).tasks.map((one) => one.id)).toEqual([poster]);
  });

  it("reads a % or an _ as itself, not as a wildcard", async () => {
    const ada = await member("ada@example.test", "Ada");
    const scope = await requireScope(get(`/o/${ada.org.slug}`, ada.cookie), env, ada.org.slug);
    await createTasks(env.DB, scope, { titles: ["Raise prices 10%", "Raise prices"], status: "todo", assignees: [] });

    expect((await search(ada.cookie, "10%")).tasks.map((one) => one.title)).toEqual(["Raise prices 10%"]);
  });

  it("finds nothing in an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const theirs = await requireScope(get(`/o/${bo.org.slug}`, bo.cookie), env, bo.org.slug);
    await createTasks(env.DB, theirs, { titles: ["Secret plan"], status: "todo", assignees: [] });

    expect((await search(ada.cookie, "secret")).tasks).toEqual([]);
  });

  it("answers nothing for no words", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect(await search(ada.cookie, "  ")).toEqual({ tasks: [], clients: [] });
  });
});
