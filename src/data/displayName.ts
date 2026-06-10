/**
 * data/displayName.ts — human-readable name helpers (Item 5).
 *
 * Records whose only identifier is a slug id (e.g. a relationship baked without
 * a generated name, or any record whose name fields are absent) must never be
 * shown to the user as a raw underscore slug like `rel_amalfi_byzantine`. These
 * helpers turn an id or a snake_case type token into a readable label.
 *
 * The relationship NAME itself ("Abbasid Caliphate – Fatimid Caliphate
 * (Rivalry)") is generated at BAKE time by scripts/build/bake-manifests.mjs,
 * which can resolve participant ids to polity names. These helpers are the
 * runtime LAST-RESORT fallback for any record that still reaches the UI with
 * only an id — they strip the leading kind prefix and title-case the remainder.
 */

/**
 * Leading kind prefixes used by record ids. Stripped before humanizing so an id
 * like `rel_amalfi_byzantine` becomes "Amalfi Byzantine" rather than
 * "Rel Amalfi Byzantine". Order does not matter (prefixes are distinct).
 */
const KIND_PREFIXES = [
  'rel_',
  'evt_',
  'jrn_',
  'cap_',
  'mil_',
  'stl_',
  'lang_',
  'claim_',
  'ann_',
  'rq_',
] as const;

/** Title-case a single token: "rivalry" → "Rivalry", "near" → "Near". */
function capitalize(word: string): string {
  if (!word) return '';
  return (word[0]?.toUpperCase() ?? '') + word.slice(1);
}

/**
 * Humanize a snake_case type token for display.
 * "dynastic_union" → "Dynastic Union"; "rivalry" → "Rivalry".
 */
export function humanizeType(type: string): string {
  if (!type) return '';
  return type.split('_').map(capitalize).join(' ');
}

/**
 * Humanize a snake_case enum value for a field label, with an em-dash fallback
 * for empty input. "governance_type" → "Governance Type"; "" → "—".
 * Shared by the entity tabs (replaces their per-file `humanise()` copies, which
 * only capitalized the first word — this title-cases every word consistently).
 */
export function humanizeLabel(s: string): string {
  if (!s) return '—';
  return humanizeType(s);
}

/**
 * Humanize a record id into a readable label as a LAST resort.
 * Strips a known leading kind prefix, then title-cases the remaining slug.
 * "rel_amalfi_byzantine" → "Amalfi Byzantine".
 * Ids with no known prefix are humanized as-is ("near_east" → "Near East").
 */
export function humanizeId(id: string): string {
  if (!id) return '';
  let slug = id;
  for (const prefix of KIND_PREFIXES) {
    if (slug.startsWith(prefix)) {
      slug = slug.slice(prefix.length);
      break;
    }
  }
  return slug.split('_').map(capitalize).join(' ');
}

/**
 * The minimal record shape this module needs — a name-bearing object with an id.
 * Kept structural (not the full RawRecord) so this low-level util has no import
 * dependency on the loaders module.
 */
interface NameableRecord {
  id: string;
  name_primary?: unknown;
  name?: unknown;
  title?: unknown;
  [key: string]: unknown;
}

/**
 * Single source of truth for a record's display name.
 * Fallback chain: name_primary → name → title → humanized id. Never returns a
 * raw slug. Replaces the per-file `displayName`/`recordDisplayName` duplicates.
 */
export function displayNameFromRecord(record: NameableRecord | null | undefined): string {
  if (!record) return '';
  const n = record.name_primary ?? record.name ?? record.title;
  return typeof n === 'string' && n ? n : humanizeId(record.id);
}
