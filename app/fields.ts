/**
 * A field an org declares for its tasks. The value lives in the task's JSON
 * `data` column under `key`, so a new field needs no column and no code.
 *
 * This module holds the parts a form and a card both read, so the manage
 * screen, the task editor and the board all state one rule once.
 */

import { colorOf, type OptionColors } from "./colors";
import { isDay } from "./day";

/** The types Tusker renders. */
export const FIELD_TYPES = ["text", "select", "date", "reference"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** The word the manage screen puts on each type. */
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  select: "Select",
  date: "Date",
  reference: "Reference",
};

/**
 * One declaration, as every screen reads it. The row carries the org id.
 *
 * The refs key is missing on purpose. A loader hands this straight to the
 * browser, and the key opens the org app's data, so no screen ever holds it.
 * `has_refs_key` says whether the field carries one. `refs.server.ts` is the
 * one reader of the key itself, and it sends it to the org app.
 */
export type OrgField = {
  key: string;
  label: string;
  type: FieldType;
  /** The choices a select offers. Empty for the other types. */
  options: string[];
  /** Where a reference field reads its options from. Empty for the others. */
  source_url: string;
  /** True when a reference field holds the refs key it reads that URL with. */
  has_refs_key: boolean;
  /** When the options were last pulled, or null for a field never pulled. */
  refs_pulled_at: string | null;
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

/**
 * True for a source URL Tusker can call: an absolute http or https URL. A
 * relative one has no host to send the refs key to.
 */
export function isSourceUrl(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
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

  // A reference takes any id the org app could hold. The cache is a cache, so
  // an id newer than the last pull has to save, not fail.

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
export type Shown = { key: string; label: string; value: string; color: string | null };

/** The cached labels of the reference fields, as `field key → id → label`. */
export type RefLabels = Record<string, Record<string, string>>;

/**
 * What a screen shows for one stored value. A reference field stores an
 * external id, and the label is what a person reads.
 *
 * An id the cache does not hold shows raw. A blank would read as an empty
 * field, and the id is at least something a person can act on.
 */
export function shownValue(field: OrgField, value: string, labels: RefLabels = {}): string {
  if (field.type !== "reference") return value;
  return labels[field.key]?.[value] ?? value;
}

/**
 * What one card shows of one task: the marked fields the task holds a value
 * for. A field the task left empty takes no room on the card.
 */
export function shownOnCard(
  fields: OrgField[],
  data: Record<string, string>,
  labels: RefLabels = {},
  colors: OptionColors = {},
): Shown[] {
  return cardFields(fields)
    .filter((field) => data[field.key] !== undefined)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: shownValue(field, data[field.key], labels),
      // The colour hangs off the value the task holds, not off the field, so
      // one client reads apart from another. See ADR-0006.
      color: colorOf(colors, field.key, data[field.key]),
    }));
}

