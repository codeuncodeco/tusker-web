/**
 * What Tusker reads from a link a person pastes onto a client page: whether it
 * is a link at all, which service it points at, and a title to start with.
 *
 * The title is read from the address alone. Tusker fetches nothing to name a
 * link: a page behind a sign-in answers with a sign-in page, and a fetch per
 * paste is a request Tusker makes on the person's behalf to somewhere they did
 * not ask it to go. The person renames it in one click. See ADR-0036.
 */

/** The services a client link is drawn for, each with its own mark. */
export type LinkKind =
  | "figma"
  | "google-doc"
  | "google-sheet"
  | "google-slides"
  | "google-drive"
  | "notion"
  | "github"
  | "loom"
  | "youtube"
  | "slack"
  | "dropbox"
  | "web";

/** The address a paste holds, or null for anything that is not an http(s) link. */
export function readLink(raw: unknown): URL | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  // A bare host, as a person types it, is read as https.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** The host a person reads: no `www.`. */
export function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

/** Which service a link points at. */
export function linkKind(url: URL): LinkKind {
  const host = hostOf(url);
  const path = url.pathname;
  if (host === "figma.com" || host.endsWith(".figma.com")) return "figma";
  if (host === "docs.google.com") {
    if (path.startsWith("/spreadsheets")) return "google-sheet";
    if (path.startsWith("/presentation")) return "google-slides";
    return "google-doc";
  }
  if (host === "drive.google.com") return "google-drive";
  if (host === "notion.so" || host.endsWith(".notion.so") || host.endsWith(".notion.site")) return "notion";
  if (host === "github.com") return "github";
  if (host === "loom.com") return "loom";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "youtube";
  if (host.endsWith("slack.com")) return "slack";
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) return "dropbox";
  return "web";
}

/** The word each service is named by, where the address names nothing better. */
export const KIND_NAME: Record<LinkKind, string> = {
  figma: "Figma file",
  "google-doc": "Google Doc",
  "google-sheet": "Google Sheet",
  "google-slides": "Google Slides",
  "google-drive": "Google Drive",
  notion: "Notion page",
  github: "GitHub",
  loom: "Loom recording",
  youtube: "YouTube video",
  slack: "Slack",
  dropbox: "Dropbox",
  web: "Link",
};

/** A path segment as words: `Spring-Show--Posters` reads `Spring Show Posters`. */
function words(segment: string): string {
  let text = segment;
  try {
    text = decodeURIComponent(segment);
  } catch {
    // A segment that is not valid escaping reads as it stands.
  }
  return text.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The title a pasted link starts with.
 *
 * - A Figma file names itself in its path, after the key.
 * - A Notion page names itself before its id.
 * - A GitHub path names the repository.
 * - Everything else reads as the service's name, or the host and the first
 *   step of the path.
 */
export function linkTitle(url: URL): string {
  const kind = linkKind(url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (kind === "figma") {
    // /file/<key>/<Name>, /design/<key>/<Name>, /proto/<key>/<Name>, /board/<key>/<Name>
    const name = parts[2] ? words(parts[2]) : "";
    return name || KIND_NAME.figma;
  }
  if (kind === "notion") {
    const last = parts.at(-1) ?? "";
    const name = words(last.replace(/-?[0-9a-f]{32}$/i, ""));
    return name || KIND_NAME.notion;
  }
  if (kind === "github") {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : KIND_NAME.github;
  }
  if (kind !== "web") return KIND_NAME[kind];

  const first = parts[0] ? words(parts[0]) : "";
  return first ? `${hostOf(url)} · ${first}` : hostOf(url);
}
