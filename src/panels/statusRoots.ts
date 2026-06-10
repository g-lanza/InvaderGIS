/**
 * statusRoots — DISPLAY-ONLY mapping of provenance/source `status` values to the
 * etymological root each English term descends from.
 *
 * IMPORTANT (realness + safety law):
 *   - This NEVER changes stored data. The JSON records keep their canonical
 *     status values ('draft' | 'community' | 'reviewed' | 'disputed' | …), and all
 *     program logic (ProvenanceBlock weak/strong styling, `=== 'draft'` checks,
 *     the `sl-status--<value>` CSS class, the TS `Provenance.status` union) keeps
 *     using those raw values. Only the human-visible LABEL is rewritten.
 *   - Applied at the display layer (register Status columns, SourceCard /
 *     PolityCard / ProvenanceBlock chips, SourcesLibrary rows). Reversible by
 *     deleting this module's use — no data migration involved.
 *
 * Etymology (the root each modern word grew from):
 *   draft        ← Old English  dragan      ("to draw / pull"; draught → draft)
 *   community    ← Latin        communitas  ("fellowship, shared possession")
 *   verified     ← Latin        verus       ("true"; → verificare)
 *   reviewed     ← Latin        revidere    ("to see again"; re- + videre)
 *   disputed     ← Latin        disputare   ("to weigh, discuss"; dis- + putare)
 *   open         ← Old English  open / opan ("not closed")
 *   in_progress  ← Latin        progredi    ("to step forward"; pro- + gradi)
 */

/** Canonical status value → its etymological-root display form. */
const STATUS_ROOTS: Readonly<Record<string, string>> = {
  draft: 'dragan',
  community: 'communitas',
  verified: 'verus',
  reviewed: 'revidere',
  disputed: 'disputare',
  open: 'opan',
  in_progress: 'progredi',
};

/**
 * Map a raw status value to its etymological-root display label.
 *
 * Matching is case-insensitive on the canonical value. Unknown values pass
 * through unchanged (honest: never invent a root for a value we don't recognise).
 * Empty / placeholder values ('', '—') pass through untouched.
 *
 * @param raw - the canonical status string straight off the record
 * @returns the root display form, or the input unchanged when unmapped
 */
export function statusRootLabel(raw: string): string {
  if (!raw || raw === '—') return raw;
  const root = STATUS_ROOTS[raw.toLowerCase()];
  return root ?? raw;
}
