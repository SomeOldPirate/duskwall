/**
 * Small factories for the fields every model uses.
 * @module duskwall/data/fields
 */

const fields = foundry.data.fields;

/** An integer with a floor and ceiling. */
export function int(initial = 0, min = 0, max = undefined) {
  return new fields.NumberField({ required: true, nullable: false, integer: true, initial, min, max });
}

/** A plain string, blank allowed. */
export function str(initial = "") {
  return new fields.StringField({ required: true, blank: true, initial });
}

/** A boolean. */
export function bool(initial = false) {
  return new fields.BooleanField({ initial });
}

/** Rich text. */
export function html() {
  return new fields.HTMLField({ required: true, blank: true, initial: "", textSearch: true });
}

/** A list of strings. */
export function strings() {
  return new fields.ArrayField(new fields.StringField({ required: true, blank: true }));
}

/** A person known to a scoundrel or crew. */
export function people() {
  return new fields.ArrayField(new fields.SchemaField({
    name: str(),
    role: str(),
    relation: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "friend", "rival"] })
  }));
}

/** Clamp a number into a range. */
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
