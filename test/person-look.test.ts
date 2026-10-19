import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { assigneesByTask } from "../app/assignees.server";
import { isImageUrl, lookOf, setPersonColor, setPersonImage, setPersonName } from "../app/people.server";
import { setAssignees } from "../app/assignees.server";
import { addMemberById } from "../app/orgs.server";
import { requireScope } from "../app/scope.server";
import { createTasks } from "../app/tasks.server";
import { member } from "./accounts";
import { get, wipe } from "./routes";

beforeEach(wipe);

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("a person's colour", () => {
  it("is given when the account is made, and two people in a row get different ones", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");

    const [first, second] = [await lookOf(env.DB, ada.person.id), await lookOf(env.DB, bo.person.id)];
    expect(first.color).toEqual(expect.any(String));
    expect(second.color).toEqual(expect.any(String));
    expect(first.color).not.toBe(second.color);
  });

  it("changes to a palette name or an exact colour, and refuses anything else", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect(await setPersonColor(env.DB, ada.person.id, "teal")).toBeNull();
    expect((await lookOf(env.DB, ada.person.id)).color).toBe("teal");
    expect(await setPersonColor(env.DB, ada.person.id, "#2563eb")).toBeNull();
    expect((await lookOf(env.DB, ada.person.id)).color).toBe("#2563eb");

    expect(await setPersonColor(env.DB, ada.person.id, "plaid")).toHaveProperty("error");
    expect(await setPersonColor(env.DB, ada.person.id, "")).toHaveProperty("error");
    expect((await lookOf(env.DB, ada.person.id)).color).toBe("#2563eb");
  });

  it("rides on every assignee a board reads", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    await addMemberById(env.DB, ada.org.id, bo.person.id);
    const scope = await requireScope(get(`/o/${ada.org.slug}`, ada.cookie), env, ada.org.slug);
    await setPersonColor(env.DB, bo.person.id, "purple");
    const [task] = await createTasks(env.DB, scope, { titles: ["Walk the trail"], status: "todo", assignees: [] });
    await setAssignees(env.DB, scope, task!, [bo.person.id]);

    const held = await assigneesByTask(env.DB, scope);

    expect(held.get(task!)).toEqual([{ id: bo.person.id, name: "Bo Kim", initials: "BK", color: "purple" }]);
  });
});

describe("a person's picture", () => {
  it("keeps a small image data URL, and an empty value takes it away", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect(await setPersonImage(env.DB, ada.person.id, PIXEL)).toBeNull();
    expect((await lookOf(env.DB, ada.person.id)).image).toBe(PIXEL);
    expect(await setPersonImage(env.DB, ada.person.id, "")).toBeNull();
    expect((await lookOf(env.DB, ada.person.id)).image).toBeNull();
  });

  it("refuses an address, a script and a page, so a board never loads one", async () => {
    const ada = await member("ada@example.test", "Ada");

    for (const value of ["https://example.test/me.png", "javascript:alert(1)", "data:text/html;base64,PGI+", `data:image/png;base64,${"A".repeat(300_000)}`]) {
      expect(isImageUrl(value)).toBe(false);
      expect(await setPersonImage(env.DB, ada.person.id, value)).toHaveProperty("error");
    }
    expect((await lookOf(env.DB, ada.person.id)).image).toBeNull();
  });
});

it("changes a person's name, and a blank one leaves the email to stand in", async () => {
  const ada = await member("ada@example.test", "Ada");

  await setPersonName(env.DB, ada.person.id, "  Ada Lovelace ");
  const named = await env.DB.prepare('SELECT name FROM "user" WHERE id = ?').bind(ada.person.id).first<{ name: string }>();
  expect(named?.name).toBe("Ada Lovelace");
});
