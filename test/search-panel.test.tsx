/**
 * The search panel's filter rows: chips alone, the first chip naming the row.
 * See ADR-0040.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterRow } from "../app/search-panel";

describe("a filter row", () => {
  it("draws its chips with the label as the group's name, and no label in sight", () => {
    const html = renderToStaticMarkup(
      <FilterRow label="Who" icon={<svg data-glyph />}>
        <button type="button">Mine</button>
      </FilterRow>,
    );

    expect(html).toMatch(/^<div role="group" aria-label="Who"[^>]*><button type="button">Mine<\/button><\/div>$/);
    expect(html).not.toContain(">Who<");
    expect(html).not.toContain("data-glyph");
  });
});
