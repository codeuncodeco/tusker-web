/**
 * The look of one person: their colour and their picture. Both belong to the
 * person and not to an org, so a person reads the same on every card of every
 * org they belong to. See ADR-0034.
 *
 * The colour lives in `person_colors`, which a trigger fills when an account
 * is made. The picture lives in `user.image`, the column better-auth already
 * keeps for one, as a small data URL the account page makes in the browser.
 */

import { readColor } from "./colors";

/** What the account page draws of the person reading it. */
export type Look = { color: string | null; image: string | null };

/** The colour and the picture of one person. */
export async function lookOf(db: D1Database, personId: string): Promise<Look> {
  const row = await db
    .prepare(
      `SELECT pc.color, u.image FROM "user" u
       LEFT JOIN person_colors pc ON pc.user_id = u.id
       WHERE u.id = ?`,
    )
    .bind(personId)
    .first<Look>();
  return { color: row?.color ?? null, image: row?.image ?? null };
}

/**
 * Sets the person's colour, or refuses a value the palette grammar does not
 * read. An empty value is refused too: a person always carries a colour.
 */
export async function setPersonColor(
  db: D1Database,
  personId: string,
  raw: unknown,
): Promise<{ error: string } | null> {
  const reading = readColor(raw);
  if ("error" in reading) return reading;
  if (reading.color === null) return { error: "Pick a colour." };

  await db
    .prepare(
      `INSERT INTO person_colors (user_id, color) VALUES (?, ?)
       ON CONFLICT (user_id) DO UPDATE SET color = excluded.color`,
    )
    .bind(personId, reading.color)
    .run();
  return null;
}

/**
 * The largest picture a person may keep, in characters of its data URL. The
 * page sends a 96px square, which is a few kilobytes; the cap only stops a
 * hand-made post from filling the row.
 */
export const IMAGE_LIMIT = 200_000;

/** The kinds of picture an `<img>` draws safely. An SVG in an `<img>` runs no script. */
const IMAGE_URL = /^data:image\/(jpeg|png|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** True for a data URL the avatar can draw, and nothing else. */
export function isImageUrl(value: string): boolean {
  return value.length <= IMAGE_LIMIT && IMAGE_URL.test(value);
}

/**
 * Sets the person's picture, or takes it away for an empty value. Anything
 * but a small image data URL is refused, so the row never holds an address
 * that would make every board load something off-site.
 */
export async function setPersonImage(
  db: D1Database,
  personId: string,
  raw: unknown,
): Promise<{ error: string } | null> {
  const value = String(raw ?? "").trim();
  if (value && !isImageUrl(value)) return { error: "That picture could not be read. Try a JPEG or a PNG." };

  await db
    .prepare(`UPDATE "user" SET image = ?, updatedAt = ? WHERE id = ?`)
    .bind(value || null, new Date().toISOString(), personId)
    .run();
  return null;
}

/** Sets the person's name. A blank name is allowed: the email stands in for it. */
export async function setPersonName(db: D1Database, personId: string, raw: unknown): Promise<void> {
  const name = String(raw ?? "").trim().slice(0, 80);
  await db
    .prepare(`UPDATE "user" SET name = ?, updatedAt = ? WHERE id = ?`)
    .bind(name, new Date().toISOString(), personId)
    .run();
}
