import { expect, it } from "vitest";

import { escapeHtml, isUrl, renderInline } from "../app/markdown";

// The renderer's output goes straight into the page as HTML, so the escaping
// cases below are the load-bearing ones — everything else is polish.

it("html in the source text is escaped, never executed", () => {
  expect(renderInline('<script>alert("x")</script>')).toBe(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
  );
});

it("escapeHtml covers every delimiter that could break out of an attribute", () => {
  expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
});

it("NUL is stripped so it can't forge a placeholder", () => {
  expect(renderInline("a\u00000\u0000b")).toBe("a0b");
});

it("javascript: and data: urls are not linked", () => {
  expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  expect(renderInline("[x](data:text/html,<b>)")).toBe("[x](data:text/html,&lt;b&gt;)");
});

it("bare urls become links", () => {
  expect(renderInline("see https://x.com/a")).toBe(
    'see <a href="https://x.com/a" target="_blank" rel="noopener noreferrer">https://x.com/a</a>',
  );
});

it("trailing sentence punctuation stays out of the link", () => {
  expect(renderInline("see https://x.com.").endsWith("https://x.com</a>.")).toBe(true);
});

it("query strings survive escaping intact", () => {
  expect(renderInline("https://x.com/?a=1&b=2")).toContain('href="https://x.com/?a=1&amp;b=2"');
});

it("markdown links render their label, and a code span inside it still applies", () => {
  expect(renderInline("[`docs`](https://x.com)")).toBe(
    '<a href="https://x.com" target="_blank" rel="noopener noreferrer"><code>docs</code></a>',
  );
});

it("a bare www link is promoted to https", () => {
  expect(renderInline("www.example.com")).toContain('href="https://www.example.com"');
});

it("an already-linked href is not linked a second time", () => {
  expect(renderInline("[a](https://x.com)").match(/<a /g)).toHaveLength(1);
});

it("code spans render", () => {
  expect(renderInline("run `npm test` now")).toBe("run <code>npm test</code> now");
});

it("a url inside a code span is not linked", () => {
  expect(renderInline("`see https://x.com`")).toBe("<code>see https://x.com</code>");
});

// Emphasis was dropped on purpose — these markers are literal text, which is
// the point: asterisks and underscores show up in prose and identifiers far
// more often than anyone wants them italicised.
it("emphasis markers are left as literal text", () => {
  expect(renderInline("**b** _i_")).toBe("**b** _i_");
  expect(renderInline("call some_function_name now")).toBe("call some_function_name now");
});

it("isUrl only accepts a single linkable url", () => {
  expect(isUrl("https://a.b")).toBe(true);
  expect(isUrl("www.a.b")).toBe(true);
  expect(isUrl("two words")).toBe(false);
  expect(isUrl("javascript:alert(1)")).toBe(false);
  expect(isUrl("")).toBe(false);
});

// --- schemeless domains -----------------------------------------------------

it("a schemeless domain is linked and promoted to https", () => {
  const out = renderInline("ship blrhikes.in today");
  expect(out).toContain('href="https://blrhikes.in"');
  expect(out).toContain(">blrhikes.in</a>");
});

it("subdomains and paths are linked", () => {
  expect(renderInline("dev.blrhikes.in/trails?a=1")).toContain(
    'href="https://dev.blrhikes.in/trails?a=1"',
  );
});

it("a domain at the very start of the text is linked", () => {
  expect(renderInline("example.com is down")).toContain("<a ");
});

it("source filenames are not links", () => {
  for (const one of [
    "src/store.js",
    "README.md",
    "styles.css",
    "index.html",
    "deploy.sh",
    "main.rs",
    "app.py",
  ]) {
    expect(renderInline(one), one).not.toContain("<a ");
  }
});

it("abbreviations and version numbers are not links", () => {
  for (const one of ["e.g. this", "etc. and so on", "v1.2.3", "Done.Next"]) {
    expect(renderInline(one), one).not.toContain("<a ");
  }
});

it("a capitalised host is not a link (Tusker.app is an app, not a domain)", () => {
  expect(renderInline("Tusker.app")).not.toContain("<a ");
});

it("a TLD is not matched inside a longer word", () => {
  expect(renderInline("grind.coffee beans")).not.toContain("<a ");
});

it("emails become mailto links, with the domain left intact", () => {
  const out = renderInline("mail hello@codeuncode.com now");
  expect(out).toContain('href="mailto:hello@codeuncode.com"');
  expect(out.match(/<a /g)).toHaveLength(1);
  expect(out).toContain(">hello@codeuncode.com</a>");
});

it("a schemeless domain inside a markdown link target still works", () => {
  expect(renderInline("[docs](blrhikes.in/x)")).toContain('href="https://blrhikes.in/x"');
});

it("trailing punctuation stays out of a schemeless link", () => {
  expect(renderInline("go to blrhikes.in.").endsWith("blrhikes.in</a>.")).toBe(true);
});

it("isUrl accepts a schemeless domain, so paste-as-link works", () => {
  expect(isUrl("blrhikes.in")).toBe(true);
  expect(isUrl("blrhikes.in/trails")).toBe(true);
  expect(isUrl("store.js")).toBe(false);
});
