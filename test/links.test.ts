import { describe, expect, it } from "vitest";

import { linkKind, linkTitle, readLink } from "../app/links";

/** The kind and the title a pasted address starts with. */
function read(text: string) {
  const url = readLink(text);
  if (!url) throw new Error(`${text} is no link`);
  return { kind: linkKind(url), title: linkTitle(url) };
}

describe("a pasted link", () => {
  it("is an http or https address, and a bare host reads as https", () => {
    expect(readLink("https://figma.com/x")?.href).toBe("https://figma.com/x");
    expect(readLink("  example.com/brief ")?.href).toBe("https://example.com/brief");
    expect(readLink("http://intranet.example/x")?.protocol).toBe("http:");
  });

  it("is refused when it is a script, a file, a word, or nothing", () => {
    for (const text of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "brief", "", "   "]) {
      expect(readLink(text)).toBeNull();
    }
  });
});

describe("what a link is called before anyone renames it", () => {
  it("names a Figma file by the name in its path", () => {
    expect(read("https://www.figma.com/design/aBcD/Spring-Show-Posters?node-id=0-1")).toEqual({
      kind: "figma",
      title: "Spring Show Posters",
    });
    expect(read("https://figma.com/file/aBcD").title).toBe("Figma file");
  });

  it("names a Google file by what it is", () => {
    expect(read("https://docs.google.com/document/d/1x/edit")).toEqual({ kind: "google-doc", title: "Google Doc" });
    expect(read("https://docs.google.com/spreadsheets/d/1x")).toEqual({ kind: "google-sheet", title: "Google Sheet" });
    expect(read("https://docs.google.com/presentation/d/1x")).toEqual({ kind: "google-slides", title: "Google Slides" });
    expect(read("https://drive.google.com/drive/folders/1x").kind).toBe("google-drive");
  });

  it("names a Notion page by its words, without the id", () => {
    expect(read("https://www.notion.so/team/Interview-plan-0123456789abcdef0123456789abcdef")).toEqual({
      kind: "notion",
      title: "Interview plan",
    });
  });

  it("names a GitHub link by its repository", () => {
    expect(read("https://github.com/codeuncodeco/tusker-web/pull/12").title).toBe("codeuncodeco/tusker-web");
  });

  it("names any other link by its host and the first step of its path", () => {
    expect(read("https://www.loom.com/share/abc").kind).toBe("loom");
    expect(read("https://example.com/press-kit/2026").title).toBe("example.com · press kit");
    expect(read("https://example.com").title).toBe("example.com");
  });
});
