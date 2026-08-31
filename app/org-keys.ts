/**
 * The org key: the key an org app sends to Tusker to read that org's tasks.
 *
 * Tusker verifies the read, so Tusker mints the key. See ADR-0005. This module
 * holds the parts that are only maths on a string, so the shape of a key is
 * stated once.
 */

/**
 * The start of every org key. A key that turns up in a log or a repository is
 * then recognisable as Tusker's, by a person and by a secret scanner.
 */
const KEY_PREFIX = "tskr_";

/** How many random bytes a key carries. 24 bytes is 32 base64url characters. */
const KEY_BYTES = 24;

/**
 * How much of a key the settings screen shows. Four characters after the
 * prefix tell one key from another and give away almost none of the 192 bits
 * the rest of it holds.
 */
const PREVIEW_LENGTH = KEY_PREFIX.length + 4;

/** A new key, as the org app will send it. Tusker shows this once. */
export function mintKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return KEY_PREFIX + base64url(bytes);
}

/** The first characters of a key, which is all a screen ever shows again. */
export function keyPreview(key: string): string {
  return key.slice(0, PREVIEW_LENGTH);
}

/**
 * What the row holds instead of the key: the SHA-256 of it, in hex.
 *
 * A key is 24 random bytes, so it needs no salt and no slow hash: there is
 * nothing to guess. Hashing at all is what keeps a read of the table from
 * handing over every org's tasks.
 */
export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The key a request carries, or null when it carries no bearer token. The
 * scheme reads either case, as RFC 7235 says it must, so `bearer` is not a
 * 401 that reads as a bad key.
 */
export function bearerKey(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1] : null;
}

/** The bytes as base64url, which is what a URL and a header both carry. */
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
