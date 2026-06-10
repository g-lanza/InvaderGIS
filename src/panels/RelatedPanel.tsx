/**
 * RelatedPanel — "Related" + "Find similar" surface for the inspector dock.
 *
 * Two lists, both powered by the baked relationship adjacency map (loaded lazily):
 *   RELATED   — the selected entity's direct relationship neighbors, each shown
 *               with its relationship-type chips and a navigable link.
 *   SIMILAR   — other entities ranked by shared neighbors + relationship-type
 *               profile (similarTo), so the user can hop to structurally-alike
 *               polities they aren't directly tied to.
 *
 * Navigation reuses RelationshipLink → onNavigate → selectionStore.select, so a
 * click swaps the dock to the chosen record. Honest empty states throughout.
 *
 * DESIGN: reuses .panel / .panel-head / .chip; tokens only; legible in contrast.
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { loadAdjacency, relatedFor, similarTo, type AdjacencyMap } from '@/data/adjacency';
import { findRecordById } from '@/data/loaders';
import { humanizeType, displayNameFromRecord } from '@/data/displayName';
import { RelationshipLink } from '@/panels/RelationshipLink';

export interface RelatedPanelProps {
  /** The selected entity id (a polity / participant id). */
  id: string;
  /** Navigate callback (same one cards receive) → selectionStore.select. */
  onNavigate: (id: string, type: string) => void;
  /**
   * 'full'    — show both Directly-related and Similar lists (standalone use).
   * 'similar' — show only the Similar-profiles list (when the host already
   *             renders direct relationships, e.g. ConnectionsTab). Default 'full'.
   */
  variant?: 'full' | 'similar';
}

/** Resolve an id to its display name via the O(1) id index (humanized fallback). */
function polityName(id: string): string {
  return displayNameFromRecord(findRecordById(id)) || id;
}

/** A small relationship-type chip. */
function TypeChip({ type }: { type: string }): JSX.Element {
  return (
    <span
      className="chip mono"
      style={{ fontSize: '8px', whiteSpace: 'nowrap' }}
      title={humanizeType(type)}
    >
      {humanizeType(type)}
    </span>
  );
}

export function RelatedPanel({ id, onNavigate, variant = 'full' }: RelatedPanelProps): JSX.Element | null {
  const [map, setMap] = useState<AdjacencyMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAdjacency()
      .then((m) => { if (alive) setMap(m); })
      .catch((err) => {
        // Don't crash the dock — just hide the panel — but surface the cause once
        // (e.g. adjacency.json missing → run `npm run bake`).
        console.warn('[RelatedPanel] adjacency unavailable; hiding related/similar:', err);
        if (alive) setFailed(true);
      });
    return () => { alive = false; };
  }, []);

  const related = useMemo(() => (map ? relatedFor(map, id) : []), [map, id]);
  const similar = useMemo(() => (map ? similarTo(map, id, 6) : []), [map, id]);

  // Precompute each similar entity's shared-partner names once (was an O(n²)
  // loadRecords().find() inside the JSX .map title attribute).
  const sharedNamesById = useMemo(() => {
    const out = new Map<string, string>();
    for (const s of similar) out.set(s.id, s.sharedNeighbors.map(polityName).join(', '));
    return out;
  }, [similar]);

  const showRelated = variant === 'full';

  // Render nothing when there's nothing useful for this variant.
  if (failed) return null;
  if (map) {
    if (variant === 'similar' && similar.length === 0) return null;
    if (variant === 'full' && related.length === 0 && similar.length === 0) return null;
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-head__label">
          {variant === 'similar' ? 'Similar profiles' : 'Related & similar'}
        </span>
        {showRelated && related.length > 0 && <span className="chip mono">{related.length}</span>}
      </div>

      <div className="panel-body related-body">
        {/* ── Direct relationships (full variant only) ─────────────────── */}
        {showRelated && (
          <div>
            <div className="related-subhead">Directly related</div>
            {related.length === 0 ? (
              <div className="related-empty">No direct relationships.</div>
            ) : (
              <ul className="related-list">
                {related.slice(0, 12).map((n) => (
                  <li key={n.id} className="related-row">
                    <span className="related-row__name">
                      <RelationshipLink
                        targetId={n.id}
                        label={polityName(n.id)}
                        onNavigate={onNavigate}
                      />
                    </span>
                    <span className="related-row__chips">
                      {n.types.slice(0, 2).map((t) => <TypeChip key={t} type={t} />)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Similar entities (find similar) ──────────────────────────── */}
        {similar.length > 0 && (
          <div>
            <div
              className="related-subhead"
              title="Other entities tied to the same partners / similar relationship mix"
            >
              {variant === 'similar' ? 'Tied to the same partners' : 'Similar profiles'}
            </div>
            <ul className="related-list">
              {similar.map((s) => (
                <li key={s.id} className="related-row" style={{ alignItems: 'baseline' }}>
                  <span className="related-row__name">
                    <RelationshipLink
                      targetId={s.id}
                      label={polityName(s.id)}
                      onNavigate={onNavigate}
                    />
                  </span>
                  <span
                    className="mono related-row__shared"
                    title={`Shares ${s.sharedNeighbors.length} partner${s.sharedNeighbors.length === 1 ? '' : 's'}: ${sharedNamesById.get(s.id) ?? ''}`}
                  >
                    {s.sharedNeighbors.length} shared
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
