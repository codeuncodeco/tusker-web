import { describe, expect, it } from "vitest";

import { fieldKey, readData, readOptions, readValue, type OrgField } from "../app/fields";

/** A declared field, with the parts a test does not care about filled in. */
function field(one: Partial<OrgField> & Pick<OrgField, "key" | "type">): OrgField {
  return {
    label: one.key,
    options: [],
    refs_path: "",
    refs_pulled_at: null,
    show_on_card: false,
    filterable: false,
    position: 1,
    ...one,
  };
}

/** A form that carries one value per field. */
function form(values: Record<string, string>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.append(`field.${key}`, value);
  return body;
}

describe("the key a label makes", () => {
  it("holds letters, numbers and underscores only", () => {
    expect(fieldKey("Client name")).toBe("client_name");
    expect(fieldKey("  Kind / type!  ")).toBe("kind_type");
  });

  it("answers empty for a label with no letter or number", () => {
    expect(fieldKey(" -- ")).toBe("");
  });
});

describe("the options a select declares", () => {
  it("takes one option per line, and drops the empty ones", () => {
    expect(readOptions("Design\n\n Build \nShip")).toEqual(["Design", "Build", "Ship"]);
  });

  it("keeps one of each", () => {
    expect(readOptions("Build\nBuild")).toEqual(["Build"]);
  });
});

describe("the value one field takes", () => {
  it("trims a text value, and reads an empty one as no value", () => {
    expect(readValue(field({ key: "client", type: "text" }), "  Acme ")).toEqual({ value: "Acme" });
    expect(readValue(field({ key: "client", type: "text" }), "   ")).toEqual({ value: null });
  });

  it("takes a select value the field declares, and refuses one it does not", () => {
    const kind = field({ key: "kind", type: "select", options: ["Bug", "Chore"], label: "Kind" });

    expect(readValue(kind, "Bug")).toEqual({ value: "Bug" });
    expect(readValue(kind, "")).toEqual({ value: null });
    expect(readValue(kind, "Epic")).toEqual({ error: "Kind does not hold Epic." });
  });

  it("takes a date as YYYY-MM-DD, and refuses any other shape", () => {
    const due = field({ key: "ship", type: "date", label: "Ship by" });

    expect(readValue(due, "2026-08-31")).toEqual({ value: "2026-08-31" });
    expect(readValue(due, "")).toEqual({ value: null });
    expect(readValue(due, "31/08/2026")).toEqual({ error: "Ship by takes a date, as 2026-08-31." });
    expect(readValue(due, "2026-13-01")).toEqual({ error: "Ship by takes a date, as 2026-08-31." });
  });
});

describe("the data a form writes", () => {
  const fields = [
    field({ key: "client", type: "text" }),
    field({ key: "kind", type: "select", options: ["Bug"] }),
  ];

  it("keeps a value per declared field, and leaves an empty one out", () => {
    expect(readData(fields, form({ client: "Acme", kind: "" }))).toEqual({ data: { client: "Acme" } });
  });

  it("reads no field the org did not declare, so another org's key cannot land", () => {
    expect(readData(fields, form({ client: "Acme", trail: "Kumara Parvatha" }))).toEqual({
      data: { client: "Acme" },
    });
  });

  it("answers the first error, and writes nothing", () => {
    expect(readData(fields, form({ client: "Acme", kind: "Epic" }))).toEqual({
      error: "kind does not hold Epic.",
    });
  });
});
