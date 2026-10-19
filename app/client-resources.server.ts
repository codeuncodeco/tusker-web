/**
 * The reads and the writes behind a client page: its links and its meeting
 * notes, and the counts the client list draws. See ADR-0036.
 *
 * Every function takes a scope, so `org_id` fences these rows the way it fences
 * a task row, and one org's notes are unreachable from another.
 */

import { isDay } from "./day";
import { notDeleted } from "./deleted.server";
import { tickBox } from "./description";
import { hostOf, linkKind, linkTitle, readLink, type LinkKind } from "./links";
import type { Scope } from "./scope.server";
import type { Status } from "./board";
import type { TaskId } from "./task-number";

/** One link of a client, as the page draws it. */
export type ClientLink = { id: string; title: string; url: string; host: string; kind: LinkKind };

/** One meeting note of a client. `day` is the day the meeting was held. */
export type ClientNote = { id: string; title: string; body: string; day: string; updated_at: string };

/** One open task of a client, as the page lists it. */
export type ClientTask = { id: TaskId; title: string; status: Status; due_date: string | null };

/** What the list of clients draws beside each one. */
export type ClientCounts = { links: number; notes: number; open: number };

/** The longest title a link or a note keeps. */
const TITLE_LIMIT = 120;

/** The longest note a client keeps, in characters. Long enough for any meeting. */
export const NOTE_LIMIT = 50_000;

/** A title as it is kept: trimmed, and cut at the limit. */
function titleOf(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, TITLE_LIMIT);
}

/** The links and the notes of one client: links by when they were added, notes newest meeting first. */
export async function listResources(
  db: D1Database,
  scope: Scope,
  client: string,
): Promise<{ links: ClientLink[]; notes: ClientNote[] }> {
  const { results } = await db
    .prepare(
      `SELECT id, kind, title, url, body, day, updated_at FROM client_resources
       WHERE org_id = ? AND client = ?
       ORDER BY created_at, rowid`,
    )
    .bind(scope.org.id, client)
    .all<{ id: string; kind: "link" | "note"; title: string; url: string | null; body: string; day: string | null; updated_at: string }>();

  const links: ClientLink[] = [];
  const notes: ClientNote[] = [];
  for (const row of results) {
    if (row.kind === "note") {
      notes.push({ id: row.id, title: row.title, body: row.body, day: row.day ?? "", updated_at: row.updated_at });
      continue;
    }
    const url = readLink(row.url);
    if (url) links.push({ id: row.id, title: row.title, url: url.href, host: hostOf(url), kind: linkKind(url) });
  }
  // Links read in the order they were added, oldest first: a list a person
  // builds up reads top to bottom. Notes read newest meeting first, and of
  // two on one day, the one written later first.
  notes.reverse();
  notes.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return { links, notes };
}

/**
 * Adds a link to a client, titled from its address unless the person gave a
 * title. Anything but an http(s) address is refused.
 */
export async function addLink(
  db: D1Database,
  scope: Scope,
  client: string,
  raw: { url: unknown; title?: unknown },
): Promise<{ id: string } | { error: string }> {
  const url = readLink(raw.url);
  if (!url) return { error: "That is not a link. Paste an address that starts with https://." };

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO client_resources (id, org_id, client, kind, title, url, made_by)
       VALUES (?, ?, ?, 'link', ?, ?, ?)`,
    )
    .bind(id, scope.org.id, client, titleOf(raw.title) || linkTitle(url), url.href, scope.personId)
    .run();
  return { id };
}

/** Starts a meeting note for a client, on the day named or today, and answers its id. */
export async function addNote(
  db: D1Database,
  scope: Scope,
  client: string,
  day: string,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO client_resources (id, org_id, client, kind, title, day, made_by)
       VALUES (?, ?, ?, 'note', 'Meeting notes', ?, ?)`,
    )
    .bind(id, scope.org.id, client, day, scope.personId)
    .run();
  return { id };
}

/** What an edit of a link or a note may change. */
export type ResourceChange = { title?: unknown; body?: unknown; day?: unknown };

