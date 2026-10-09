/**
 * The org board's field filters: one select per field the org marks
 * filterable, each one more narrowing beside the search and the assignee
 * filter. Each rides in the query string under the name the task API reads,
 * `field.<key>`, so one address rule serves both. See ADR-0029.
 *
 * Only a field with a closed list of values draws a filter: a select reads its
 * options, and a reference reads its cached refs. A text or a date field has
 * no list to pick from, so it draws none, even when marked filterable.
 *
 * This module reads the address and answers one question about one task. The
 * board draws the selects in `board-chrome.tsx`, and what a board remembers
 * lives in `remembered.ts`.
 */

import { readValue, type OrgField } from "./fields";
import type { RefOption } from "./refs";
import { readTrimmed } from "./query";

/** What every field filter's name starts with, in the address and the task API. */
export const FIELD_PREFIX = "field.";

/** The name one field's filter rides under. */
export function fieldName(key: string): string {
  return `${FIELD_PREFIX}${key}`;
}

/**
 * The field key a name of the address narrows by, or null for a name that is
 * not a field filter. The board, its memory and the task API all read the
 * address through this.
 */
export function fieldKeyOf(name: string): string | null {
  return name.startsWith(FIELD_PREFIX) ? name.slice(FIELD_PREFIX.length) : null;
}

/** The fields the board draws a filter for, in the order the org declared them. */
export function filterableFields(fields: OrgField[]): OrgField[] {
  return fields.filter(
    (field) => field.filterable && (field.type === "select" || field.type === "reference"),
  );
}

/**
 * The values the address narrows by, as `field key → value`.
 *
 * Only a field that draws a filter is read, so a field the org stopped marking
 * filterable, or no longer declares, is ignored: an old link or a remembered
 * board still opens, and narrows by what the board still offers.
 */
export function readFieldValues(
  params: URLSearchParams,
  fields: OrgField[],
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const field of filterableFields(fields)) {
    const value = readTrimmed(params, fieldName(field.key));
    if (value) filters[field.key] = value;
  }
  return filters;
}

/**
 * True while the task holds every value the filters name. It is the task API's
 * rule, an exact match on the stored value, read over the data the board
 * already holds.
 */
export function keepsFields(
  filters: Record<string, string>,
  data: Record<string, string>,
): boolean {
  return Object.entries(filters).every(([key, value]) => data[key] === value);
}

/** One value a filter offers: what the address carries, and what a person reads. */
type Choice = { value: string; label: string };

/** What the top row draws one field's select with. */
export type FieldFilter = {
  key: string;
  label: string;
  /** The value the board narrows by. Empty is Any. */
  value: string;
  /** The values after Any, in the order the field holds them. */
  options: Choice[];
};

/**
 * The selects the top row draws, one per field that draws a filter.
 *
 * A select offers its options in the order the org declared them, and a
 * reference offers its cached refs in label order. A value the board narrows
 * by is always offered, even where the list no longer holds it: a select that
 * read Any over a narrowed board would hide the narrowing.
 */
export function filterSelects(
  fields: OrgField[],
  filters: Record<string, string>,
  refs: Record<string, RefOption[]>,
): FieldFilter[] {
  return filterableFields(fields).map((field) => {
    const options =
      field.type === "select"
        ? field.options.map((one) => ({ value: one, label: one }))
        : (refs[field.key] ?? []).map((one) => ({ value: one.id, label: one.label }));
    const value = filters[field.key] ?? "";
    if (value && !options.some((one) => one.value === value)) options.push({ value, label: value });
    return { key: field.key, label: field.label, value, options };
  });
}

/**
 * The values a quick add gives every task it makes: the board's active field
 * filters, which the box posts under the names the task page's form uses.
 *
 * Each one is checked against the org's declarations, as `readData` checks the
 * task page's form. A value the task cannot take is skipped, not refused: the
 * narrowing is a convenience, and the title is what the person typed. Only a
 * field that draws a filter is read, so the box can set nothing the board does
 * not offer.
 */
export function narrowedData(fields: OrgField[], form: FormData): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of filterableFields(fields)) {
    const read = readValue(field, form.get(fieldName(field.key)));
    if ("value" in read && read.value !== null) data[field.key] = read.value;
  }
  return data;
}
