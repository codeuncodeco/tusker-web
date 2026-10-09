import { describe, expect, it } from "vitest";

import { filterFields, keepsFields, readFieldFilters } from "../app/field-filter";
import type { FieldType, OrgField } from "../app/fields";
import { narrowingOf } from "../app/remembered";

/** One declaration, filterable unless the test says otherwise. */
function field(key: string, type: FieldType, filterable = true): OrgField {
  return {
    key,
    label: key,
    type,
    options: type === "select" ? ["Acme", "Globex"] : [],
    refs_path: type === "reference" ? key : "",
    refs_pulled_at: null,
    show_on_card: false,
    filterable,
    position: 0,
  };
}

/** The address a board carries. */
function query(text: string) {
  return new URLSearchParams(text);
}

describe("the fields a board draws a filter for", () => {
  it("takes the select and reference fields the org marks filterable", () => {
    const fields = [
      field("client", "select"),
      field("trail", "reference"),
      field("stage", "select", false),
    ];
    expect(filterFields(fields).map((one) => one.key)).toEqual(["client", "trail"]);
  });

  it("draws none for a text or a date field, which has no list to pick from", () => {
    expect(filterFields([field("note", "text"), field("due", "date")])).toEqual([]);
  });
});

describe("the values the address holds", () => {
  const fields = [field("client", "select"), field("trail", "reference")];

  it("reads each filter under the name the task API reads", () => {
    expect(readFieldFilters(query("field.client=Acme&field.trail=t-1"), fields)).toEqual({
      client: "Acme",
      trail: "t-1",
    });
  });

  it("drops an empty value and the space around a value", () => {
    expect(readFieldFilters(query("field.client=&field.trail=%20t-1%20"), fields)).toEqual({
      trail: "t-1",
    });
  });

  it("ignores a field the org does not mark filterable, or does not declare", () => {
    const declared = [field("client", "select", false)];
    expect(readFieldFilters(query("field.client=Acme&field.gone=x"), declared)).toEqual({});
  });
});

describe("the tasks the filters keep", () => {
  it("keeps every task while no filter is set", () => {
    expect(keepsFields({}, {})).toBe(true);
  });

  it("keeps a task holding every value, and no other", () => {
    const filters = { client: "Acme", trail: "t-1" };
    expect(keepsFields(filters, { client: "Acme", trail: "t-1", note: "x" })).toBe(true);
    expect(keepsFields(filters, { client: "Acme", trail: "t-2" })).toBe(false);
    expect(keepsFields(filters, { client: "Acme" })).toBe(false);
  });
});

describe("what a board remembers", () => {
  it("keeps the field filters beside the search and the assignee", () => {
    expect(narrowingOf(query("q=bus&assignee=u-ada&field.client=Acme&backlog=1"))).toBe(
      "q=bus&assignee=u-ada&field.client=Acme",
    );
  });

  it("forgets a field filter cleared by hand", () => {
    expect(narrowingOf(query("field.client=&today=1"))).toBe("");
  });
});
