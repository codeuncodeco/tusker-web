/**
 * A field an org declares for its tasks. The value lives in the task's JSON
 * `data` column under `key`, so a new field needs no column and no code.
 *
 * This module holds the parts a form and a card both read, so the manage
 * screen, the task editor and the board all state one rule once.
 */

/** The types Tusker renders. A reference field comes later. */
export const FIELD_TYPES = ["text", "select", "date"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** The word the manage screen puts on each type. */
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  select: "Select",
  date: "Date",
};

/** One declaration, as every screen reads it. The row carries the org id. */
export type OrgField = {
  key: string;
  label: string;
  type: FieldType;
  /** The choices a select offers. Empty for the other types. */
  options: string[];
  show_on_card: boolean;
  filterable: boolean;
  position: number;
};

/** True when the value names a type Tusker renders. */
export function isFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

/**
 * The key a label makes: the name the JSON value hides behind. It holds
 * letters, numbers and underscores only, because a key is read in SQL as a
 * JSON path as well as in a form field name.
 */
export function fieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** The choices a select declares: one per line, each one once. */
export function readOptions(text: string): string[] {
  const lines = text
    .split("\n")
    .map((one) => one.trim())
    .filter(Boolean);
  return [...new Set(lines)];
}

/** A value the field takes, or the reason it does not. */
export type Reading = { value: string | null } | { error: string };

/** The date shape a date field holds, as SQLite and the browser both read it. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What one field makes of what a person typed. An empty answer is no value, so
 * clearing a box removes the key rather than writing an empty string.
 */
export function readValue(field: OrgField, raw: unknown): Reading {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { value: null };

  if (field.type === "select" && !field.options.includes(text)) {
    return { error: `${field.label} does not hold ${text}.` };
  }

  if (field.type === "date" && !isDay(text)) {
    return { error: `${field.label} takes a date, as 2026-08-31.` };
  }

  return { value: text };
}

/** The data a form writes for one task, or the first reason it cannot. */
export function readData(
  fields: OrgField[],
  form: FormData,
): { data: Record<string, string> } | { error: string } {
  const data: Record<string, string> = {};

  // Only a declared field is read, so a key another org declared can never
  // land in this org's task, whatever the form carries.
  for (const field of fields) {
    const read = readValue(field, form.get(`field.${field.key}`));
    if ("error" in read) return read;
    if (read.value !== null) data[field.key] = read.value;
  }

  return { data };
}

/** The fields a card shows, in the order the org declared them. */
export function cardFields(fields: OrgField[]): OrgField[] {
  return fields.filter((field) => field.show_on_card);
}

/** One custom field value, as a card shows it. */
export type Shown = { key: string; label: string; value: string };

/**
 * What one card shows of one task: the marked fields the task holds a value
 * for. A field the task left empty takes no room on the card.
 */
export function shownOnCard(fields: OrgField[], data: Record<string, string>): Shown[] {
  return cardFields(fields)
    .filter((field) => data[field.key] !== undefined)
    .map((field) => ({ key: field.key, label: field.label, value: data[field.key] }));
}

/** True for a date a calendar holds, so 2026-13-01 is not one. */
function isDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
