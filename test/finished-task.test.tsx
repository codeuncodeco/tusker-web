/**
 * A finished task, on its page.
 *
 * A task in Done or Cancelled is read, not edited. Reopen moves it to To do,
 * and then the page edits it again. A post that edits a finished task anyway
 * is refused, and the row keeps what it held. See #164.
 */

import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { isFinished, type Status } from "../app/board";
import * as taskRoute from "../app/routes/task";
import type { TaskId } from "../app/task-number";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A task in one status, placed by hand, finished a while ago when it is. */
async function task(
  orgId: string,
  id: TaskId,
  some: { status: Status; description?: string; decides?: boolean },
) {
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, description, decides, finished_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      `Task ${id}`,
      some.status,
      some.description ?? "",
      some.decides ? 1 : 0,
      isFinished(some.status) ? "2026-09-01T10:00:00.000Z" : null,
    )
    .run();
  return id;
}

/** One post to the task page, signed by one member. */
function act(cookie: string, id: TaskId, fields: Record<string, string>) {
  const request = post(`/t/${id}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(id) }));
}

/** The row as the page edits it. */
async function row(id: TaskId) {
  return db
    .prepare(
      "SELECT title, status, description, decides, due_date, archived, finished_at FROM tasks WHERE id = ?",
    )
    .bind(id)
    .first<{
      title: string;
      status: string;
      description: string;
      decides: number;
      due_date: string | null;
      archived: number;
      finished_at: string | null;
    }>();
}

describe("a post that edits a finished task", () => {
  for (const status of ["done", "cancelled"] as const) {
    it(`is refused on a ${status} task, and the row keeps what it held`, async () => {
      const one = await member(`${status}@example.test`, "Ends");
      await task(one.org.id, 1, { status });
      const before = await row(1);

      const response = await caught(
        act(one.cookie, 1, {
          title: "Rewritten",
          decides: "1",
          due_date: "2026-12-01",
          status: "todo",
        }),
      );

      expect(response.status).toBe(409);
      expect(await row(1)).toEqual(before);
    });
  }
});

describe("a Finish posted for a finished task", () => {
  it("is refused on a cancelled task, which stays where it is", async () => {
    const one = await member("again@example.test", "Again");
    await task(one.org.id, 1, { status: "cancelled", decides: true });
    const before = await row(1);

    const response = await caught(act(one.cookie, 1, { intent: "finish" }));

    expect(response.status).toBe(409);
    expect(await row(1)).toEqual(before);
  });
});

describe("a description posted for a finished task", () => {
  for (const status of ["done", "cancelled"] as const) {
    it(`is refused on a ${status} task, and the text stays`, async () => {
      const one = await member(`${status}@example.test`, "Ends");
      await task(one.org.id, 1, { status, description: "the old words" });

      const response = await caught(
        act(one.cookie, 1, { intent: "describe", description: "new words" }),
      );

      expect(response.status).toBe(409);
      expect((await row(1))!.description).toBe("the old words");
    });
  }
});

describe("the acts a finished task still takes", () => {
  it("ticks a box of its description", async () => {
    const one = await member("tick@example.test", "Tick");
    await task(one.org.id, 1, { status: "done", description: "- [ ] pack tent" });

    await act(one.cookie, 1, { intent: "tick", box: "0" });

    expect((await row(1))!.description).toBe("- [x] pack tent");
  });

  it("is archived, and restored, keeping its status", async () => {
    const one = await member("shelf@example.test", "Shelf");
    await task(one.org.id, 1, { status: "cancelled" });

    await act(one.cookie, 1, { intent: "archive" });
    expect(await row(1)).toMatchObject({ archived: 1, status: "cancelled" });

    await act(one.cookie, 1, { intent: "restore" });
    expect(await row(1)).toMatchObject({ archived: 0, status: "cancelled" });
  });

  it("answers the decision prompt", async () => {
    const one = await member("decide@example.test", "Decide");
    await task(one.org.id, 1, { status: "done", decides: true });

    await act(one.cookie, 1, {
      intent: "decide",
      id: "1",
      title: "Use rope",
      rationale: "It holds",
    });

    const decision = await db
      .prepare("SELECT title, rationale FROM decisions WHERE task_id = ?")
      .bind(1)
      .first();
    expect(decision).toEqual({ title: "Use rope", rationale: "It holds" });
  });
});

describe("Reopen", () => {
  for (const status of ["done", "cancelled"] as const) {
    it(`moves a ${status} task to To do and clears its finish time`, async () => {
      const one = await member(`${status}@example.test`, "Again");
      await task(one.org.id, 1, { status });

      await act(one.cookie, 1, { intent: "reopen" });

      expect(await row(1)).toMatchObject({ status: "todo", finished_at: null });
    });
  }

  it("answers with the page again, so the form it opens says nothing was saved", async () => {
    const one = await member("back@example.test", "Back");
    await task(one.org.id, 1, { status: "done" });

    const response = await caught(act(one.cookie, 1, { intent: "reopen" }));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/t/1");
  });

  it("is refused on an archived task, which is restored first", async () => {
    const one = await member("kept@example.test", "Kept");
    await task(one.org.id, 1, { status: "done" });
    await act(one.cookie, 1, { intent: "archive" });
    const before = await row(1);

    const response = await caught(act(one.cookie, 1, { intent: "reopen" }));

    expect(response.status).toBe(409);
    expect(await row(1)).toEqual(before);
  });

  it("leaves the task open to a save afterwards", async () => {
    const one = await member("after@example.test", "After");
    await task(one.org.id, 1, { status: "done" });

    await act(one.cookie, 1, { intent: "reopen" });
    await act(one.cookie, 1, { title: "Rewritten" });

    expect((await row(1))!.title).toBe("Rewritten");
  });

  it("leaves an open task where it stands", async () => {
    const one = await member("open@example.test", "Open");
    await task(one.org.id, 1, { status: "in_progress" });

    await act(one.cookie, 1, { intent: "reopen" });

    expect((await row(1))!.status).toBe("in_progress");
  });

  it("answers 404 for a task another org holds", async () => {
    const one = await member("mine@example.test", "Mine");
    const other = await member("theirs@example.test", "Theirs");
    await task(other.org.id, 2, { status: "done" });

    const response = await caught(act(one.cookie, 2, { intent: "reopen" }));

    expect(response.status).toBe(404);
    expect((await row(2))!.status).toBe("done");
  });
});

/** The task page as one member's browser draws it. */
async function drawn(cookie: string, id: TaskId): Promise<string> {
  const path = `/t/${id}`;
  const loaderData = await taskRoute.loader(routeArgs(get(path, cookie), { n: String(id) }));
  // The route's own props carry matches and params the page never reads.
  const Page = taskRoute.default as unknown as (props: {
    loaderData: typeof loaderData;
    actionData: undefined;
  }) => React.ReactNode;
  const Stub = createRoutesStub([
    { path: "*", Component: () => <Page loaderData={loaderData} actionData={undefined} /> },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={[path]} />);
}

describe("the page a finished task draws", () => {
  for (const status of ["done", "cancelled"] as const) {
    it(`reads a ${status} task, with no box to edit and a Reopen`, async () => {
      const one = await member(`${status}@example.test`, "Read");
      await task(one.org.id, 1, { status, description: "the words", decides: true });

      const html = await drawn(one.cookie, 1);

      expect(html).not.toContain('name="title"');
      expect(html).not.toContain('name="decides"');
      expect(html).not.toContain('name="due_date"');
      expect(html).not.toContain("<select");
      expect(html).not.toContain("<textarea");
      expect(html).not.toContain(">Save<");
      expect(html).not.toContain(">Edit<");
      expect(html).toContain('value="reopen"');
      expect(html).toContain("the words");
      expect(html).toContain("Holds a decision");
    });
  }

  it("offers Restore and no Reopen while the task is archived", async () => {
    const one = await member("shelf@example.test", "Shelf");
    await task(one.org.id, 1, { status: "done" });
    await act(one.cookie, 1, { intent: "archive" });

    const html = await drawn(one.cookie, 1);

    expect(html).toContain('value="restore"');
    expect(html).not.toContain('value="reopen"');
  });

  it("draws the edit form for an open task, and no Reopen", async () => {
    const one = await member("open@example.test", "Open");
    await task(one.org.id, 1, { status: "todo" });

    const html = await drawn(one.cookie, 1);

    expect(html).toContain('name="title"');
    expect(html).toContain(">Save<");
    expect(html).not.toContain('value="reopen"');
  });
});
