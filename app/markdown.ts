// Tusker — the small inline-markdown renderer shared by task descriptions and
// comments.
//
// Deliberately hand-rolled and dependency-free. Scope is the GitHub-comment
// subset that actually gets typed: links (bare + `[text](url)`) and
// `` `code` ``. Block-level structure (checkbox lists, fenced code) is handled
// by the caller, which owns the line loop.
//
// Emphasis (`**bold**`, `_italic_`) was deliberately dropped: it cost a pass
// here plus the toggle machinery in the editor, and prose in a task description
// rarely needs it. Links and code are what actually get typed.
//
// Everything is escaped BEFORE any markup is produced — the renderers below
// only ever build HTML out of already-escaped text, never out of raw input.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// U+0000 delimits the placeholders used below, so it must not survive input.
const MARK = "\u0000";

export function escapeHtml(value: string): string {
  return value.replace(/\u0000/g, "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Schemeless domains ("blrhikes.in", "dev.example.co.uk/x") are linked too, but
// only against this allowlist. A general "word.word" rule would swallow every
// filename and abbreviation we write all day — src/store.js, README.md, e.g.,
// v1.2.3 — so the last label has to be a TLD we recognise. Deliberately absent:
// anything that doubles as a common file extension (.md, .sh, .py, .rs, .js).
// Add to this list as you hit a domain it misses; that's cheaper than the false
// positives the permissive rule produces.
const TLDS =
  "com|org|net|edu|gov|int|mil|in|io|dev|app|ai|co|xyz|me|info|biz|tech|cloud|page|blog|email|social|design|studio|agency|team|uk|us|ca|au|de|fr|es|it|nl|se|no|fi|dk|pl|pt|ch|at|be|ie|nz|jp|cn|sg|ae|eu|tv|fm|gg|to|ly|st|is|la";

// The host must be lowercase — domains are written that way, and it keeps
// "Tusker.app" and "Chapter.One" out. The (?![a-z]) stops a TLD matching the
// front of a longer word, so "co" doesn't fire inside "foo.coffee".
const DOMAIN = `(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![a-z])`;

// Scanning form (finds domains inside a line) and anchored form (asks whether a
// whole string is one), built from the same pattern so they can't drift apart.
const BARE_DOMAIN_RE = new RegExp(`(^|[\\s(])(${DOMAIN}(?:[/?#][^\\s<]*)?)`, "g");
const WHOLE_DOMAIN_RE = new RegExp(`^${DOMAIN}(?:[/?#]\\S*)?$`);

// Emails are parked before the domain pass so it can't chew the domain half off
// an address. A preceding "@" therefore never reaches BARE_DOMAIN_RE.
const EMAIL_RE = /(^|[\s(])([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})(?![a-z])/gi;

// Only http(s) and mailto become links — never javascript:, data: or anything
// else that would turn a pasted string into an execution vector. A bare
// "www.foo.com" or "foo.com" is promoted to https.
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return "https://" + url;
  if (WHOLE_DOMAIN_RE.test(url)) return "https://" + url;
  return null;
}

function anchorOpen(url: string): string {
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">`;
}

/** True if the whole string is a single linkable URL (used by the editor). */
export function isUrl(text: string): boolean {
  const one = text.trim();
  return !/\s/.test(one) && one.length > 0 && safeUrl(one) !== null;
}

/**
 * Render one line/paragraph of text as inline HTML.
 *
 * Finished fragments (code spans, anchor tags) are parked as \0N\0 placeholders
 * so later passes can't reach inside them — that's what stops the bare-URL pass
 * from re-linking the href of a link the markdown-link pass already made, and
 * what keeps a URL inside a code span from becoming a link.
 */
export function renderInline(text: string): string {
  const parked: string[] = [];
  const park = (html: string) => MARK + (parked.push(html) - 1) + MARK;

  let out = escapeHtml(text);

  // `code` — first, so its contents are immune to every pass below.
  out = out.replace(/`([^`\n]+)`/g, (_, code: string) => park(`<code>${code}</code>`));

  // [label](url) — only the tags are parked, so a code span inside the label
  // still renders.
  out = out.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    const url = safeUrl(href);
    if (!url) return whole;
    return park(anchorOpen(url)) + (label || url) + park("</a>");
  });

  // Trailing punctuation is sentence punctuation, not part of the link ("see
  // https://x.com." shouldn't link the full stop).
  // `toUrl` maps the matched text to an href. Note the explicit arrow wrappers
  // at each call site: replace() passes the match offset as a further argument,
  // which would land in toUrl if these were passed as the callback directly.
  const linkify = (
    whole: string,
    pre: string,
    raw: string,
    toUrl: (clean: string) => string | null,
  ) => {
    const trailing = raw.match(/[.,;:!?)\]]+$/);
    const clean = trailing ? raw.slice(0, -trailing[0].length) : raw;
    const url = toUrl(clean);
    if (!url) return whole;
    return pre + park(`${anchorOpen(url)}${clean}</a>`) + (trailing ? trailing[0] : "");
  };

  // Emails — before the domain pass, which would otherwise link the half of an
  // address after the "@".
  out = out.replace(EMAIL_RE, (whole, pre: string, raw: string) =>
    linkify(whole, pre, raw, (clean) => "mailto:" + clean),
  );

  // URLs with a scheme, and www.*
  out = out.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+)/g, (whole, pre: string, raw: string) =>
    linkify(whole, pre, raw, safeUrl),
  );

  // Schemeless domains — "blrhikes.in", "dev.example.co.uk/trails".
  out = out.replace(BARE_DOMAIN_RE, (whole, pre: string, raw: string) =>
    linkify(whole, pre, raw, safeUrl),
  );

  return out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => parked[Number(index)]);
}
