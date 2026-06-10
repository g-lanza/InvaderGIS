/**
 * populationSources — extract the upstream sources backing a record's
 * population_estimates so they can be shown in the entity Sources tab.
 *
 * Population estimates carry their own per-point `sources[]` (wikidata QIDs,
 * wikipedia article labels) that are SEPARATE from provenance.sources_used /
 * provenance.external_ids. They used to be rendered as a raw-URL attribution
 * line on the Overview population chart; they now live in Sources as clickable
 * links. This module owns the "read population_estimates[].sources[]" knowledge.
 *
 * Honest: deduped, never fabricated — entries missing the fields needed to
 * identify them are dropped, not invented.
 */
import type { RawRecord } from '@/data/loaders';

/** A raw donor source object as it appears inside a population estimate. */
export interface DonorSource {
  type: 'wikidata' | 'wikipedia' | string;
  id?: string;
  url?: string;
  label?: string;
  statement?: string;
}

/** A deduped population source ready for display in the Sources tab. */
export interface PopulationSource {
  type: 'wikidata' | 'wikipedia' | string;
  id?: string;
  label?: string;
  url?: string;
}

/**
 * Collect the deduped set of population-estimate sources for a record.
 * Returns [] when the record has no population_estimates or none carry sources.
 * Dedup key: wikidata→`wd:<id>`, wikipedia→`wiki:<label>`, other→`<type>:<id|label|url>`.
 */
export function extractPopulationSources(record: RawRecord): PopulationSource[] {
  const raw = record['population_estimates'];
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: PopulationSource[] = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const sources = (item as Record<string, unknown>)['sources'];
    if (!Array.isArray(sources)) continue;

    for (const src of sources) {
      if (typeof src !== 'object' || src === null) continue;
      const s = src as DonorSource;

      if (s.type === 'wikidata' && s.id) {
        const key = `wd:${s.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: 'wikidata', id: s.id, url: s.url });
      } else if (s.type === 'wikipedia' && s.label) {
        const key = `wiki:${s.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: 'wikipedia', label: s.label, url: s.url });
      } else if (typeof s.type === 'string' && (s.id || s.label || s.url)) {
        // Unknown source type — keep it honestly, identified by whatever it has.
        const ident = s.id ?? s.label ?? s.url ?? '';
        const key = `${s.type}:${ident}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: s.type, id: s.id, label: s.label, url: s.url });
      }
    }
  }

  return out;
}