/**
 * Changes one link's title, or one note's title, text or day. A blank title is
 * refused, and so is a day that is not one. Answers false for a row the org
 * does not hold.
 */
export async function editResource(
  db: D1Database,
  scope: Scope,
  id: string,
  change: ResourceChange,
): Promise<boolean | { error: string }> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (change.title !== undefined) {
    const title = titleOf(change.title);
    if (!title) return { error: "A title needs a word." };
    sets.push("title = ?");
    values.push(title);
  }
  if (change.body !== undefined) {
    sets.push("body = ?");
    values.push(String(change.body).slice(0, NOTE_LIMIT));
  }
  if (change.day !== undefined) {
    const day = String(change.day).trim();
    if (!isDay(day)) return { error: "A meeting day reads as 2026-10-19." };
    sets.push("day = ?");
    values.push(day);
  }
  if (sets.length === 0) return true;

  const done = await db
    .prepare(
      `UPDATE client_resources SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(...values, id, scope.org.id)
    .run();
  return done.meta.changes > 0;
}

/** Ticks or unticks the Nth box of one note, as a task's description does. */
export async function tickNote(db: D1Database, scope: Scope, id: string, box: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT body FROM client_resources WHERE id = ? AND org_id = ? AND kind = 'note'")
    .bind(id, scope.org.id)
    .first<{ body: string }>();
  if (!row) return false;
  const ticked = tickBox(row.body, box);
  if (ticked === null) return false;
  const changed = await editResource(db, scope, id, { body: ticked });
  return changed === true;
}

/** Deletes one link or note. Answers false for a row the org does not hold. */
export async function deleteResource(db: D1Database, scope: Scope, id: string): Promise<boolean> {
  const done = await db
    .prepare("DELETE FROM client_resources WHERE id = ? AND org_id = ?")
    .bind(id, scope.org.id)
    .run();
  return done.meta.changes > 0;
}

/**
 * The client's tasks that are still to do: Backlog, To do and In progress,
 * unarchived, in progress first, then by due date.
 */
export async function openTasksOf(
  db: D1Database,
  scope: Scope,
  fieldKey: string,
  client: string,
): Promise<ClientTask[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, status, due_date FROM tasks
       WHERE org_id = ? AND archived = 0 AND ${notDeleted()}
         AND status IN ('backlog', 'todo', 'in_progress')
         AND json_extract(data, '$.' || ?) = ?
       ORDER BY status = 'in_progress' DESC, status = 'todo' DESC, due_date IS NULL, due_date, id`,
    )
    .bind(scope.org.id, fieldKey, client)
    .all<ClientTask>();
  return results;
}

/** The counts beside every client of the org, keyed by the stored value. */
export async function countsByClient(
  db: D1Database,
  scope: Scope,
  fieldKey: string,
): Promise<Record<string, ClientCounts>> {
  const [kept, open] = await db.batch<{ client: string; kind: string; n: number }>([
    db
      .prepare("SELECT client, kind, count(*) AS n FROM client_resources WHERE org_id = ? GROUP BY client, kind")
      .bind(scope.org.id),
    db
      .prepare(
        `SELECT json_extract(data, '$.' || ?) AS client, 'open' AS kind, count(*) AS n FROM tasks
         WHERE org_id = ? AND archived = 0 AND ${notDeleted()}
           AND status IN ('backlog', 'todo', 'in_progress')
           AND json_extract(data, '$.' || ?) IS NOT NULL
         GROUP BY client`,
      )
      .bind(fieldKey, scope.org.id, fieldKey),
  ]);

  const counts: Record<string, ClientCounts> = {};
  for (const row of [...kept!.results, ...open!.results]) {
    const one = (counts[row.client] ??= { links: 0, notes: 0, open: 0 });
    if (row.kind === "link") one.links = row.n;
    if (row.kind === "note") one.notes = row.n;
    if (row.kind === "open") one.open = row.n;
  }
  return counts;
}
